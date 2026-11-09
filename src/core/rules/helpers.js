// Low-level state mutations shared by all rule modules.
// Every function here mutates the draft `s` (a private clone made by the reducer).
import { OUTSIDE_LOCATIONS, RULES } from '../constants.js';
import { shuffle } from '../rng.js';
import { assert } from '../errors.js';
import { LOCATIONS } from '../../content/locations.js';
import { ITEMS } from '../../content/items.js';
import { ENERGY } from '../constants.js';

const ENERGY_REGEN_FROST = ENERGY.REGEN_FROST;
import {
  getPlayer, survivorDef, survivorsAt, woundLimit, freeSurvivorSlots, aliveSurvivorsOf,
} from '../selectors.js';

export function log(s, key, params = {}) {
  s.log.push({ r: s.round, k: key, ...params });
  if (s.log.length > RULES.MAX_LOG) s.log.splice(0, s.log.length - RULES.MAX_LOG);
}

export function changeMorale(s, delta, reason) {
  if (!delta) return;
  s.morale = Math.max(0, Math.min(s.maxMorale, s.morale + delta));
  log(s, 'morale', { delta, reason, value: s.morale });
}

export function changeFood(s, delta, reason) {
  if (!delta) return;
  s.food = Math.max(0, s.food + delta);
  log(s, 'food', { delta, reason, value: s.food });
}

export function changeWaste(s, delta, reason) {
  if (!delta) return;
  s.waste = Math.max(0, s.waste + delta);
  log(s, 'waste', { delta, reason, value: s.waste });
}

export function changeHelpless(s, delta, reason) {
  if (!delta) return;
  const before = s.helpless;
  s.helpless = Math.max(0, s.helpless + delta);
  const lost = before - s.helpless;
  log(s, 'helpless', { delta: s.helpless - before, reason, value: s.helpless });
  // Every helpless survivor who dies hurts morale.
  if (lost > 0) changeMorale(s, -lost, 'helplessDied');
}

// ---------------------------------------------------------------- cards

/** Draw up to n cards from a location deck into a player's hand. Returns drawn uids. */
export function drawItems(s, playerId, locationId, n) {
  const deck = s.locations[locationId]?.deck;
  const drawn = [];
  if (!deck) return drawn;
  for (let i = 0; i < n && deck.length; i++) drawn.push(deck.pop());
  getPlayer(s, playerId).hand.push(...drawn);
  if (drawn.length) log(s, 'draw', { playerId, locationId, count: drawn.length });
  return drawn;
}

export function removeFromHand(s, playerId, uid) {
  const hand = getPlayer(s, playerId).hand;
  const i = hand.indexOf(uid);
  if (i === -1) return false;
  hand.splice(i, 1);
  return true;
}

/** A card used up goes onto the waste pile. */
export function wasteCard(s, playerId, uid) {
  removeFromHand(s, playerId, uid);
  s.waste += 1;
}

// ---------------------------------------------------------------- survivors

export function killSurvivor(s, survivorId, cause) {
  const sv = s.survivors[survivorId];
  if (!sv || !sv.alive) return;
  sv.alive = false;
  sv.deathCause = cause;
  const owner = getPlayer(s, sv.owner);
  owner.survivors = owner.survivors.filter((id) => id !== survivorId);
  owner.fallen.push(survivorId);
  log(s, 'death', { survivorId, playerId: owner.id, cause, location: sv.location });
  changeMorale(s, -1, 'survivorDied');
  if (owner.survivors.length === 0) recruitReplacement(s, owner.id);
}

/** A player who loses everyone recruits a fresh survivor from the deck. */
export function recruitReplacement(s, playerId) {
  recruitSurvivor(s, playerId);
}

/** Add the top survivor of the deck to a player's group (colony, or a safe spot for exiles). */
export function recruitSurvivor(s, playerId) {
  if (!s.survivorDeck.length) return;
  const p = getPlayer(s, playerId);
  const id = s.survivorDeck.pop();
  const location = p.exiled ? safestOutsideLocation(s) : 'colony';
  if (!location) return;
  s.survivors[id] = newSurvivor(id, playerId, location);
  p.survivors.push(id);
  log(s, 'recruit', { playerId, survivorId: id, location });
}

export function newSurvivor(id, owner, location) {
  return { id, owner, location, wounds: 0, frostbite: false, alive: true, moved: false };
}

/** Outside location with the most free survivor slots (ties: fewest zombies, then board order). */
export function safestOutsideLocation(s) {
  let best = null;
  for (const loc of OUTSIDE_LOCATIONS) {
    const free = freeSurvivorSlots(s, loc);
    if (free <= 0) continue;
    const z = s.locations[loc].zombies;
    if (!best || free > best.free || (free === best.free && z < best.z)) best = { loc, free, z };
  }
  return best?.loc ?? null;
}

export function woundSurvivor(s, survivorId, cause = 'wound') {
  const sv = s.survivors[survivorId];
  if (!sv?.alive) return;
  sv.wounds += 1;
  log(s, 'wound', { survivorId, wounds: sv.wounds, cause });
  if (sv.wounds >= woundLimit(survivorId)) killSurvivor(s, survivorId, 'wounds');
}

export function healSurvivor(s, survivorId) {
  const sv = s.survivors[survivorId];
  if (!sv?.alive) return false;
  if (sv.frostbite) sv.frostbite = false;
  else if (sv.wounds > 0) sv.wounds -= 1;
  else return false;
  log(s, 'heal', { survivorId });
  return true;
}

/** Exposure is a danger card now (kept as the name every caller uses: moves, fights, crossroads, infection). */
export function rollExposure(s, survivorId, cause) {
  return drawDanger(s, survivorId, cause);
}

export function addZombies(s, locationId, n, reason) {
  const loc = s.locations[locationId];
  const slots = LOCATIONS[locationId].zombieSlots;
  for (let i = 0; i < n; i++) {
    if (loc.barricades > 0) {
      loc.barricades -= 1;
      log(s, 'barricadeBroken', { locationId });
    } else if (loc.zombies < slots) {
      loc.zombies += 1;
    } else {
      overrun(s, locationId);
    }
  }
  if (n > 0) log(s, 'spawn', { locationId, n, reason, zombies: loc.zombies });
}

function overrun(s, locationId) {
  log(s, 'overrun', { locationId });
  if (locationId === 'colony' && s.helpless > 0) {
    changeHelpless(s, -1, 'overrun');
    return;
  }
  const victims = survivorsAt(s, locationId);
  if (!victims.length) return;
  victims.sort((a, b) => survivorDef(a.id).influence - survivorDef(b.id).influence);
  killSurvivor(s, victims[0].id, 'overrun');
}

export function removeZombies(s, locationId, n) {
  const loc = s.locations[locationId];
  const removed = Math.min(n, loc.zombies);
  loc.zombies -= removed;
  return removed;
}

export function addBarricades(s, locationId, n) {
  const loc = s.locations[locationId];
  const slots = LOCATIONS[locationId].zombieSlots;
  const added = Math.max(0, Math.min(n, slots - loc.zombies - loc.barricades));
  loc.barricades += added;
  if (added) log(s, 'barricade', { locationId, n: added });
  return added;
}

export function creditKills(s, playerId, n) {
  if (!n) return;
  s.totalKills += n;
  if (playerId) getPlayer(s, playerId).kills += n;
}

// ---------------------------------------------------------------- dice & decks

export function drawFromDeck(s, deckKey, discardKey) {
  if (!s[deckKey].length) {
    s[deckKey] = shuffle(s, s[discardKey]);
    s[discardKey] = [];
  }
  return s[deckKey].pop() ?? null;
}

// ---------------------------------------------------------------- step 23: danger deck + energy

const DANGER_RANK = { safe: 0, startle: 1, scratch: 2, surrounded: 3, frost: 4, bite: 5 };
/** How a danger card shows in the existing exposure feedback (popups, log, director). */
export const DANGER_FACE = { safe: 'blank', scratch: 'wound', frost: 'frostbite', bite: 'bite', startle: 'startle', surrounded: 'surrounded' };

function dangerCard(s) {
  const d = s.danger;
  if (!d.deck.length) {
    d.deck = shuffle(s, d.discard);
    d.discard = [];
    log(s, 'dangerShuffle', { size: d.deck.length });
  }
  return d.deck.pop() ?? 'safe';
}

/** Draw from the shared danger deck for a survivor and apply it. Returns the card kind. */
export function drawDanger(s, survivorId, cause) {
  const sv = s.survivors[survivorId];
  if (!sv?.alive) return null;
  const ability = survivorDef(survivorId).ability.type;
  let kind = dangerCard(s);
  if (ability === 'luckyExposure') {
    let second = dangerCard(s);
    if (DANGER_RANK[second] < DANGER_RANK[kind]) [kind, second] = [second, kind];
    s.danger.discard.push(second);
  }
  s.danger.discard.push(kind);
  const owner = getPlayer(s, sv.owner);
  // Personal protection: Bo or a padded parka shrug off frost; a riot vest stops the first scratch each round.
  const armor = owner.gear?.armor ? ITEMS[s.cards[owner.gear.armor]] : null;
  if (kind === 'frost' && (ability === 'ignoreFrostbite' || armor?.frostProof)) kind = 'safe';
  if (kind === 'scratch' && armor?.soak && owner.soakRound !== s.round) { owner.soakRound = s.round; kind = 'safe'; }
  const face = DANGER_FACE[kind];
  s.lastExposure = { survivorId, face, danger: kind, cause, seq: (s.lastExposure?.seq ?? 0) + 1 };
  log(s, 'exposure', { survivorId, face, danger: kind, cause });
  switch (kind) {
    case 'scratch': woundSurvivor(s, survivorId, 'exposure'); break;
    case 'frost':
      sv.frostbite = true;
      owner.regenPenalty = (owner.regenPenalty ?? 0) - ENERGY_REGEN_FROST;
      woundSurvivor(s, survivorId, 'frostbite');
      break;
    case 'startle': owner.energy = Math.max(0, (owner.energy ?? 0) - 10); break;
    case 'surrounded': addZombies(s, sv.location, 1, 'danger'); break;
    case 'bite': {
      const location = sv.location;
      killSurvivor(s, survivorId, 'bite');
      const others = survivorsAt(s, location);
      if (others.length) {
        others.sort((a, b) => survivorDef(a.id).influence - survivorDef(b.id).influence);
        log(s, 'infectionSpreads', { from: survivorId, to: others[0].id, location });
        drawDanger(s, others[0].id, 'infection');
      }
      break;
    }
    default: break;
  }
  return kind;
}

/** Add a card to the danger deck (escalation) and reshuffle the deck. */
export function addDangerCard(s, kind, reason) {
  if (!s.danger) return;
  s.danger.deck = shuffle(s, [...s.danger.deck, kind]);
  log(s, 'dangerAdded', { kind, reason });
}

export function spendEnergy(s, playerId, cost) {
  const p = getPlayer(s, playerId);
  assert(p.energy >= cost, 'notEnoughEnergy', `${p.energy} < ${cost}`);
  p.energy -= cost;
}

export function gainEnergy(s, playerId, n, max = Infinity) {
  const p = getPlayer(s, playerId);
  p.energy = Math.max(0, Math.min(max, (p.energy ?? 0) + n));
}
