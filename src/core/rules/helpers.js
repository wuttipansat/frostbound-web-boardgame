// Low-level state mutations shared by all rule modules.
// Every function here mutates the draft `s` (a private clone made by the reducer).
import { RULES, TRAITS, XP } from '../constants.js';
import { shuffle, random } from '../rng.js';
import { assert } from '../errors.js';
import { locDef } from '../map.js';

import {
  survivorDef, survivorsAt, woundLimit, apMax,
} from '../selectors.js';

export function log(s, key, params = {}) {
  s.log.push({ r: s.day, k: key, ...params });
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


// ---------------------------------------------------------------- cards

/** Draw up to n cards from a location deck into the hand. Returns drawn uids. */
/** Draw items from a location deck into a survivor's backpack (or the stockpile when no survivor is given). */
export function drawItems(s, locationId, n, survivorId = null) {
  const deck = s.locations[locationId]?.deck;
  const drawn = [];
  if (!deck) return drawn;
  for (let i = 0; i < n && deck.length; i++) drawn.push(deck.pop());
  (survivorId ? s.survivors[survivorId].pack : s.stockpile).push(...drawn);
  if (drawn.length) log(s, 'draw', { locationId, count: drawn.length });
  return drawn;
}

/** Take an item out of the stockpile or whichever backpack holds it. */
export function removeFromHand(s, uid) {
  const lists = [s.stockpile, ...Object.values(s.survivors).map((sv) => sv.pack ?? [])];
  for (const list of lists) {
    const i = list.indexOf(uid);
    if (i !== -1) { list.splice(i, 1); return true; }
  }
  return false;
}

/** A survivor at the colony empties their backpack into the stockpile. */
export function unpack(s, survivorId) {
  const sv = s.survivors[survivorId];
  if (!sv?.alive || sv.location !== 'colony' || !sv.pack?.length) return;
  log(s, 'unpack', { survivorId, count: sv.pack.length });
  s.stockpile.push(...sv.pack);
  sv.pack = [];
}

/** A card used up is gone. */
export function discardCard(s, uid) {
  removeFromHand(s, uid);
}

// ---------------------------------------------------------------- survivors

export function killSurvivor(s, survivorId, cause) {
  const sv = s.survivors[survivorId];
  if (!sv || !sv.alive) return;
  sv.alive = false;
  sv.deathCause = cause;
  const t = s.team;
  // Their gear goes back to the team's hand.
  // Gear and backpack: home if they die at the colony, lost out there.
  if (sv.location === 'colony') for (const uid of [...Object.values(sv.gear ?? {}), ...(sv.pack ?? [])]) if (uid) s.stockpile.push(uid);
  sv.pack = [];
  sv.gear = { weapon: null, armor: null, book: null, tool: null };
  t.survivors = t.survivors.filter((id) => id !== survivorId);
  t.fallen.push(survivorId);
  log(s, 'death', { survivorId, cause, location: sv.location });
  changeMorale(s, -1, 'survivorDied');
  if (t.survivors.length === 0) recruitSurvivor(s);
}

/** Add the top survivor of the deck to the team, in the colony (at most RULES.TEAM_MAX). */
export function recruitSurvivor(s) {
  if (!s.survivorDeck.length || s.team.survivors.length >= RULES.TEAM_MAX) return false;
  const id = s.survivorDeck.pop();
  s.survivors[id] = newSurvivor(id, 'colony');
  s.survivors[id].ap = apMax(s, id); // newcomers arrive rested
  giveTrait(s, id);
  s.team.survivors.push(id);
  log(s, 'recruit', { survivorId: id, location: 'colony' });
  return true;
}

export function newSurvivor(id, location) {
  return { id, location, wounds: 0, frostbite: false, alive: true, moved: false, acted: false, ap: 0, hp: RULES.HP_MAX, ammo: 0, pack: [], xp: { fight: 0, search: 0 }, rest: 'sleep', napped: false, gear: { weapon: null, armor: null, book: null, tool: null } };
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

export function addZombies(s, locationId, n, reason) {
  const loc = s.locations[locationId];
  const slots = locDef(s, locationId).zombieSlots;
  for (let i = 0; i < n; i++) {
    if (loc.barricades > 0) {
      loc.barricades -= 1;
      log(s, 'barricadeBroken', { locationId });
    } else if (loc.zombies < slots) {
      loc.zombies += 1;
    } else if (locationId !== 'colony') {
      // Step 9: a full place is overrun; the extra zombies walk on to the colony gate.
      addZombies(s, 'colony', 1, 'overflow');
    } else {
      overrun(s, locationId);
    }
  }
  if (n > 0) log(s, 'spawn', { locationId, n, reason, zombies: loc.zombies });
}

function overrun(s, locationId) {
  log(s, 'overrun', { locationId });
  const victims = survivorsAt(s, locationId);
  if (!victims.length) return;
  // Step 18: an overrun no longer kills outright; the weakest there takes a heavy beating.
  victims.sort((a, b) => a.hp - b.hp || survivorDef(a.id).influence - survivorDef(b.id).influence);
  damageSurvivor(s, victims[0].id, RULES.OVERRUN_HP, 'overrun');
}

export function removeZombies(s, locationId, n) {
  const loc = s.locations[locationId];
  const removed = Math.min(n, loc.zombies);
  loc.zombies -= removed;
  return removed;
}

export function addBarricades(s, locationId, n) {
  const loc = s.locations[locationId];
  const slots = locDef(s, locationId).zombieSlots;
  const added = Math.max(0, Math.min(n, slots - loc.zombies - loc.barricades));
  loc.barricades += added;
  if (added) log(s, 'barricade', { locationId, n: added });
  return added;
}

export function creditKills(s, n) {
  if (!n) return;
  s.totalKills += n;
  if (s.stats) s.stats.kills += n;
  s.team.kills += n;
}

// ---------------------------------------------------------------- dice & decks

export function drawFromDeck(s, deckKey, discardKey) {
  if (!s[deckKey].length) {
    s[deckKey] = shuffle(s, s[discardKey]);
    s[discardKey] = [];
  }
  return s[deckKey].pop() ?? null;
}

// ---------------------------------------------------------------- energy

/** Pay AP from one survivor. */
export function spendEnergy(s, cost, survivorId) {
  const sv = s.survivors[survivorId];
  assert(sv && sv.ap >= cost, 'notEnoughEnergy', `${sv?.ap} < ${cost}`);
  sv.ap -= cost;
}

/** Give (or take, n < 0) AP to one survivor, capped by their max. */
export function gainEnergy(s, n, survivorId) {
  const sv = s.survivors[survivorId];
  if (!sv?.alive) return;
  sv.ap = Math.max(0, Math.min(apMax(s, survivorId), (sv.ap ?? 0) + n));
}

/** Take HP from a survivor; at 0 they die. */
export function damageSurvivor(s, survivorId, n, cause = 'fight') {
  const sv = s.survivors[survivorId];
  if (!sv?.alive || n <= 0) return;
  sv.hp = Math.max(0, (sv.hp ?? RULES.HP_MAX) - n);
  log(s, 'hurt', { survivorId, n, hp: sv.hp, cause });
  if (sv.hp <= 0) killSurvivor(s, survivorId, cause);
}

export function healHp(s, survivorId, n) {
  const sv = s.survivors[survivorId];
  if (sv?.alive) sv.hp = Math.min(RULES.HP_MAX, (sv.hp ?? RULES.HP_MAX) + n);
}

/** Each survivor gets one trait (seeded) when they join. */
export function giveTrait(s, id) {
  const sv = s.survivors[id];
  if (sv && !sv.trait) sv.trait = TRAITS[Math.floor(random(s) * TRAITS.length)];
}

/** Experience: +1 per use; every 5 is a level (max 3). */
export function gainXp(s, survivorId, kind) {
  const sv = s.survivors[survivorId];
  if (!sv) return;
  sv.xp = sv.xp ?? { fight: 0, search: 0 };
  const before = Math.floor(sv.xp[kind] / XP.PER_LEVEL);
  sv.xp[kind] += 1;
  const after = Math.floor(sv.xp[kind] / XP.PER_LEVEL);
  if (after > before && after <= XP.MAX_LEVEL) log(s, 'levelUp', { survivorId, kind, level: after });
}
