// Read-only derived queries over GameState. Safe to use from UI/renderer.
import { SURVIVORS_BY_ID } from '../content/survivors.js';
import { LOCATIONS } from '../content/locations.js';
import { ITEMS } from '../content/items.js';
import { ALL_OBJECTIVES } from '../content/objectives.js';
import { SCENARIOS_BY_ID } from '../content/scenarios.js';
import { CRISES_BY_ID } from '../content/crises.js';
import { RULES, ENERGY, DANGEROUS_LOCATIONS, OUTSIDE_LOCATIONS } from './constants.js';

export const survivorDef = (id) => SURVIVORS_BY_ID[id];
export const itemOf = (s, uid) => ITEMS[s.cards[uid]];
export const objectiveDef = (id) => ALL_OBJECTIVES[id];
export const scenarioDef = (s) => SCENARIOS_BY_ID[s.scenario.id];
export const crisisDef = (s) => (s.crisis ? CRISES_BY_ID[s.crisis.id] : null);

export function getPlayer(s, playerId) {
  return s.players.find((p) => p.id === playerId);
}

export function activePlayer(s) {
  return getPlayer(s, s.activePlayerId);
}

export function playerIndex(s, playerId) {
  return s.players.findIndex((p) => p.id === playerId);
}

/** The player seated after `playerId` (wraps around). */
export function nextPlayer(s, playerId) {
  const i = playerIndex(s, playerId);
  return s.players[(i + 1) % s.players.length];
}

export function aliveSurvivorsOf(s, playerId) {
  return getPlayer(s, playerId).survivors.map((id) => s.survivors[id]).filter((sv) => sv && sv.alive);
}

export function survivorsAt(s, locationId) {
  return Object.values(s.survivors).filter((sv) => sv.alive && sv.location === locationId);
}

export function hasAbility(s, survivorId, type) {
  const sv = s.survivors[survivorId];
  return !!sv && sv.alive && survivorDef(survivorId).ability.type === type;
}

/** Does this player control a living survivor with the given ability type? */
/** How many copies of a passive book (by passive key) the colony's players hold. Exiles don't share. */
/** Equipped gear of a player: { weapon, armor, book } item defs (or null). Hidden from no one: gear is worn. */
export function gearOf(s, playerId) {
  const g = getPlayer(s, playerId)?.gear ?? {};
  const def = (uid) => (uid ? ITEMS[s.cards[uid]] ?? null : null);
  return { weapon: def(g.weapon), armor: def(g.armor), book: def(g.book) };
}

/** How many equipped books with this passive (one player, or every non-exiled player). */
export function booksHeld(s, passive, playerId = null) {
  let n = 0;
  for (const p of s.players) {
    if (playerId ? p.id !== playerId : p.exiled) continue;
    if (gearOf(s, p.id).book?.passive === passive) n += 1;
  }
  return n;
}

/** An equipped blueprint for this location. */
export function holdsBlueprint(s, playerId, locationId) {
  return gearOf(s, playerId).book?.blueprint === locationId;
}

export function playerHasAbility(s, playerId, type) {
  return aliveSurvivorsOf(s, playerId).some((sv) => survivorDef(sv.id).ability.type === type);
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

/** People the colony must feed: survivors standing in the colony + helpless survivors. */
export function colonyPopulation(s) {
  return survivorsAt(s, 'colony').length + s.helpless;
}

export function foodNeeded(s) {
  let need = Math.ceil(colonyPopulation(s) / 2);
  const cookHome = survivorsAt(s, 'colony').some((sv) => survivorDef(sv.id).ability.type === 'foodSaver');
  if (cookHome) need -= 1;
  need -= booksHeld(s, 'foodSaver');
  return Math.max(0, need);
}

export function crisisRequirement(s) {
  const c = crisisDef(s);
  if (!c) return 0;
  return Math.max(1, Math.ceil(c.base + c.perPlayer * s.players.length));
}

/** The survivor a crossroads card is "about": highest influence, optionally filtered. */
export function focusSurvivor(s, playerId, filter = () => true) {
  const list = aliveSurvivorsOf(s, playerId).filter(filter);
  list.sort((a, b) => survivorDef(b.id).influence - survivorDef(a.id).influence);
  return list[0] || null;
}

export function scenarioTarget(s) {
  const g = scenarioDef(s).goal;
  const n = s.players.length;
  switch (g.type) {
    case 'deposit': return g.base + g.perPlayer * n;
    case 'stockpile': return g.foodBase + g.foodPerPlayer * n;
    case 'kills': return g.base + g.perPlayer * n;
    default: return 0;
  }
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
  return s.scenario.rounds - s.round + 1;
}

/** Which players must provide input right now (for hot-seat prompts and AI driving). */
export function pendingActors(s) {
  switch (s.phase) {
    case 'draft': return s.players.filter((p) => !p.drafted).map((p) => p.id);
    case 'crossroads':
    case 'turn': return [s.activePlayerId];
    case 'vote': return s.players
      .filter((p) => p.id !== s.vote.targetId && !(p.id in s.vote.votes))
      .map((p) => p.id);
    default: return [];
  }
}

// ---------------------------------------------------------------- energy (personal), danger, forecast

export const isNight = (s) => s.round % 2 === 0;

/**
 * Energy cost of an action for a survivor (move: `to` is the destination). Odd numbers on purpose.
 * Personal: attack / search come from the survivor's skills; equipped weapon / boots change them.
 * Modifiers: crowded (2+ zombies) search/barricade, dangerous-location search, heavy hitter, night outside.
 */
export function actionCost(s, survivorId, kind, to = null) {
  const sv = s.survivors[survivorId];
  const def = survivorDef(survivorId);
  const gear = sv ? gearOf(s, sv.owner) : {};
  let cost = ENERGY.COST[kind] ?? 0;
  if (kind === 'attack') cost = ENERGY.ATTACK_BASE + ENERGY.PER_SKILL * (def?.attack ?? 4) + (gear.weapon?.attackMod ?? 0);
  if (kind === 'search') cost = ENERGY.SEARCH_BASE + ENERGY.PER_SKILL * (def?.search ?? 4);
  if (kind === 'move') cost += gear.armor?.moveMod ?? 0;
  if (!sv) return cost;
  const here = sv.location;
  const zombies = s.locations[here]?.zombies ?? 0;
  if ((kind === 'search' || kind === 'barricade') && zombies >= 2) cost += ENERGY.CROWDED;
  if (kind === 'search' && DANGEROUS_LOCATIONS.includes(here)) cost += ENERGY.DANGEROUS;
  if (kind === 'attack' && def?.ability.type === 'killTwo') cost += ENERGY.HEAVY;
  const outside = kind === 'move' ? to && to !== 'colony' : here !== 'colony';
  if (isNight(s) && outside) cost += ENERGY.NIGHT;
  return Math.max(1, cost);
}

/** Zombies one attack kills: the weapon's value (bare hands 1), +1 for Teodor. */
export function killsPerAttack(s, survivorId) {
  const sv = s.survivors[survivorId];
  const weapon = sv ? gearOf(s, sv.owner).weapon : null;
  return Math.max(1, weapon?.value ?? 1) + (survivorDef(survivorId)?.ability.type === 'killTwo' ? 1 : 0);
}

/** The player's survivor (one per player). */
export const heroOf = (s, playerId) => aliveSurvivorsOf(s, playerId)[0] ?? null;

/** Energy cap: the survivor's own pool, lower while badly hurt (2+ wounds). */
export function energyMax(s, playerId) {
  const sv = heroOf(s, playerId);
  if (!sv) return 0;
  const base = survivorDef(sv.id).energy ?? ENERGY.MAX;
  return Math.max(10, Math.min(ENERGY.MAX, base - (sv.wounds >= 2 ? ENERGY.HURT : 0)));
}

/** Energy regained at the start of a turn: the survivor's regen, Dot +15, a survival guide, starvation, frost. */
export function energyRegen(s, playerId) {
  const p = getPlayer(s, playerId);
  const sv = heroOf(s, playerId);
  if (!sv) return 0;
  const def = survivorDef(sv.id);
  let n = def.regen ?? 65;
  if (def.ability.type === 'extraDie') n += 15;
  if (gearOf(s, playerId).book?.passive === 'regenPlus') n += gearOf(s, playerId).book.value;
  if (s.starvation > 0) n -= ENERGY.STARVING;
  return Math.max(0, n - (p.regenPenalty ?? 0));
}

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
  const n = Math.ceil((survivorsAt(s, 'colony').length + s.helpless) / 3);
  if (n) out.colony = n;
  return out;
}

/** Danger cards left to draw, by kind (public: works on a full state and on a player's view). */
export function dangerCounts(s) {
  if (!s.danger) return null;
  if (s.danger.left) return { ...s.danger.left };
  const out = {};
  for (const k of s.danger.deck) out[k] = (out[k] ?? 0) + 1;
  return out;
}
