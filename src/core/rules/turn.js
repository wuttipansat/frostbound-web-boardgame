// Active-player actions. Everything that takes effort costs the survivor's energy (no dice anywhere);
// cards, gear and abilities are free.
import { PHASES, LOCATION_IDS, ENERGY } from '../constants.js';
import { assert } from '../errors.js';
import {
  survivorDef, freeSurvivorSlots, freeZombieSlots, itemOf, scenarioDef, booksHeld, holdsBlueprint,
  actionCost, killsPerAttack, energyMax, teamHasAbility,
} from '../selectors.js';
import {
  log, drawItems, discardCard, removeFromHand, addZombies, removeZombies,
  addBarricades, creditKills, healSurvivor, changeFood, changeMorale, recruitSurvivor,
  spendEnergy, gainEnergy,
} from './helpers.js';
import { endTurn } from './flow.js';
import { isPermanent, gearSlot } from '../../content/items.js';

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

/** Pay an action's energy. */
function pay(s, survivorId, kind, to = null) {
  spendEnergy(s, actionCost(s, survivorId, kind, to));
}

function requireCard(s, p, uid) {
  assert(p.hand.includes(uid), 'cardNotInHand', uid);
  return itemOf(s, uid);
}

function ability(survivorId) {
  return survivorDef(survivorId).ability;
}

// ---------------------------------------------------------------- energy actions

export function attack(s, { survivorId }) {
  requireTurn(s);
  const sv = requireSurvivor(s, survivorId);
  assert(s.locations[sv.location].zombies > 0, 'noZombiesHere');
  pay(s, survivorId, 'attack');
  const killed = removeZombies(s, sv.location, killsPerAttack(s, survivorId));
  creditKills(s, killed);
  log(s, 'attack', { survivorId, locationId: sv.location, killed });
}

export function search(s, { survivorId }) {
  const p = requireTurn(s);
  const sv = requireSurvivor(s, survivorId);
  assert(sv.location !== 'colony', 'cannotSearchColony');
  assert(s.locations[sv.location].deck.length > 0, 'deckEmpty');
  pay(s, survivorId, 'search');
  const a = ability(survivorId);
  const n = a.type === 'doubleSearch' && a.location === sv.location ? 2 : 1;
  // A blueprint for this place: draw one extra, then put one back (returnCard).
  const blueprint = holdsBlueprint(s, survivorId, sv.location);
  const drawn = drawItems(s, sv.location, blueprint ? n + 1 : n);
  log(s, 'search', { survivorId, locationId: sv.location, count: drawn.length });
  if (blueprint && drawn.length > n) p.pick = { locationId: sv.location, uids: drawn };
  return drawn;
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
  const sv = requireSurvivor(s, survivorId);
  assert(freeZombieSlots(s, sv.location) > 0, 'noBarricadeSpace');
  pay(s, survivorId, 'barricade');
  const n = (ability(survivorId).type === 'barricadeTwo' ? 2 : 1) + Math.min(1, booksHeld(s, 'barricadePlus'));
  addBarricades(s, sv.location, n);
}

export function lure(s, { survivorId, toLocation }) {
  requireTurn(s);
  const sv = requireSurvivor(s, survivorId);
  assert(LOCATION_IDS.includes(toLocation), 'noSuchLocation', toLocation);
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
  const sv = requireSurvivor(s, survivorId);
  assert(LOCATION_IDS.includes(toLocation), 'noSuchLocation', toLocation);
  assert(toLocation !== sv.location, 'sameLocation');
  assert(freeSurvivorSlots(s, toLocation) > 0, 'locationFull');
  if (fuelCardUid) assert(requireCard(s, p, fuelCardUid).type === 'fuel', 'needFuel');
  pay(s, survivorId, 'move', toLocation);
  let safe = s.locations[toLocation].zombies === 0;
  if (fuelCardUid) {
    discardCard(s, fuelCardUid);
    safe = true;
  }
  const from = sv.location;
  sv.location = toLocation;
  sv.moved = true;
  log(s, 'move', { survivorId, from, to: toLocation, safe });
}

// ---------------------------------------------------------------- gear

/** Equip a weapon, armor or book from the hand on a survivor (free). Whatever was in that slot goes back to the hand. */
export function equip(s, { cardUid, survivorId = null }) {
  const p = requireTurn(s);
  const item = requireCard(s, p, cardUid);
  const slot = gearSlot(item);
  assert(slot, 'notGear');
  const sv = requireSurvivor(s, survivorId ?? p.survivors.find((id) => s.survivors[id]?.alive));
  sv.gear = sv.gear ?? { weapon: null, armor: null, book: null };
  const old = sv.gear[slot];
  removeFromHand(s, cardUid);
  if (old) p.hand.push(old);
  sv.gear[slot] = cardUid;
  log(s, 'equip', { survivorId: sv.id, card: s.cards[cardUid], slot });
}

// ---------------------------------------------------------------- cards

/**
 * Play an item card for its effect (strength = item.value).
 * food -> colony supply; medicine -> heal targetSurvivorId; tools -> barricades at targetSurvivorId;
 * junk -> energy; survivor -> a newcomer joins the team (+1 morale; a full team: +2 morale).
 * Gear is equipped (equip), fuel is burnt when moving.
 */
export function playCard(s, { cardUid, targetSurvivorId }) {
  const p = requireTurn(s);
  const item = requireCard(s, p, cardUid);
  const spend = () => { if (!isPermanent(item)) discardCard(s, cardUid); };
  switch (item.type) {
    case 'food':
      spend();
      changeFood(s, item.value, 'played');
      break;
    case 'medicine': {
      const sv = requireSurvivor(s, targetSurvivorId);
      assert(sv.wounds > 0 || sv.frostbite, 'notWounded');
      spend();
      for (let i = 0; i < item.value; i++) healSurvivor(s, sv.id);
      break;
    }
    case 'tools': {
      const sv = requireSurvivor(s, targetSurvivorId);
      assert(freeZombieSlots(s, sv.location) > 0, 'noBarricadeSpace');
      spend();
      addBarricades(s, sv.location, item.value);
      break;
    }
    case 'junk':
      assert(p.energy < energyMax(s), 'energyFull');
      spend();
      gainEnergy(s, ENERGY.JUNK * item.value * (teamHasAbility(s, 'haggler') ? 2 : 1), energyMax(s));
      break;
    case 'survivor':
      removeFromHand(s, cardUid); // they join the colony
      changeMorale(s, recruitSurvivor(s) ? 1 : 2, 'newcomer');
      break;
    case 'fuel':
      assert(false, 'fuelIsPlayedWhenMoving');
      break;
    case 'weapon': case 'armor': case 'book':
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
  assert(p.survivors.some((id) => s.survivors[id]?.alive && s.survivors[id].location === 'colony'), 'mustBeInColony');
  assert(requireCard(s, p, cardUid).type === goal.item, 'wrongItemType');
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

export function finishTurn(s) {
  requireTurn(s);
  endTurn(s);
}
