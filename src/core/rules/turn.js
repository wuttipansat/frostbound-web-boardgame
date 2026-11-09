// Active-player actions. Everything that takes effort costs the survivor's energy (no dice anywhere);
// cards, gear and abilities are free. Danger comes from the shared danger deck (helpers.drawDanger).
import { PHASES, LOCATION_IDS, RULES, ENERGY } from '../constants.js';
import { assert } from '../errors.js';
import {
  getPlayer, survivorDef, freeSurvivorSlots, freeZombieSlots, itemOf, scenarioDef, booksHeld, holdsBlueprint,
  actionCost, gearOf, killsPerAttack, energyMax,
} from '../selectors.js';
import {
  log, rollExposure, drawItems, wasteCard, removeFromHand, addZombies, removeZombies,
  addBarricades, creditKills, healSurvivor, changeFood, changeHelpless, changeMorale,
  spendEnergy, gainEnergy,
} from './helpers.js';
import { endTurn } from './flow.js';
import { isPermanent, gearSlot } from '../../content/items.js';

// ---------------------------------------------------------------- guards

function requireTurn(s, playerId, { picking = false } = {}) {
  assert(s.phase === PHASES.TURN, 'wrongPhase', s.phase);
  assert(playerId === s.activePlayerId, 'notYourTurn');
  const p = getPlayer(s, playerId);
  assert(picking || !p.pick, 'pickPending');
  return p;
}

function requireSurvivor(s, playerId, survivorId) {
  const sv = s.survivors[survivorId];
  assert(sv && sv.alive, 'noSuchSurvivor', survivorId);
  assert(sv.owner === playerId, 'notYourSurvivor', survivorId);
  return sv;
}

/** Pay an action's energy. */
function pay(s, p, survivorId, kind, to = null) {
  spendEnergy(s, p.id, actionCost(s, survivorId, kind, to));
}

function requireCard(s, p, uid) {
  assert(p.hand.includes(uid), 'cardNotInHand', uid);
  return itemOf(s, uid);
}

function ability(survivorId) {
  return survivorDef(survivorId).ability;
}

// ---------------------------------------------------------------- energy actions

export function attack(s, { playerId, survivorId }) {
  const p = requireTurn(s, playerId);
  const sv = requireSurvivor(s, playerId, survivorId);
  assert(s.locations[sv.location].zombies > 0, 'noZombiesHere');
  pay(s, p, survivorId, 'attack');
  const killed = removeZombies(s, sv.location, killsPerAttack(s, survivorId));
  creditKills(s, playerId, killed);
  log(s, 'attack', { playerId, survivorId, locationId: sv.location, killed });
  // A bare-handed fight is risky; a weapon keeps them at bay.
  const armed = !!gearOf(s, playerId).weapon;
  if (ability(survivorId).type !== 'noAttackExposure' && !armed) rollExposure(s, survivorId, 'attack');
}

export function search(s, { playerId, survivorId }) {
  const p = requireTurn(s, playerId);
  const sv = requireSurvivor(s, playerId, survivorId);
  assert(sv.location !== 'colony', 'cannotSearchColony');
  assert(s.locations[sv.location].deck.length > 0, 'deckEmpty');
  pay(s, p, survivorId, 'search');
  const a = ability(survivorId);
  const n = a.type === 'doubleSearch' && a.location === sv.location ? 2 : 1;
  // A blueprint for this place: draw one extra, then put one back (returnCard).
  const blueprint = holdsBlueprint(s, playerId, sv.location);
  const drawn = drawItems(s, playerId, sv.location, blueprint ? n + 1 : n);
  log(s, 'search', { playerId, survivorId, locationId: sv.location, count: drawn.length });
  if (blueprint && drawn.length > n) p.pick = { locationId: sv.location, uids: drawn };
  return drawn;
}

/** Resolve a blueprint search: the chosen card goes back to the bottom of that location's deck. */
export function returnCard(s, { playerId, cardUid }) {
  const p = requireTurn(s, playerId, { picking: true });
  assert(p.pick, 'notPicking');
  assert(p.pick.uids.includes(cardUid), 'cardNotInHand', cardUid);
  removeFromHand(s, playerId, cardUid);
  s.locations[p.pick.locationId].deck.unshift(cardUid);
  p.pick = null;
}

export function barricade(s, { playerId, survivorId }) {
  const p = requireTurn(s, playerId);
  const sv = requireSurvivor(s, playerId, survivorId);
  assert(freeZombieSlots(s, sv.location) > 0, 'noBarricadeSpace');
  pay(s, p, survivorId, 'barricade');
  const n = (ability(survivorId).type === 'barricadeTwo' ? 2 : 1) + Math.min(1, booksHeld(s, 'barricadePlus', playerId));
  addBarricades(s, sv.location, n);
}

export function clean(s, { playerId, survivorId }) {
  const p = requireTurn(s, playerId);
  const sv = requireSurvivor(s, playerId, survivorId);
  assert(sv.location === 'colony', 'mustBeInColony');
  assert(s.waste > 0, 'nothingToClean');
  pay(s, p, survivorId, 'clean');
  const amount = ability(survivorId).type === 'cleanFive' ? 5 : RULES.CLEAN_AMOUNT;
  const removed = Math.min(amount, s.waste);
  s.waste -= removed;
  log(s, 'clean', { playerId, survivorId, removed, value: s.waste });
}

export function lure(s, { playerId, survivorId, toLocation }) {
  const p = requireTurn(s, playerId);
  const sv = requireSurvivor(s, playerId, survivorId);
  assert(LOCATION_IDS.includes(toLocation), 'noSuchLocation', toLocation);
  assert(toLocation !== sv.location, 'sameLocation');
  assert(s.locations[sv.location].zombies > 0, 'noZombiesHere');
  pay(s, p, survivorId, 'lure');
  const moved = removeZombies(s, sv.location, ability(survivorId).type === 'lureTwo' ? 2 : 1);
  log(s, 'lure', { playerId, survivorId, from: sv.location, to: toLocation, n: moved });
  addZombies(s, toLocation, moved, 'lure');
}

/**
 * Walk somewhere (costs energy, repeatable). Walking into a place with zombies draws a danger card,
 * unless the survivor never draws when moving or burns a fuel card to drive there.
 */
export function move(s, { playerId, survivorId, toLocation, fuelCardUid }) {
  const p = requireTurn(s, playerId);
  const sv = requireSurvivor(s, playerId, survivorId);
  assert(LOCATION_IDS.includes(toLocation), 'noSuchLocation', toLocation);
  assert(toLocation !== sv.location, 'sameLocation');
  assert(!(p.exiled && toLocation === 'colony'), 'exiledFromColony');
  assert(freeSurvivorSlots(s, toLocation) > 0, 'locationFull');
  if (fuelCardUid) assert(requireCard(s, p, fuelCardUid).type === 'fuel', 'needFuel');
  pay(s, p, survivorId, 'move', toLocation);
  let safe = ability(survivorId).type === 'noMoveExposure' || s.locations[toLocation].zombies === 0;
  if (fuelCardUid) {
    wasteCard(s, playerId, fuelCardUid);
    safe = true;
  }
  const from = sv.location;
  sv.location = toLocation;
  sv.moved = true;
  log(s, 'move', { playerId, survivorId, from, to: toLocation, safe });
  if (!safe) rollExposure(s, survivorId, 'move');
}

// ---------------------------------------------------------------- gear

/** Equip a weapon, armor or book from your hand (free). Whatever was in that slot goes back to your hand. */
export function equip(s, { playerId, cardUid }) {
  const p = requireTurn(s, playerId);
  const item = requireCard(s, p, cardUid);
  const slot = gearSlot(item);
  assert(slot, 'notGear');
  p.gear = p.gear ?? { weapon: null, armor: null, book: null };
  const old = p.gear[slot];
  removeFromHand(s, playerId, cardUid);
  if (old) p.hand.push(old);
  p.gear[slot] = cardUid;
  log(s, 'equip', { playerId, card: s.cards[cardUid], slot });
}

// ---------------------------------------------------------------- cards

/**
 * Play an item card for its effect (strength = item.value).
 * food -> colony supply; medicine -> heal targetSurvivorId; tools -> barricades at targetSurvivorId;
 * junk -> energy; survivor -> a newcomer joins the colony (helpless, but hope: +1 morale).
 * Gear is equipped (equip), fuel is burnt when moving.
 */
export function playCard(s, { playerId, cardUid, targetSurvivorId }) {
  const p = requireTurn(s, playerId);
  const item = requireCard(s, p, cardUid);
  const spend = () => { if (!isPermanent(item)) wasteCard(s, playerId, cardUid); };
  switch (item.type) {
    case 'food':
      assert(!p.exiled, 'exiledFromColony');
      spend();
      changeFood(s, item.value, 'played');
      break;
    case 'medicine': {
      const sv = requireSurvivor(s, playerId, targetSurvivorId);
      assert(sv.wounds > 0 || sv.frostbite, 'notWounded');
      spend();
      for (let i = 0; i < item.value; i++) healSurvivor(s, sv.id);
      break;
    }
    case 'tools': {
      const sv = requireSurvivor(s, playerId, targetSurvivorId);
      assert(freeZombieSlots(s, sv.location) > 0, 'noBarricadeSpace');
      spend();
      addBarricades(s, sv.location, item.value);
      break;
    }
    case 'junk':
      assert(p.energy < energyMax(s, playerId), 'energyFull');
      spend();
      gainEnergy(s, playerId, ENERGY.JUNK * item.value, energyMax(s, playerId));
      break;
    case 'survivor':
      assert(!p.exiled, 'exiledFromColony');
      removeFromHand(s, playerId, cardUid); // they join the colony; the card is not waste
      changeHelpless(s, 1 + (item.helpless ?? 0), 'newcomer');
      changeMorale(s, 1, 'newcomer');
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
  log(s, 'play', { playerId, card: s.cards[cardUid], type: item.type });
}

export function contribute(s, { playerId, cardUid }) {
  const p = requireTurn(s, playerId);
  assert(!p.exiled, 'exiledFromColony');
  requireCard(s, p, cardUid);
  assert(s.crisis, 'noCrisis');
  removeFromHand(s, playerId, cardUid);
  s.crisis.contributions.push({ uid: cardUid, playerId });
  log(s, 'contribute', { playerId }); // face down: the card is NOT logged
}

/** Scenario deposit (e.g. fuel for the beacon). Requires your survivor in the colony. */
export function deposit(s, { playerId, cardUid }) {
  const p = requireTurn(s, playerId);
  const goal = scenarioDef(s).goal;
  assert(goal.type === 'deposit', 'scenarioHasNoDeposit');
  assert(!p.exiled, 'exiledFromColony');
  assert(p.survivors.some((id) => s.survivors[id].location === 'colony'), 'mustBeInColony');
  assert(requireCard(s, p, cardUid).type === goal.item, 'wrongItemType');
  removeFromHand(s, playerId, cardUid);
  s.scenario.deposited += 1;
  log(s, 'deposit', { playerId, card: s.cards[cardUid], total: s.scenario.deposited });
}

/** Activated abilities (currently: healer). */
export function useAbility(s, { playerId, survivorId, targetSurvivorId }) {
  const p = requireTurn(s, playerId);
  const sv = requireSurvivor(s, playerId, survivorId);
  assert(ability(survivorId).type === 'healer', 'noActiveAbility');
  assert(!p.abilityUsed[survivorId], 'abilityUsed');
  const target = s.survivors[targetSurvivorId];
  assert(target?.alive && target.location === sv.location, 'targetNotHere');
  assert(target.wounds > 0 || target.frostbite, 'notWounded');
  p.abilityUsed[survivorId] = true;
  healSurvivor(s, targetSurvivorId);
}

export function finishTurn(s, { playerId }) {
  requireTurn(s, playerId);
  endTurn(s);
}
