import { BUILDINGS } from '../content/buildings.js';
// Read-only derived queries over GameState. Safe to use from UI/renderer.
import { SURVIVORS_BY_ID } from '../content/survivors.js';
import { LOCATIONS } from '../content/locations.js';
import { ITEMS } from '../content/items.js';
import { SCENARIOS_BY_ID } from '../content/scenarios.js';
import { CRISES_BY_ID } from '../content/crises.js';
import { RULES, ENERGY, REST, FIGHT, RING, SEARCH_SPAWN, DANGEROUS_LOCATIONS, OUTSIDE_LOCATIONS } from './constants.js';

export const survivorDef = (id) => SURVIVORS_BY_ID[id];
export const itemOf = (s, uid) => ITEMS[s.cards[uid]];
export const scenarioDef = (s) => SCENARIOS_BY_ID[s.scenario.id];
export const crisisDef = (s) => (s.crisis ? CRISES_BY_ID[s.crisis.id] : null);

/** The solo player's team: hand, gear, energy and the survivors they control. */
export const team = (s) => s.team;

export function aliveSurvivors(s) {
  return s.team.survivors.map((id) => s.survivors[id]).filter((sv) => sv && sv.alive);
}

export function survivorsAt(s, locationId) {
  return Object.values(s.survivors).filter((sv) => sv.alive && sv.location === locationId);
}

export function hasAbility(s, survivorId, type) {
  const sv = s.survivors[survivorId];
  return !!sv && sv.alive && survivorDef(survivorId).ability.type === type;
}

/** A survivor's equipped gear: { weapon, armor, book } item defs (or null). No id: the lead survivor. */
export function gearOf(s, survivorId = null) {
  const sv = survivorId ? s.survivors[survivorId] : heroOf(s);
  const g = sv?.gear ?? {};
  const def = (uid) => (uid ? ITEMS[s.cards[uid]] ?? null : null);
  return { weapon: def(g.weapon), armor: def(g.armor), book: def(g.book), tool: def(g.tool) };
}

/** How many living survivors have a book with this passive equipped (books help the whole team). */
export function booksHeld(s, passive) {
  return aliveSurvivors(s).filter((sv) => gearOf(s, sv.id).book?.passive === passive).length;
}

/** This survivor has the blueprint for this location equipped. */
export function holdsBlueprint(s, survivorId, locationId) {
  return gearOf(s, survivorId).book?.blueprint === locationId;
}

/** Does a living survivor of the team have this ability? */
export function teamHasAbility(s, type) {
  return aliveSurvivors(s).some((sv) => survivorDef(sv.id).ability.type === type);
}

export function woundLimit(survivorId) {
  return survivorDef(survivorId).ability.type === 'stoic' ? RULES.WOUNDS_TO_DIE + 1 : RULES.WOUNDS_TO_DIE;
}

export function freeSurvivorSlots(s, locationId) {
  const slots = LOCATIONS[locationId].survivorSlots;
  if (slots == null) return Infinity;
  return slots - survivorsAt(s, locationId).length;
}

/** Free zombie/barricade slots at a location. */
export function freeZombieSlots(s, locationId) {
  const loc = s.locations[locationId];
  return LOCATIONS[locationId].zombieSlots - loc.zombies - loc.barricades;
}

/** People the colony must feed: survivors standing in the colony. */
export function colonyPopulation(s) {
  return survivorsAt(s, 'colony').length;
}

export function foodNeeded(s) {
  let need = colonyPopulation(s); // everyone at the base eats 1
  const cookHome = survivorsAt(s, 'colony').some((sv) => survivorDef(sv.id).ability.type === 'foodSaver');
  if (cookHome) need -= 1;
  need -= booksHeld(s, 'foodSaver');
  return Math.max(0, need);
}

export function crisisRequirement(s) {
  const c = crisisDef(s);
  if (!c) return 0;
  return Math.max(1, c.need ?? 1) + Math.floor((s.day - 1) / RULES.CRISIS_STEP_DAYS); // +1 every 10 days
}

/** Today's crisis score so far (items are handed in face up): matching +1, anything else −1. */
export function crisisScore(s) {
  const c = crisisDef(s);
  if (!c) return 0;
  return s.crisis.contributions.reduce((n, uid) => n + (crisisMatches(s, c, itemOf(s, uid)) ? 1 : -1), 0);
}

export function crisisMatches(s, crisis, item) {
  return item.type === crisis.item || item.counts === crisis.item || !!item.wild
    || (item.type === 'junk' && teamHasAbility(s, 'tinkerer'));
}

/** The survivor a crossroads card is "about": highest influence, optionally filtered. */
export function focusSurvivor(s, filter = () => true) {
  const list = aliveSurvivors(s).filter(filter);
  list.sort((a, b) => survivorDef(b.id).influence - survivorDef(a.id).influence);
  return list[0] || null;
}

export function scenarioTarget(s) {
  return scenarioDef(s).goal.target ?? 0;
}

/** Current progress towards the main objective (same unit as scenarioTarget). */
export function scenarioProgress(s) {
  const g = scenarioDef(s).goal;
  switch (g.type) {
    case 'deposit': return s.scenario.deposited;
    case 'stockpile': return s.food;
    case 'kills': return s.totalKills;
    default: return 0;
  }
}

export function roundsRemaining(s) {
  return s.scenario.days - s.day + 1;
}

// ---------------------------------------------------------------- energy, forecast

/** Whole days the stockpiled food lasts at today's need (Infinity when nobody needs to eat). */
export const foodDays = (s) => { const n = foodNeeded(s); return n ? Math.floor(s.food / n) : Infinity; };

/** Every third day a storm blows: outside actions cost more. */
export const isStorm = (s) => s.day % 3 === 0;

/**
 * Energy cost of an action for a survivor (move: `to` is the destination). Odd numbers on purpose.
 * Personal: attack / search come from the survivor's skills; equipped weapon / boots change them.
 * Modifiers: crowded (2+ zombies) search/barricade, dangerous-location search, heavy hitter, night outside.
 */
export function actionCost(s, survivorId, kind, to = null) {
  const sv = s.survivors[survivorId];
  const def = survivorDef(survivorId);
  const gear = sv ? gearOf(s, survivorId) : {};
  let cost = ENERGY.COST[kind] ?? 0;
  if (kind === 'attack') cost = gear.weapon?.gun ? FIGHT.GUN_AP : FIGHT.MELEE_AP;
  if (kind === 'search') cost = ENERGY.SEARCH;
  if (kind === 'move') cost = walkCost(sv?.location ?? 'colony', to ?? 'colony') + (gear.armor?.moveMod ?? 0) + (gear.tool?.walkMod ?? 0);
  if (kind === 'search') cost += gear.tool?.searchMod ?? 0;
  if (kind === 'barricade') cost += gear.tool?.barricadeMod ?? 0;
  if (!sv) return cost;
  const here = sv.location;
  const zombies = s.locations[here]?.zombies ?? 0;
  if ((kind === 'search' || kind === 'barricade') && zombies >= 2) cost += ENERGY.CROWDED;
  if (kind === 'attack' && def?.ability.type === 'killTwo') cost += ENERGY.HEAVY;
  // Cheaper actions from a survivor's ability.
  const cheaper = { move: 'roadRunner', attack: 'sharpshooter', barricade: 'handy' }[kind];
  if (cheaper && def?.ability.type === cheaper) cost -= ENERGY.SKILLED;
  const outside = kind === 'move' ? to && to !== 'colony' : here !== 'colony';
  if (isStorm(s) && outside && def?.ability.type !== 'coldProof' && !gear.armor?.coldProof) cost += ENERGY.STORM;
  return Math.max(1, cost);
}

/** Walking cost between two places by distance: near 12, mid 17, far 23. */
export function walkCost(from, to) {
  if (from === to) return 0;
  const a = RING[from] ?? 1, b = RING[to] ?? 1;
  const tier = a === 0 || b === 0 ? Math.max(a, b) : Math.min(3, Math.ceil((a + b) / 2));
  return ENERGY.WALK[tier - 1];
}

/** Chance (0..1) that searching here makes a zombie appear: by place, +10% per extra search there today. */
export function searchSpawnChance(s, locationId) {
  return Math.min(1, (SEARCH_SPAWN[locationId] ?? 0) + SEARCH_SPAWN.EXTRA * (s.searches?.[locationId] ?? 0));
}

/** Who holds an item: 'stockpile' (at the colony), a survivor id (backpack), or null. */
export function holderOf(s, uid) {
  if (s.stockpile.includes(uid)) return 'stockpile';
  for (const sv of Object.values(s.survivors)) if (sv.alive && sv.pack?.includes(uid)) return sv.id;
  return null;
}

/** Where an item is: the colony for the stockpile, else its carrier's location. */
export function placeOfItem(s, uid) {
  const h = holderOf(s, uid);
  return h === 'stockpile' ? 'colony' : h ? s.survivors[h].location : null;
}

/** Backpack slots: 3, more with a big backpack or a sled. */
export const packSize = (s, survivorId) => RULES.PACK + (s.survivors[survivorId] ? gearOf(s, survivorId).tool?.pack ?? 0 : 0);
export const packFree = (s, survivorId) => packSize(s, survivorId) - (s.survivors[survivorId]?.pack?.length ?? 0);

/** Zombies one attack kills: a gun's value (shotgun 2); melee 1, +1 for Teodor. */
export function killsPerAttack(s, survivorId) {
  const weapon = s.survivors[survivorId] ? gearOf(s, survivorId).weapon : null;
  if (weapon?.gun) return weapon.value;
  return 1 + (survivorDef(survivorId)?.ability.type === 'killTwo' ? 1 : 0);
}

/** Zombie ferocity today: walkers, then brutes from day 21. */
export const ferocity = (s) => (s.day >= FIGHT.BRUTE_DAY ? FIGHT.BRUTE : FIGHT.WALKER);

/** A survivor's ATK: their attack skill (2 best → 20, 6 worst → 4) plus a melee weapon. */
export function atkOf(s, survivorId) {
  const w = gearOf(s, survivorId).weapon;
  return (7 - (survivorDef(survivorId)?.attack ?? 4)) * FIGHT.ATK_PER_SKILL + (w && !w.gun ? (w.atk ?? 0) : 0);
}

/** What one attack would do now: { cost, kills, hp (lost), gun, spawn (chance), ammo }. */
export function fightPreview(s, survivorId) {
  const sv = s.survivors[survivorId];
  const gear = gearOf(s, survivorId);
  const cost = actionCost(s, survivorId, 'attack');
  const kills = killsPerAttack(s, survivorId);
  if (gear.weapon?.gun) return { cost, kills, hp: 0, gun: true, spawn: gear.weapon.gun.spawn, ammo: sv?.ammo ?? 0 };
  const left = Math.max(0, (sv?.ap ?? 0) - cost);
  const raw = Math.ceil(Math.max(0, ferocity(s) - (left + atkOf(s, survivorId))) / 3);
  return { cost, kills, hp: Math.max(0, raw - (gear.armor?.value ?? 0)), gun: false, spawn: 0, ammo: 0 };
}

/** HP lost walking out of a place with zombies. */
export const leaveDamage = (s, survivorId) => FIGHT.LEAVE_HP * (s.locations[s.survivors[survivorId]?.location]?.zombies ?? 0);

/** The team's lead survivor (first alive). */
export const heroOf = (s) => aliveSurvivors(s)[0] ?? null;

/** A survivor's AP max: their own pool, lower while badly hurt (2+ wounds). */
export function apMax(s, survivorId) {
  const sv = s.survivors[survivorId];
  if (!sv) return 0;
  const base = survivorDef(survivorId).energy ?? ENERGY.MAX;
  return Math.max(10, Math.min(ENERGY.MAX, base - (sv.wounds >= 2 ? ENERGY.HURT : 0)));
}

/** A survivor's AP now. */
export const apOf = (s, survivorId) => s.survivors[survivorId]?.ap ?? 0;

/**
 * Tonight's sleep for every alive survivor: { [id]: { kind, ap, hp } } where kind is
 * bed / floor (colony, no bed left) / outside / guard; ap is the AP they will wake with.
 * Beds go to the most tired first. Dot +15, a survival guide (+value), starving −20.
 */
export function sleepPlan(s) {
  const out = {};
  const alive = aliveSurvivors(s);
  const home = alive.filter((sv) => sv.location === 'colony' && sv.rest !== 'guard')
    .sort((a, b) => apOf(s, a.id) / apMax(s, a.id) - apOf(s, b.id) / apMax(s, b.id) || a.id.localeCompare(b.id));
  const beds = new Set(home.slice(0, bedCount(s)).map((sv) => sv.id));
  let bonus = 0;
  for (const o of alive) { const b = gearOf(s, o.id).book; if (b?.passive === 'regenPlus') bonus += b.value; }
  for (const sv of alive) {
    const kind = sv.location !== 'colony' ? 'outside' : sv.rest === 'guard' ? 'guard' : beds.has(sv.id) ? 'bed' : 'floor';
    const max = apMax(s, sv.id);
    const extra = bonus + (survivorDef(sv.id).ability.type === 'extraDie' ? 15 : 0);
    let ap = Math.max(0, Math.min(max, apOf(s, sv.id) + Math.round(max * REST[kind].ap) + extra));
    if (sv.hungry) ap = Math.round(ap * REST.HUNGRY); // went to bed hungry: half AP tomorrow
    out[sv.id] = { kind, ap, hp: REST[kind].hp + (sv.location === 'colony' ? 5 * baseLevel(s, 'infirmary') : 0) };
  }
  return out;
}

/** Base upgrade level (0..3). */
export const baseLevel = (s, id) => s.base?.[id] ?? 0;
/** Beds at the colony: 2, +2 per dorm level. */
export const bedCount = (s) => RULES.BEDS + 2 * baseLevel(s, 'dorm');

/** The next level of a building: { level, needs, ap, spent, started } or null when maxed. */
export function nextLevel(s, id) {
  const def = BUILDINGS[id];
  const lv = baseLevel(s, id);
  if (!def || lv >= def.levels.length) return null;
  const spent = s.building?.[id];
  return { level: lv + 1, ...def.levels[lv], spent: spent ?? 0, started: spent != null };
}

/** Guards on duty at the colony tonight. */
export const guardsOnDuty = (s) => aliveSurvivors(s).filter((sv) => sv.location === 'colony' && sv.rest === 'guard').length;

/** Zombies each location would get if the round ended now (same formula as the colony phase). */
export function spawnForecast(s) {
  const out = {};
  for (const loc of OUTSIDE_LOCATIONS) {
    const here = survivorsAt(s, loc);
    if (!here.length) continue;
    const quiet = here.filter((sv) => survivorDef(sv.id).ability.type === 'quiet').length;
    const n = Math.max(0, Math.ceil(here.length / 2) - quiet);
    if (n) out[loc] = n;
  }
  const n = Math.max(0, Math.ceil(survivorsAt(s, 'colony').length / 3) - guardsOnDuty(s) - baseLevel(s, 'wall'));
  if (n) out.colony = n;
  return out;
}
