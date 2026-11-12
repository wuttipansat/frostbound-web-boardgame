// Active-player actions. Everything that takes effort costs the survivor's energy (no dice anywhere);
// cards, gear and abilities are free.
import { PHASES, ENERGY, REST, RULES, FOOD, BUILD_STEP } from '../constants.js';
import { random } from '../rng.js';
import { assert } from '../errors.js';
import {
  survivorDef, gearOf, freeSurvivorSlots, freeZombieSlots, itemOf, scenarioDef, booksHeld, holdsBlueprint,
  actionCost, killsPerAttack, apMax, fightPreview, leaveDamage, holderOf, placeOfItem, packFree, searchSpawnChance, baseLevel, nextLevel, isOverrun, teamHasAbility, mapProgress, typeOf } from '../selectors.js';
import { growCity } from './city.js';
import { newMap } from '../map.js';
import {
  log, drawItems, discardCard, removeFromHand, addZombies, removeZombies,
  addBarricades, creditKills, healSurvivor, changeFood, changeMorale, recruitSurvivor,
  spendEnergy, gainEnergy, healHp, damageSurvivor, unpack, gainXp,
} from './helpers.js';
import { endTurn } from './flow.js';
import { isPermanent, gearSlot, RECIPES } from '../../content/items.js';

// ---------------------------------------------------------------- guards

function requireTurn(s, { picking = false } = {}) {
  assert(s.phase === PHASES.TURN, 'wrongPhase', s.phase);
  const p = s.team;
  assert(picking || !p.pick, 'pickPending');
  return p;
}

function requireSurvivor(s, survivorId) {
  const sv = s.survivors[survivorId];
  assert(sv && sv.alive, 'noSuchSurvivor', survivorId);
  assert(s.team.survivors.includes(survivorId), 'notYourSurvivor', survivorId);
  return sv;
}

/** A survivor who takes an AP action today (a napping survivor rests the whole day). */
function requireActive(s, survivorId) {
  const sv = requireSurvivor(s, survivorId);
  assert(!sv.napped, 'napping');
  return sv;
}

/** Pay an action's AP (the survivor has now acted today). */
function pay(s, survivorId, kind, to = null) {
  s.survivors[survivorId].acted = true;
  spendEnergy(s, actionCost(s, survivorId, kind, to), survivorId);
}

/** An item in the stockpile or a backpack. */
function requireCard(s, _p, uid) {
  assert(holderOf(s, uid), 'cardNotInHand', uid);
  return itemOf(s, uid);
}

/** An item that is at the colony (stockpile or a backpack there): only those count for crises and goals. */
function requireHome(s, uid) {
  assert(placeOfItem(s, uid) === 'colony', 'notHome');
}

/** The item must be where the survivor is. */
function requireSamePlace(s, uid, survivorId) {
  assert(placeOfItem(s, uid) === s.survivors[survivorId].location, 'notHere');
}

function ability(survivorId) {
  return survivorDef(survivorId).ability;
}

// ---------------------------------------------------------------- energy actions

export function attack(s, { survivorId }) {
  requireTurn(s);
  const sv = requireActive(s, survivorId);
  assert(s.locations[sv.location].zombies > 0, 'noZombiesHere');
  const gun = gearOf(s, survivorId).weapon?.gun;
  if (gun) assert((sv.ammo ?? 0) > 0, 'noAmmo');
  const preview = fightPreview(s, survivorId); // HP loss uses the AP left after paying
  pay(s, survivorId, 'attack');
  const killed = removeZombies(s, sv.location, killsPerAttack(s, survivorId));
  creditKills(s, killed);
  let drawn = 0;
  if (gun) {
    sv.ammo -= 1;
    if (random(s) < gun.spawn) { drawn = 1; addZombies(s, sv.location, 1, 'noise'); }
  }
  log(s, 'attack', { survivorId, locationId: sv.location, killed, hp: preview.hp, drawn });
  gainXp(s, survivorId, 'fight');
  damageSurvivor(s, survivorId, preview.hp, 'fight');
}

export function search(s, { survivorId }) {
  const p = requireTurn(s);
  const sv = requireActive(s, survivorId);
  assert(sv.location !== 'colony', 'cannotSearchColony');
  assert(s.locations[sv.location].deck.length > 0, 'deckEmpty');
  assert(!isOverrun(s, sv.location), 'placeOverrun');
  const a = ability(survivorId);
  // GAME-1: a search turns up the next find (2–4 items; a doubleSearch survivor one more), as much as the backpack holds;
  // what does not fit stays there for the next search.
  const loc = s.locations[sv.location];
  const size = loc.batches?.length ? loc.batches.pop() : 2 + (loc.deck.length % 3);
  const want = size + (a.type === 'doubleSearch' && a.location === typeOf(s, sv.location) ? 1 : 0);
  const n = Math.min(packFree(s, survivorId), want, loc.deck.length);
  if (n < size && loc.batches) loc.batches.push(size - n);
  assert(n > 0, 'packFull');
  const chance = Math.max(0, searchSpawnChance(s, sv.location) - (sv.trait === 'scavenger' ? 0.05 : 0));
  pay(s, survivorId, 'search');
  // A blueprint for this place: draw one extra, then put one back (returnCard).
  const blueprint = holdsBlueprint(s, survivorId, sv.location);
  const map = rollMap(s, sv.location);
  const drawn = drawItems(s, sv.location, blueprint ? n + 1 : n, survivorId);
  s.searches[sv.location] = (s.searches[sv.location] ?? 0) + 1;
  s.stats.searches += 1;
  gainXp(s, survivorId, 'search');
  // The noise may make a zombie appear (it does not bite at once).
  const spawned = random(s) < chance;
  log(s, 'search', { survivorId, locationId: sv.location, count: drawn.length, spawned });
  if (map) log(s, 'mapFound', { survivorId, locationId: sv.location });
  if (spawned) addZombies(s, sv.location, 1, 'search');
  if (blueprint && drawn.length > n) p.pick = { locationId: sv.location, uids: drawn };
  return drawn;
}

/** MAP-1: count a search towards the next city map; when it turns up, it lies on top of the pile (drawn now). */
function rollMap(s, locationId) {
  const pr = mapProgress(s);
  if (!pr) return null;
  if (!s.map) s.map = newMap(true); // old saves: the six-place town
  const k = (s.map.searchesSinceMap = pr.done + 1);
  if (k < pr.min || (k < pr.max && random(s) >= 1 / (pr.max - k + 1))) return null;
  const uid = `map${s.map.stage + 1}`;
  s.cards[uid] = 'city-map-piece';
  s.locations[locationId].deck.push(uid);
  const b = s.locations[locationId].batches; if (b?.length) b[b.length - 1] += 1; // (comes with the next find)
  s.map.searchesSinceMap = 0;
  s.map.pending = true;
  return uid;
}

/** Resolve a blueprint search: the chosen card goes back to the bottom of that location's deck. */
export function returnCard(s, { cardUid }) {
  const p = requireTurn(s, { picking: true });
  assert(p.pick, 'notPicking');
  assert(p.pick.uids.includes(cardUid), 'cardNotInHand', cardUid);
  removeFromHand(s, cardUid);
  s.locations[p.pick.locationId].deck.unshift(cardUid);
  p.pick = null;
}

export function barricade(s, { survivorId }) {
  requireTurn(s);
  const sv = requireActive(s, survivorId);
  assert(sv.location === 'colony', 'mustBeInColony'); // barricades only matter at the base
  assert(freeZombieSlots(s, sv.location) > 0, 'noBarricadeSpace');
  pay(s, survivorId, 'barricade');
  const n = (ability(survivorId).type === 'barricadeTwo' ? 2 : 1) + Math.min(1, booksHeld(s, 'barricadePlus'));
  addBarricades(s, sv.location, n);
}

export function lure(s, { survivorId, toLocation }) {
  requireTurn(s);
  const sv = requireActive(s, survivorId);
  assert(s.locations[toLocation], 'noSuchLocation', toLocation);
  assert(toLocation !== sv.location, 'sameLocation');
  assert(s.locations[sv.location].zombies > 0, 'noZombiesHere');
  pay(s, survivorId, 'lure');
  const moved = removeZombies(s, sv.location, ability(survivorId).type === 'lureTwo' ? 2 : 1);
  log(s, 'lure', { survivorId, from: sv.location, to: toLocation, n: moved });
  addZombies(s, toLocation, moved, 'lure');
}

/**
 * Walk somewhere (costs energy, repeatable). A fuel card drives there instead (marked safe).
 */
export function move(s, { survivorId, toLocation, fuelCardUid }) {
  const p = requireTurn(s);
  const sv = requireActive(s, survivorId);
  assert(s.locations[toLocation], 'noSuchLocation', toLocation);
  assert(toLocation !== sv.location, 'sameLocation');
  assert(freeSurvivorSlots(s, toLocation) > 0, 'locationFull');
  if (fuelCardUid) { assert(requireCard(s, p, fuelCardUid).type === 'fuel', 'needFuel'); requireSamePlace(s, fuelCardUid, survivorId); }
  pay(s, survivorId, 'move', toLocation);
  let safe = s.locations[toLocation].zombies === 0;
  if (fuelCardUid) {
    discardCard(s, fuelCardUid);
    safe = true;
  }
  const from = sv.location;
  const bite = fuelCardUid ? 0 : leaveDamage(s, survivorId);
  sv.location = toLocation;
  sv.moved = true;
  log(s, 'move', { survivorId, from, to: toLocation, safe });
  damageSurvivor(s, survivorId, bite, 'escape');
  unpack(s, survivorId);
}

// ---------------------------------------------------------------- gear

/** Equip a weapon, armor or book from the hand on a survivor (free). Whatever was in that slot goes back to the hand. */
export function equip(s, { cardUid, survivorId = null }) {
  const p = requireTurn(s);
  const item = requireCard(s, p, cardUid);
  const slot = gearSlot(item);
  assert(slot, 'notGear');
  const holder = holderOf(s, cardUid);
  const sv = requireSurvivor(s, survivorId ?? (holder !== 'stockpile' ? holder : p.survivors.find((id) => s.survivors[id]?.alive && s.survivors[id].location === 'colony')) ?? '');
  requireSamePlace(s, cardUid, sv.id);
  sv.gear = sv.gear ?? { weapon: null, armor: null, book: null, tool: null };
  const old = sv.gear[slot];
  removeFromHand(s, cardUid);
  // The old item goes where the new one came from.
  if (old) (holder === 'stockpile' ? s.stockpile : s.survivors[holder].pack).push(old);
  sv.gear[slot] = cardUid;
  if (item.gun) sv.ammo = (sv.ammo ?? 0) + item.gun.ammo; // a gun comes loaded
  log(s, 'equip', { survivorId: sv.id, card: s.cards[cardUid], slot });
}

// ---------------------------------------------------------------- cards

/**
 * Play an item card for its effect (strength = item.value).
 * food -> colony supply; medicine -> heal targetSurvivorId; tools -> barricades at the colony;
 * junk -> energy; survivor -> a newcomer joins the team (+1 morale; a full team: +2 morale).
 * Gear is equipped (equip), fuel is burnt when moving.
 */
export function playCard(s, { cardUid, targetSurvivorId }) {
  const p = requireTurn(s);
  const item = requireCard(s, p, cardUid);
  const spend = () => { if (!isPermanent(item)) discardCard(s, cardUid); };
  if (item.growMap) { // MAP-1: read the map at the colony — the city grows one stage
    requireHome(s, cardUid);
    discardCard(s, cardUid);
    growCity(s);
    return;
  }
  switch (item.type) {
    case 'food':
      requireHome(s, cardUid);
      spend();
      changeFood(s, item.value * FOOD.MEALS, 'played');
      break;
    case 'medicine': {
      const sv = requireSurvivor(s, targetSurvivorId);
      assert(sv.wounds > 0 || sv.frostbite, 'notWounded');
      requireSamePlace(s, cardUid, sv.id);
      spend();
      for (let i = 0; i < item.value; i++) healSurvivor(s, sv.id);
      break;
    }
    case 'tools': {
      // Tools go straight onto the base's defences: no target, the card must be at the colony.
      requireHome(s, cardUid);
      assert(freeZombieSlots(s, 'colony') > 0, 'noBarricadeSpace');
      spend();
      addBarricades(s, 'colony', item.value);
      break;
    }
    case 'junk': {
      const h = holderOf(s, cardUid);
      const sv = requireSurvivor(s, targetSurvivorId ?? (h !== 'stockpile' ? h : p.survivors.find((id) => s.survivors[id]?.alive && s.survivors[id].location === 'colony')) ?? '');
      requireSamePlace(s, cardUid, sv.id);
      assert(sv.ap < apMax(s, sv.id), 'energyFull');
      spend();
      gainEnergy(s, ENERGY.JUNK * item.value * (teamHasAbility(s, 'haggler') ? 2 : 1), sv.id);
      break;
    }
    case 'consumable': {
      const h = holderOf(s, cardUid);
      const sv = requireSurvivor(s, targetSurvivorId ?? (h !== 'stockpile' ? h : p.survivors.find((id) => s.survivors[id]?.alive && s.survivors[id].location === 'colony')) ?? '');
      requireSamePlace(s, cardUid, sv.id);
      const u = item.use;
      if (u.ammo) assert(gearOf(s, sv.id).weapon?.gun, 'needGun');
      if (u.burn) assert(s.locations[sv.location].zombies > 0, 'noZombiesHere');
      if (!u.ammo && !u.burn) assert((u.hp && sv.hp < RULES.HP_MAX) || (u.ap && sv.ap < apMax(s, sv.id)), 'energyFull');
      spend();
      if (u.hp) healHp(s, sv.id, u.hp + (holderTrait(s, h) === 'medic' ? 5 : 0));
      if (u.ap) gainEnergy(s, u.ap, sv.id);
      if (u.ammo) sv.ammo = (sv.ammo ?? 0) + u.ammo;
      if (u.burn) creditKills(s, removeZombies(s, sv.location, u.burn));
      break;
    }
    case 'material':
      assert(false, 'craftInstead');
      break;
    case 'survivor':
      removeFromHand(s, cardUid); // they join the colony
      changeMorale(s, recruitSurvivor(s) ? 1 : 2, 'newcomer');
      break;
    case 'fuel':
      assert(false, 'fuelIsPlayedWhenMoving');
      break;
    case 'weapon': case 'armor': case 'book': case 'gadget':
      assert(false, 'equipInstead');
      break;
    default:
      assert(false, 'unplayable');
  }
  log(s, 'play', { card: s.cards[cardUid], type: item.type });
}

export function contribute(s, { cardUid }) {
  const p = requireTurn(s);
  requireCard(s, p, cardUid);
  requireHome(s, cardUid);
  assert(s.crisis, 'noCrisis');
  removeFromHand(s, cardUid);
  s.crisis.contributions.push(cardUid);
  log(s, 'contribute', { card: s.cards[cardUid] });
}

/** Scenario deposit (e.g. fuel for the beacon). Requires a survivor in the colony. */
export function deposit(s, { cardUid }) {
  const p = requireTurn(s);
  const goal = scenarioDef(s).goal;
  assert(goal.type === 'deposit', 'scenarioHasNoDeposit');
  assert(requireCard(s, p, cardUid).type === goal.item, 'wrongItemType');
  requireHome(s, cardUid);
  removeFromHand(s, cardUid);
  s.scenario.deposited += 1;
  log(s, 'deposit', { card: s.cards[cardUid], total: s.scenario.deposited });
}

/** Activated abilities (currently: healer). */
export function useAbility(s, { survivorId, targetSurvivorId }) {
  const p = requireTurn(s);
  const sv = requireSurvivor(s, survivorId);
  assert(ability(survivorId).type === 'healer', 'noActiveAbility');
  assert(!p.abilityUsed[survivorId], 'abilityUsed');
  const target = s.survivors[targetSurvivorId];
  assert(target?.alive && target.location === sv.location, 'targetNotHere');
  assert(target.wounds > 0 || target.frostbite, 'notWounded');
  p.abilityUsed[survivorId] = true;
  healSurvivor(s, targetSurvivorId);
}

/**
 * Hand an item over (free) to a survivor at the same place: from a backpack or, at the colony, from the stockpile.
 * toSurvivorId null = put it in the stockpile (at the colony).
 */
export function give(s, { cardUid, toSurvivorId = null }) {
  const p = requireTurn(s);
  requireCard(s, p, cardUid);
  const from = holderOf(s, cardUid);
  if (!toSurvivorId) {
    assert(from !== 'stockpile' && placeOfItem(s, cardUid) === 'colony', 'notHome');
    removeFromHand(s, cardUid);
    s.stockpile.push(cardUid);
    return;
  }
  const to = requireSurvivor(s, toSurvivorId);
  assert(from !== toSurvivorId, 'sameHolder');
  requireSamePlace(s, cardUid, toSurvivorId);
  assert(packFree(s, toSurvivorId) > 0, 'packFull');
  removeFromHand(s, cardUid);
  to.pack.push(cardUid);
  log(s, 'give', { survivorId: from === 'stockpile' ? toSurvivorId : from, card: s.cards[cardUid], to: toSurvivorId });
}

/** Craft at the colony: the survivor spends AP, the materials leave the stockpile, the item joins it. */
export function craft(s, { recipeId, survivorId }) {
  requireTurn(s);
  const r = RECIPES[recipeId];
  assert(r, 'noSuchRecipe', recipeId);
  const sv = requireActive(s, survivorId);
  assert(sv.location === 'colony', 'mustBeInColony');
  assert(baseLevel(s, 'workshop') >= 1, 'needWorkshop');
  const cost = Math.max(1, r.ap - 3 * (baseLevel(s, 'workshop') - 1));
  const used = [];
  for (const [itemId, n] of Object.entries(r.needs)) {
    const have = s.stockpile.filter((u) => s.cards[u] === itemId && !used.includes(u)).slice(0, n);
    assert(have.length === n, 'missingMaterials', itemId);
    used.push(...have);
  }
  assert(sv.ap >= cost, 'notEnoughEnergy');
  sv.ap -= cost;
  sv.acted = true;
  for (const u of used) discardCard(s, u);
  const uid = `k${Object.keys(s.cards).length}`;
  s.cards[uid] = r.makes;
  s.stockpile.push(uid);
  s.stats.crafts += 1;
  log(s, 'craft', { survivorId, card: r.makes });
}

/**
 * Work on a base upgrade (at the colony). Starting a level takes its materials from the stockpile;
 * then the survivor puts in AP (all they have, up to what is left). Unfinished work carries over.
 */
export function build(s, { buildingId, survivorId }) {
  requireTurn(s);
  const sv = requireActive(s, survivorId);
  assert(sv.location === 'colony', 'mustBeInColony');
  const next = nextLevel(s, buildingId);
  assert(next, 'maxLevel', buildingId);
  // One shift of work: a fixed BUILD_STEP from this survivor (or what is left of the job). Not enough AP: no work.
  const put = Math.min(BUILD_STEP, next.ap - (next.started ? next.spent : 0));
  assert(sv.ap >= put, 'notEnoughEnergy');
  if (!next.started) {
    const used = [];
    for (const [itemId, n] of Object.entries(next.needs)) {
      const have = s.stockpile.filter((u) => s.cards[u] === itemId && !used.includes(u)).slice(0, n);
      assert(have.length === n, 'missingMaterials', itemId);
      used.push(...have);
    }
    for (const u of used) discardCard(s, u);
    s.building[buildingId] = 0;
  }
  sv.ap -= put;
  sv.acted = true;
  s.building[buildingId] += put;
  if (s.building[buildingId] >= next.ap) {
    delete s.building[buildingId];
    s.base[buildingId] = next.level;
    s.stats.builds += 1;
    log(s, 'built', { buildingId, level: next.level });
  } else log(s, 'building', { survivorId, buildingId, n: put });
}

// ---------------------------------------------------------------- rest

/** Nap at the colony: +25 AP +5 HP; that survivor takes no other AP action today. Only before acting. */
export function nap(s, { survivorId }) {
  requireTurn(s);
  const sv = requireActive(s, survivorId);
  assert(sv.location === 'colony', 'mustBeInColony');
  assert(!sv.moved && !sv.acted, 'alreadyActed');
  sv.napped = true;
  gainEnergy(s, REST.NAP_AP, survivorId);
  healHp(s, survivorId, REST.NAP_HP);
  log(s, 'nap', { survivorId });
}

/** Tonight's plan: 'sleep' or 'guard' (guards must be at the colony; each one stops one zombie at the colony tonight). */
export function setRest(s, { survivorId, mode }) {
  requireTurn(s);
  const sv = requireSurvivor(s, survivorId);
  assert(mode === 'sleep' || mode === 'guard', 'badRest');
  if (mode === 'guard') assert(sv.location === 'colony', 'mustBeInColony');
  sv.rest = mode;
}

export function finishTurn(s) {
  requireTurn(s);
  endTurn(s);
}

/** The trait of whoever applies a consumable: its carrier, or (from the stockpile) anyone at the colony with that trait. */
function holderTrait(s, holder) {
  if (holder && holder !== 'stockpile') return s.survivors[holder]?.trait;
  return Object.values(s.survivors).some((v) => v.alive && v.location === 'colony' && v.trait === 'medic') ? 'medic' : null;
}
