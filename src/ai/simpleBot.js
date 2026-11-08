// A simple rule-based bot for empty seats. Pure: returns an action, never mutates state.
// opts.random: () => number in [0,1). When opts.chaos > 0, the bot picks randomly among
// candidate actions with that probability (used by fuzz tests to explore odd paths).
import * as act from '../core/actions.js';
import { PHASES, OUTSIDE_LOCATIONS } from '../core/constants.js';
import {
  getPlayer, aliveSurvivorsOf, survivorDef, itemOf, crisisDef, objectiveDef, scenarioDef,
  freeSurvivorSlots, freeZombieSlots, foodNeeded,
} from '../core/selectors.js';
import { CROSSROADS_BY_ID } from '../content/crossroads.js';

const EFFECT_SCORE = {
  morale: (e) => 3 * e.delta, food: (e) => e.delta, helpless: (e) => 1.5 * e.delta,
  waste: (e) => -0.3 * e.delta, spawn: (e) => -1.2 * e.n, removeZombies: (e) => e.n,
  barricade: (e) => 0.8 * e.n, drawItem: (e) => e.n, discard: (e) => -0.8 * e.n,
  wound: () => -2, heal: () => 1.5, exposure: () => -1.5, gainDie: (e) => e.n, loseDie: (e) => -e.n,
  moveHome: () => 0.5, starvation: (e) => -3 * e.delta,
};

function scoreChoice(choice, betrayer) {
  const sc = choice.effects.reduce((sum, e) => sum + (EFFECT_SCORE[e.type]?.(e) ?? 0), 0);
  return betrayer ? -sc : sc;
}

function pickOne(list, opts) {
  if (!list.length) return null;
  if (opts.chaos && opts.random() < opts.chaos) return list[Math.floor(opts.random() * list.length)];
  return list[0];
}

export function botAction(s, playerId, opts = {}) {
  opts = { random: Math.random, chaos: 0, ...opts };
  const p = getPlayer(s, playerId);
  const isBetrayer = objectiveDef(p.objectiveId)?.kind === 'betrayer';

  // Answer pending requests addressed to us first (any phase).
  const req = s.requests.find((r) => r.to === playerId);
  if (req && s.phase !== PHASES.VOTE) {
    const give = p.hand.find((u) => !req.itemType || itemOf(s, u).type === req.itemType);
    return act.respondRequest(playerId, req.id, !isBetrayer && opts.random() < 0.5 ? give ?? null : null);
  }

  switch (s.phase) {
    case PHASES.DRAFT: {
      const ranked = p.draftOptions.slice().sort((a, b) => {
        const da = survivorDef(a); const db = survivorDef(b);
        return (da.attack + da.search) - (db.attack + db.search);
      });
      const picks = opts.chaos && opts.random() < opts.chaos ? ranked.slice(-2) : ranked.slice(0, 2);
      return act.draftPick(playerId, picks);
    }
    case PHASES.CROSSROADS: {
      const card = CROSSROADS_BY_ID[s.pendingCrossroads.cardId];
      const scores = card.choices.map((c) => scoreChoice(c, isBetrayer));
      let choice = scores[1] > scores[0] ? 1 : 0;
      if (opts.chaos && opts.random() < opts.chaos) choice = opts.random() < 0.5 ? 0 : 1;
      return act.resolveCrossroads(playerId, choice);
    }
    case PHASES.VOTE: {
      let yes;
      if (opts.chaos) yes = opts.random() < 0.5;
      else if (isBetrayer) yes = true; // any exile weakens the colony
      else {
        // Loyal bots read the public record: who keeps feeding cards into crises that then fail?
        const sus = suspicion(s)[s.vote.targetId] ?? 0;
        yes = sus >= 2 || (sus >= 1 && s.morale <= 4) || opts.random() < 0.15;
      }
      return act.castVote(playerId, yes);
    }
    case PHASES.TURN:
      return turnAction(s, p, isBetrayer, opts);
    default:
      return null;
  }
}

/**
 * Public suspicion score per player: contributions made in rounds whose crisis failed,
 * minus those in rounds whose crisis succeeded. Uses only information every player can see.
 */
export function suspicion(s) {
  const score = {};
  let round = {};
  for (const e of s.log) {
    if (e.k === 'contribute') round[e.playerId] = (round[e.playerId] ?? 0) + 1;
    if (e.k === 'crisisResolved') {
      for (const [pid, n] of Object.entries(round)) score[pid] = (score[pid] ?? 0) + (e.success ? -n : n);
      round = {};
    }
  }
  return score;
}

function turnAction(s, p, isBetrayer, opts) {
  const pid = p.id;
  const candidates = [];
  const survivors = aliveSurvivorsOf(s, pid);
  const crisis = crisisDef(s);
  const cardsOf = (type) => p.hand.filter((u) => itemOf(s, u).type === type);

  // Blueprint search: put back the weakest card (lowest tier, then lowest value).
  if (p.pick) {
    const rank = (u) => itemOf(s, u).tier * 10 + itemOf(s, u).value;
    const worst = [...p.pick.uids].sort((a, b) => rank(a) - rank(b))[0];
    return act.returnCard(pid, worst);
  }

  // Chaos-only social actions.
  if (opts.chaos && opts.random() < 0.02 && p.lastVoteRound !== s.round) {
    const targets = s.players.filter((o) => o.id !== pid && !o.exiled);
    if (targets.length) return act.callVote(pid, targets[Math.floor(opts.random() * targets.length)].id);
  }
  if (opts.chaos && opts.random() < 0.03) {
    const others = s.players.filter((o) => o.id !== pid);
    return act.requestItem(pid, others[Math.floor(opts.random() * others.length)].id, null);
  }

  // Crisis contribution.
  if (crisis && !p.exiled) {
    const mine = s.crisis.contributions.filter((c) => c.playerId === pid).length;
    if (!isBetrayer) {
      const match = cardsOf(crisis.item)[0];
      if (match && mine < 2) candidates.push(act.contribute(pid, match));
    } else if (mine === 0) {
      const junk = p.hand.find((u) => itemOf(s, u).type !== crisis.item);
      if (junk && opts.random() < 0.6) candidates.push(act.contribute(pid, junk));
    }
  }

  // Scenario deposit.
  const goal = scenarioDef(s).goal;
  if (goal.type === 'deposit' && !p.exiled && !isBetrayer && survivors.some((sv) => sv.location === 'colony')) {
    const keepForCrisis = crisis?.item === goal.item ? 1 : 0;
    const fuel = cardsOf(goal.item);
    if (fuel.length > keepForCrisis) candidates.push(act.deposit(pid, fuel[fuel.length - 1]));
  }

  // Food if the colony is short.
  if (!p.exiled && !isBetrayer && s.food < foodNeeded(s) + (goal.type === 'stockpile' ? 99 : 0)) {
    const food = cardsOf('food').filter((u) => crisis?.item !== 'food' || cardsOf('food').length > 1);
    if (food[0]) candidates.push(act.playCard(pid, food[0]));
  }

  // Heal.
  const hurt = survivors.find((sv) => sv.wounds > 0 || sv.frostbite);
  if (hurt && cardsOf('medicine')[0] && crisis?.item !== 'medicine') {
    candidates.push(act.playCard(pid, cardsOf('medicine')[0], { targetSurvivorId: hurt.id }));
  }
  const healer = survivors.find((sv) => survivorDef(sv.id).ability.type === 'healer' && !p.abilityUsed[sv.id]);
  if (healer) {
    const target = Object.values(s.survivors).find((o) => o.alive && o.location === healer.location && (o.wounds > 0 || o.frostbite));
    if (target) candidates.push(act.useAbility(pid, healer.id, target.id));
  }

  // Weapons kill without exposure (permanent: each once per turn; long guns reach any location).
  for (const weapon of cardsOf('weapon').filter((u) => !(p.usedCards ?? []).includes(u))) {
    if (itemOf(s, weapon).range === 'any') {
      const where = Object.keys(s.locations).filter((l) => s.locations[l].zombies > 0)
        .sort((a, b) => s.locations[b].zombies - s.locations[a].zombies)[0];
      if (where && survivors.length) candidates.push(act.playCard(pid, weapon, { targetLocation: where }));
    } else {
      const sv = survivors.find((x) => s.locations[x.location].zombies > 0);
      if (sv) candidates.push(act.playCard(pid, weapon, { targetSurvivorId: sv.id }));
    }
  }

  // Recruit survivors found out there.
  const recruit = cardsOf('survivor')[0];
  if (recruit && s.survivorDeck.length && !isBetrayer) candidates.push(act.playCard(pid, recruit));

  // Die actions, highest dice first.
  const dice = p.dice.map((d, i) => ({ ...d, i })).filter((d) => !d.used).sort((a, b) => b.v - a.v);
  for (const d of dice) {
    for (const sv of survivors) {
      const def = survivorDef(sv.id);
      const loc = s.locations[sv.location];
      const canAttack = loc.zombies > 0 && d.v >= def.attack;
      const canSearch = sv.location !== 'colony' && loc.deck.length && d.v >= def.search;
      // Prefer scavenging unless zombies are piling up.
      if (canAttack && loc.zombies >= 2) candidates.push(act.attack(pid, sv.id, d.i));
      if (canSearch) candidates.push(act.search(pid, sv.id, d.i));
      if (canAttack && loc.zombies < 2) candidates.push(act.attack(pid, sv.id, d.i));
    }
  }
  const lowDie = dice[dice.length - 1];
  if (lowDie) {
    for (const sv of survivors) {
      if (sv.location === 'colony' && s.waste >= 3) candidates.push(act.clean(pid, sv.id, lowDie.i));
      if (freeZombieSlots(s, sv.location) > 0 && (sv.location === 'colony' || s.locations[sv.location].zombies > 0)) {
        candidates.push(act.barricade(pid, sv.id, lowDie.i));
      }
      if (isBetrayer && s.locations[sv.location].zombies > 0 && sv.location !== 'colony') {
        candidates.push(act.lure(pid, sv.id, lowDie.i, 'colony'));
      }
    }
  }

  // Movement: send colony survivors out to scavenge, bring the badly hurt home.
  for (const sv of survivors) {
    if (sv.moved) continue;
    const def = survivorDef(sv.id);
    if (sv.location !== 'colony' && (sv.wounds >= 2 || !s.locations[sv.location].deck.length) && !p.exiled) {
      candidates.push(act.move(pid, sv.id, 'colony', cardsOf('fuel')[0]));
    } else if (sv.location === 'colony' && opts.random() < 0.7) {
      const options = OUTSIDE_LOCATIONS.filter((l) => freeSurvivorSlots(s, l) > 0 && s.locations[l].deck.length);
      if (options.length) {
        const preferred = def.ability.type === 'doubleSearch' && options.includes(def.ability.location)
          ? def.ability.location : options[Math.floor(opts.random() * options.length)];
        candidates.push(act.move(pid, sv.id, preferred));
      }
    } else if (p.exiled && opts.chaos && opts.random() < 0.3) {
      const options = OUTSIDE_LOCATIONS.filter((l) => l !== sv.location && freeSurvivorSlots(s, l) > 0);
      if (options.length) candidates.push(act.move(pid, sv.id, options[0]));
    }
  }

  // Junk reroll of the lowest die.
  const junk = cardsOf('junk')[0];
  if (junk && lowDie && lowDie.v <= 2 && opts.random() < 0.5) {
    candidates.push(act.playCard(pid, junk, { dieIndex: lowDie.i }));
  }

  return pickOne(candidates, opts) ?? act.endTurn(pid);
}
