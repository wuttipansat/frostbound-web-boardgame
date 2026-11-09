import { tryReduce } from '../core/reducer.js';
// A simple rule-based bot that plays the solo team. Pure: returns an action, never mutates state.
// Used for the next-move hint, headless simulation tests and balance runs.
// opts.random: () => number in [0,1). When opts.chaos > 0, the bot picks randomly among
// candidate actions with that probability (used by fuzz tests to explore odd paths).
import * as act from '../core/actions.js';
import { PHASES, OUTSIDE_LOCATIONS, ENERGY, RULES } from '../core/constants.js';
import { gearSlot, ITEMS } from '../content/items.js';
import {
  aliveSurvivors, survivorDef, itemOf, crisisDef, scenarioDef,
  freeSurvivorSlots, freeZombieSlots, foodNeeded, actionCost, fightPreview, siegeForecast, placeOfItem, packFree, leaveDamage, spawnForecast, crisisRequirement, crisisScore, gearOf,
} from '../core/selectors.js';
import { CROSSROADS_BY_ID } from '../content/crossroads.js';
import { LOCATIONS } from '../content/locations.js';
import { CRAWLER } from '../content/buildings.js';

/** Item ids still missing (at the colony) for the next crawler stage. */
function crawlerWants(s) {
  if (s.scenario.id !== 'crawler') return [];
  const lv = s.base?.crawler ?? 0;
  if (lv >= CRAWLER.levels.length || s.building?.crawler != null) return [];
  const needs = CRAWLER.levels[lv].needs;
  return Object.keys(needs).filter((id) => s.stockpile.filter((u) => s.cards[u] === id).length < needs[id]);
}

const EFFECT_SCORE = {
  morale: (e) => 3 * e.delta, food: (e) => e.delta, recruit: () => 2,
  spawn: (e) => -1.2 * e.n, removeZombies: (e) => e.n,
  barricade: (e) => 0.8 * e.n, drawItem: (e) => e.n, discard: (e) => -0.8 * e.n,
  wound: () => -2, heal: () => 1.5, energy: (e) => e.delta / 20,
  moveHome: () => 0.5, starvation: (e) => -3 * e.delta,
};

function scoreChoice(choice) {
  return choice.effects.reduce((sum, e) => sum + (EFFECT_SCORE[e.type]?.(e) ?? 0), 0);
}

function pickOne(list, opts) {
  if (!list.length) return null;
  if (opts.chaos && opts.random() < opts.chaos) return list[Math.floor(opts.random() * list.length)];
  return list[0];
}

/** The bot's next action for the solo team (used for hints, tests and balance runs). */
export function botAction(s, opts = {}) {
  opts = { random: Math.random, chaos: 0, ...opts };
  const p = s.team;
  switch (s.phase) {
    case PHASES.DRAFT: {
      // Best skills (low attack / search costs) and a big energy pool.
      const rank = (id) => { const d = survivorDef(id); return d.attack + d.search - d.energy / 25; };
      const ranked = p.draftOptions.slice().sort((a, b) => rank(a) - rank(b));
      const n = RULES.TEAM_START;
      const picks = opts.chaos && opts.random() < opts.chaos ? ranked.slice(-n) : ranked.slice(0, n);
      return act.draftPick(picks);
    }
    case PHASES.CROSSROADS: {
      const card = CROSSROADS_BY_ID[s.pendingCrossroads.cardId];
      const scores = card.choices.map((c) => scoreChoice(c));
      let choice = scores[1] > scores[0] ? 1 : 0;
      if (opts.chaos && opts.random() < opts.chaos) choice = opts.random() < 0.5 ? 0 : 1;
      return act.resolveCrossroads(choice);
    }
    case PHASES.TURN:
      return turnAction(s, p, opts);
    default:
      return null;
  }
}

function turnAction(s, p, opts) {
  const candidates = [];
  const survivors = aliveSurvivors(s);
  const crisis = crisisDef(s);
  const items = [...s.stockpile, ...survivors.flatMap((sv) => sv.pack ?? [])];
  const cardsOf = (type) => items.filter((u) => itemOf(s, u).type === type);

  // Blueprint search: put back the weakest card (lowest tier, then lowest value).
  if (p.pick) {
    const rank = (u) => itemOf(s, u).tier * 10 + itemOf(s, u).value;
    const worst = [...p.pick.uids].sort((a, b) => rank(a) - rank(b))[0];
    return act.returnCard(worst);
  }

  // Crisis contribution.
  if (crisis) {
    const added = s.crisis.contributions.length;
    const keep = s.scenario.id === 'crawler' ? [...crawlerWants(s), 'engine-part', 'heater-part'] : [];
    const match = cardsOf(crisis.item).find((u) => !keep.includes(s.cards[u])) ?? items.find((u) => itemOf(s, u).counts === crisis.item && !keep.includes(s.cards[u]));
    if (match && crisisScore(s) < crisisRequirement(s) + 1 && added < 6) candidates.push(act.contribute(match));
  }

  // Scenario deposit.
  const goal = scenarioDef(s).goal;
  if (goal.type === 'deposit' && survivors.some((sv) => sv.location === 'colony')) {
    const keepForCrisis = crisis?.item === goal.item ? 1 : 0;
    const fuel = cardsOf(goal.item);
    if (fuel.length > keepForCrisis) candidates.push(act.deposit(fuel[fuel.length - 1]));
  }

  // Food if the colony is short.
  if (s.food < foodNeeded(s) + (goal.type === 'stockpile' ? 99 : 0)) {
    const food = cardsOf('food').filter((u) => crisis?.item !== 'food' || cardsOf('food').length > 1);
    if (food[0]) candidates.push(act.playCard(food[0]));
  }

  // Heal.
  const hurt = survivors.find((sv) => sv.wounds > 0 || sv.frostbite);
  if (hurt && cardsOf('medicine')[0] && crisis?.item !== 'medicine') {
    candidates.push(act.playCard(cardsOf('medicine')[0], { targetSurvivorId: hurt.id }));
  }
  const healer = survivors.find((sv) => survivorDef(sv.id).ability.type === 'healer' && !p.abilityUsed[sv.id]);
  if (healer) {
    const target = Object.values(s.survivors).find((o) => o.alive && o.location === healer.location && (o.wounds > 0 || o.frostbite));
    if (target) candidates.push(act.useAbility(healer.id, target.id));
  }

  // Gear: wear what you find (an empty slot, or a better tier).
  for (const uid of items) {
    const item = itemOf(s, uid);
    const slot = gearSlot(item);
    if (!slot) continue;
    const at = placeOfItem(s, uid);
    const who = survivors.find((sv) => { const w = gearOf(s, sv.id)[slot]; return sv.location === at && (!w || item.tier > w.tier); });
    if (who) { candidates.unshift(act.equip(uid, who.id)); break; }
  }

  // Consumables: heal, wake up, reload, burn crowds (illegal ones are filtered out).
  for (const uid of cardsOf('consumable')) {
    const u = itemOf(s, uid).use;
    const at = placeOfItem(s, uid);
    for (const sv of survivors.filter((x) => x.location === at)) {
      const want = (u.hp && sv.hp <= 100 - u.hp) || (u.ap && !u.hp && sv.ap < 25) || u.ammo
        || (u.burn && s.locations[sv.location].zombies >= 2);
      if (want) candidates.push(act.playCard(uid, { targetSurvivorId: sv.id }));
    }
  }
  // Build: one survivor at home with spare AP works on the most useful upgrade it can.
  const builder = survivors.find((sv) => sv.location === 'colony' && sv.ap >= 10 && sv.ap < 40 && !sv.napped); // leftovers only: building takes all the AP they have
  // The snow crawler is the win: anyone at home works on it as soon as the next stage's materials are in.
  const crawlerSv = s.scenario.id === 'crawler' && survivors.find((sv) => sv.location === 'colony' && sv.ap >= 10 && !sv.napped);
  if (crawlerSv) candidates.unshift(act.build('crawler', crawlerSv.id));
  const saving = s.scenario.id === 'crawler' && crawlerWants(s).some((id) => ['wood', 'scrap', 'cloth'].includes(id)) || (s.scenario.id === 'crawler' && (s.base?.crawler ?? 0) === 0);
  if (builder && !saving) for (const b of ['workshop', 'dorm', 'greenhouse', 'wall', 'infirmary', 'radio']) candidates.push(act.build(b, builder.id));
  // Craft at home when the materials are there.
  const crafter = survivors.find((sv) => sv.location === 'colony' && sv.ap >= 20);
  if (crafter && !saving && s.food >= foodNeeded(s)) for (const rid of ['scrap-plate', 'sled', 'baseball-bat', 'bandage']) candidates.push(act.craft(rid, crafter.id));

  // Newcomers lift morale (but eat): take them in while the larder holds.
  const recruit = cardsOf('survivor')[0];
  if (recruit && s.food >= foodNeeded(s) * 4) candidates.push(act.playCard(recruit));

  energyActions(s, p, survivors, candidates, cardsOf, opts);
  return pickOne(candidates.filter((c) => tryReduce(s, c).ok), opts) ?? act.endTurn();
}

/**
 * Value per energy. Fight crowds, scavenge, hold the
 * colony against the forecast, then walk (to empty places when possible, home when hurt).
 */
function energyActions(s, p, survivors, candidates, cardsOf, opts) {
  const can = (sv, kind, to) => {
    if (sv.napped || sv.ap < actionCost(s, sv.id, kind, to)) return false;
    if (kind === 'move' && leaveDamage(s, sv.id) >= sv.hp - 10) return false; // walking out would kill them
    if (kind !== 'attack') return true;
    // Fight only when it is safe enough: a loaded gun, or a melee hit that leaves plenty of HP.
    const f = fightPreview(s, sv.id);
    return f.gun ? f.ammo > 0 : f.hp < sv.hp - 25;
  };
  const forecast = spawnForecast(s);

  // 1. Home before dark: out there with only enough AP to walk back (or a full pack) → go home first.
  for (const sv of survivors) {
    if (sv.location === 'colony' || sv.napped) continue;
    const home = actionCost(s, sv.id, 'move', 'colony');
    if (sv.ap >= home && (sv.ap < home + ENERGY.SEARCH || packFree(s, sv.id) === 0 || sv.hp < 45)) candidates.push(act.move(sv.id, 'colony'));
  }
  for (const sv of survivors) {
    const loc = s.locations[sv.location];
    // 2. Thin out crowds.
    const hunt = scenarioDef(s).goal.type === 'kills' && sv.wounds < 2;
    if (loc.zombies > 0 && can(sv, 'attack') && hunt) candidates.push(act.attack(sv.id));
    if (loc.zombies >= 2 && can(sv, 'attack') && true) candidates.push(act.attack(sv.id));
    // 3. Scavenge.
    if (sv.location !== 'colony' && loc.deck.length && can(sv, 'search')) candidates.push(act.search(sv.id));
    if (loc.zombies > 0 && can(sv, 'attack')) candidates.push(act.attack(sv.id));
  }
  for (const sv of survivors) {
    const loc = s.locations[sv.location];
    // 4. Hold the colony against tonight's zombies.
    if (freeZombieSlots(s, sv.location) > 0 && can(sv, 'barricade')
      && ((sv.location === 'colony' && siegeForecast(s).hits > 0) || loc.zombies > 0)) {
      candidates.push(act.barricade(sv.id));
    }
  }
  // 5. Walk: hurt, done, or carrying the goal home → colony; idle in the colony → out to a stocked place.
  const goal = scenarioDef(s).goal;
  const carrying = goal.type === 'deposit' ? cardsOf(goal.item).length : 0;
  const lateRound = s.day >= s.scenario.days - 1;
  for (const sv of survivors) {
    const loc = s.locations[sv.location];
    const bringHome = carrying >= 2 || (carrying >= 1 && lateRound);
    if (sv.location !== 'colony' && (sv.wounds >= 2 || !loc.deck.length || bringHome || packFree(s, sv.id) === 0 || sv.hp < 40) && can(sv, 'move', 'colony')) {
      candidates.push(act.move(sv.id, 'colony', s.locations.colony.zombies ? cardsOf('fuel')[0] : undefined));
    } else if (goal.type === 'kills' && sv.wounds < 2) {
      // Hunting: go where the dead are thickest (a weapon makes it safe and cheap).
      const prey = OUTSIDE_LOCATIONS.concat(['colony']).filter((l) => l !== sv.location && s.locations[l].zombies >= 2
        && freeSurvivorSlots(s, l) > 0 && sv.ap >= actionCost(s, sv.id, 'move', l) + actionCost(s, sv.id, 'attack'))
        .sort((a, b) => s.locations[b].zombies - s.locations[a].zombies)[0];
      if (prey && loc.zombies === 0) candidates.push(act.move(sv.id, prey));
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
      // Snow crawler: go where the next stage's missing materials can be found.
      const want = crawlerWants(s);
      const loot = (l) => want.reduce((n, id) => n + (LOCATIONS[l].deck?.[id] ?? 0), 0);
      // Food first when the larder runs low: places whose loot table has the most food.
      const foodLoot = (l) => Object.entries(LOCATIONS[l].deck ?? {}).reduce((n, [id, k]) => n + (ITEMS[id].type === 'food' ? k : 0), 0);
      const lowFood = s.food < foodNeeded(s) * 2;
      const score = (l) => (hunting ? -s.locations[l].zombies * 2 : s.locations[l].zombies) - (hungry && l === 'grocery' ? 3 : 0) - Math.min(4, loot(l)) - (lowFood ? foodLoot(l) * 2 : 0);
      options.sort((a, b) => score(a) - score(b) || opts.random() - 0.5);
      const def = survivorDef(sv.id);
      const preferred = def.ability.type === 'doubleSearch' && options.includes(def.ability.location) ? def.ability.location : options[0];
      // Leave enough energy to search when we get there.
      if (preferred && !sv.napped && sv.ap >= actionCost(s, sv.id, 'move', preferred) + ENERGY.SEARCH) candidates.push(act.move(sv.id, preferred));
    }
  }
  // 6. Junk is energy now.
  const junk = cardsOf('junk')[0];
  const tired = survivors.slice().sort((a, b) => a.ap - b.ap)[0];
  if (junk && tired && tired.ap < 30) candidates.push(act.playCard(junk, { targetSurvivorId: tired.id }));
  // 7. Rest: a worn-out survivor at home naps before doing anything; one spent survivor guards when zombies are due.
  for (const sv of survivors) {
    if (sv.location === 'colony' && !sv.acted && !sv.moved && !sv.napped && sv.ap < 30) candidates.push(act.nap(sv.id));
  }
  const guard = survivors.find((sv) => sv.location === 'colony' && sv.ap < 15 && sv.rest !== 'guard');
  if (guard && siegeForecast(s).hits > 0 && !survivors.some((sv) => sv.rest === 'guard')) candidates.push(act.setRest(guard.id, 'guard'));
}
