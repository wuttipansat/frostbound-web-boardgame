// A simple rule-based bot for empty seats. Pure: returns an action, never mutates state.
// opts.random: () => number in [0,1). When opts.chaos > 0, the bot picks randomly among
// candidate actions with that probability (used by fuzz tests to explore odd paths).
import * as act from '../core/actions.js';
import { PHASES, OUTSIDE_LOCATIONS, ENERGY, RULES } from '../core/constants.js';
import { gearSlot } from '../content/items.js';
import {
  getPlayer, aliveSurvivorsOf, survivorDef, itemOf, crisisDef, objectiveDef, scenarioDef,
  freeSurvivorSlots, freeZombieSlots, foodNeeded, actionCost, dangerCounts, spawnForecast, crisisRequirement, gearOf,
} from '../core/selectors.js';
import { CROSSROADS_BY_ID } from '../content/crossroads.js';

const EFFECT_SCORE = {
  morale: (e) => 3 * e.delta, food: (e) => e.delta, helpless: (e) => 1.5 * e.delta,
  waste: (e) => -0.3 * e.delta, spawn: (e) => -1.2 * e.n, removeZombies: (e) => e.n,
  barricade: (e) => 0.8 * e.n, drawItem: (e) => e.n, discard: (e) => -0.8 * e.n,
  wound: () => -2, heal: () => 1.5, exposure: () => -1.5, energy: (e) => e.delta / 20,
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
  // `cooperative`: suggest moves for a human (step 18 hints) without ever playing as a betrayer.
  const isBetrayer = !opts.cooperative && objectiveDef(p.objectiveId)?.kind === 'betrayer';

  // Answer pending requests addressed to us first (any phase).
  const req = s.requests.find((r) => r.to === playerId);
  if (req && s.phase !== PHASES.VOTE) {
    const give = p.hand.find((u) => !req.itemType || itemOf(s, u).type === req.itemType);
    return act.respondRequest(playerId, req.id, !isBetrayer && opts.random() < 0.5 ? give ?? null : null);
  }

  switch (s.phase) {
    case PHASES.DRAFT: {
      // Best skills (low attack / search costs) and a big energy pool.
      const rank = (id) => { const d = survivorDef(id); return d.attack + d.search - (d.energy + d.regen) / 25; };
      const ranked = p.draftOptions.slice().sort((a, b) => rank(a) - rank(b));
      const n = RULES.SURVIVORS_PER_PLAYER;
      const picks = opts.chaos && opts.random() < opts.chaos ? ranked.slice(-n) : ranked.slice(0, n);
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
      if (match && mine < Math.max(2, crisisRequirement(s) - 1)) candidates.push(act.contribute(pid, match));
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

  // Gear: wear what you find (an empty slot, or a better tier).
  for (const uid of p.hand) {
    const item = itemOf(s, uid);
    const slot = gearSlot(item);
    if (!slot) continue;
    const worn = gearOf(s, pid)[slot];
    if (!worn || item.tier > worn.tier) { candidates.unshift(act.equip(pid, uid)); break; }
  }

  // Newcomers lift morale (but eat): take them in while the larder holds.
  const recruit = cardsOf('survivor')[0];
  if (recruit && !isBetrayer && !p.exiled && s.food >= foodNeeded(s)) candidates.push(act.playCard(pid, recruit));

  energyActions(s, p, survivors, candidates, cardsOf, isBetrayer, opts);
  return pickOne(candidates, opts) ?? act.endTurn(pid);
}

/** Chance the next danger card is a bite (public counts only). */
export function biteOdds(s) {
  const c = dangerCounts(s) ?? {};
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  return total ? (c.bite ?? 0) / total : 0;
}

/**
 * Value per energy. Fight crowds, scavenge, hold the
 * colony against the forecast, then walk (to empty places when possible, home when hurt).
 */
function energyActions(s, p, survivors, candidates, cardsOf, isBetrayer, opts) {
  const pid = p.id;
  const can = (sv, kind, to) => p.energy >= actionCost(s, sv.id, kind, to);
  const forecast = spawnForecast(s);
  const armed = !!gearOf(s, pid).weapon;

  for (const sv of survivors) {
    const loc = s.locations[sv.location];
    const safeFight = armed || survivorDef(sv.id).ability.type === 'noAttackExposure';
    // 2. Thin out crowds (bare-handed only when it really matters).
    const hunt = scenarioDef(s).goal.type === 'kills' && sv.wounds < 2;
    if (loc.zombies > 0 && can(sv, 'attack') && hunt) candidates.push(act.attack(pid, sv.id));
    if (loc.zombies >= 2 && can(sv, 'attack') && (safeFight || loc.zombies >= 3)) candidates.push(act.attack(pid, sv.id));
    // 3. Scavenge.
    if (sv.location !== 'colony' && loc.deck.length && can(sv, 'search')) candidates.push(act.search(pid, sv.id));
    if (loc.zombies > 0 && can(sv, 'attack') && safeFight) candidates.push(act.attack(pid, sv.id));
  }
  for (const sv of survivors) {
    const loc = s.locations[sv.location];
    // 4. Hold the colony against tonight's zombies; clean when it smells.
    if (freeZombieSlots(s, sv.location) > 0 && can(sv, 'barricade')
      && ((sv.location === 'colony' && (forecast.colony ?? 0) > s.locations.colony.barricades) || loc.zombies > 0)) {
      candidates.push(act.barricade(pid, sv.id));
    }
    if (sv.location === 'colony' && s.waste >= 4 && can(sv, 'clean')) candidates.push(act.clean(pid, sv.id));
    if (isBetrayer && loc.zombies > 0 && sv.location !== 'colony' && can(sv, 'lure')) candidates.push(act.lure(pid, sv.id, 'colony'));
  }
  // 5. Walk: hurt, done, or carrying the goal home → colony; idle in the colony → out to a stocked place.
  const goal = scenarioDef(s).goal;
  const carrying = goal.type === 'deposit' && !isBetrayer ? cardsOf(goal.item).length : 0;
  const lateRound = s.round >= s.scenario.rounds - 1;
  for (const sv of survivors) {
    const loc = s.locations[sv.location];
    const bringHome = carrying >= 2 || (carrying >= 1 && lateRound);
    if (sv.location !== 'colony' && !p.exiled && (sv.wounds >= 2 || !loc.deck.length || bringHome) && can(sv, 'move', 'colony')) {
      candidates.push(act.move(pid, sv.id, 'colony', s.locations.colony.zombies ? cardsOf('fuel')[0] : undefined));
    } else if (goal.type === 'kills' && sv.wounds < 2 && !isBetrayer) {
      // Hunting: go where the dead are thickest (a weapon makes it safe and cheap).
      const prey = OUTSIDE_LOCATIONS.concat(p.exiled ? [] : ['colony']).filter((l) => l !== sv.location && s.locations[l].zombies >= 2
        && freeSurvivorSlots(s, l) > 0 && p.energy >= actionCost(s, sv.id, 'move', l) + actionCost(s, sv.id, 'attack'))
        .sort((a, b) => s.locations[b].zombies - s.locations[a].zombies)[0];
      if (prey && loc.zombies === 0) candidates.push(act.move(pid, sv.id, prey));
      else if (sv.location === 'colony') pushOut(sv);
    } else if (sv.location === 'colony' && sv.wounds < 2) {
      pushOut(sv);
    }
  }
  function pushOut(sv) {
    {
      const options = OUTSIDE_LOCATIONS.filter((l) => freeSurvivorSlots(s, l) > 0 && s.locations[l].deck.length && can(sv, 'move', l));
      // Food short (or stockpiling) → the grocery first; hunting → where the zombies are.
      const hungry = s.food < foodNeeded(s) + 2 || scenarioDef(s).goal.type === 'stockpile';
      const hunting = scenarioDef(s).goal.type === 'kills';
      const score = (l) => (hunting ? -s.locations[l].zombies * 2 : s.locations[l].zombies) - (hungry && l === 'grocery' ? 3 : 0);
      options.sort((a, b) => score(a) - score(b) || opts.random() - 0.5);
      const def = survivorDef(sv.id);
      const preferred = def.ability.type === 'doubleSearch' && options.includes(def.ability.location) ? def.ability.location : options[0];
      // Leave enough energy to search when we get there.
      if (preferred && p.energy >= actionCost(s, sv.id, 'move', preferred) + ENERGY.SEARCH_BASE + ENERGY.PER_SKILL * def.search) candidates.push(act.move(pid, sv.id, preferred));
    }
  }
  // 6. Junk is energy now.
  const junk = cardsOf('junk')[0];
  if (junk && p.energy < 30) candidates.push(act.playCard(pid, junk));
}
