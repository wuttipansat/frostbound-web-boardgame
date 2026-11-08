// Active-player actions: die actions (attack, search, barricade, clean, lure) and free actions.
import { PHASES, LOCATION_IDS, RULES } from '../constants.js';
import { rollD6 } from '../rng.js';
import { assert } from '../errors.js';
import {
  getPlayer, survivorDef, freeSurvivorSlots, freeZombieSlots, itemOf, scenarioDef, booksHeld, holdsBlueprint,
} from '../selectors.js';
import {
  log, rollExposure, drawItems, wasteCard, removeFromHand, addZombies, removeZombies,
  addBarricades, creditKills, healSurvivor, changeFood, changeHelpless, recruitSurvivor,
} from './helpers.js';
import { endTurn } from './flow.js';
import { isPermanent } from '../../content/items.js';

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

function requireDie(p, dieIndex, min = 1) {
  const die = p.dice[dieIndex];
  assert(die, 'noSuchDie', String(dieIndex));
  assert(!die.used, 'dieUsed');
  assert(die.v >= min, 'dieTooLow', `${die.v} < ${min}`);
  return die;
}

function requireCard(s, p, uid) {
  assert(p.hand.includes(uid), 'cardNotInHand', uid);
  return itemOf(s, uid);
}

function ability(survivorId) {
  return survivorDef(survivorId).ability;
}

// ---------------------------------------------------------------- die actions

export function attack(s, { playerId, survivorId, dieIndex }) {
  const p = requireTurn(s, playerId);
  const sv = requireSurvivor(s, playerId, survivorId);
  assert(s.locations[sv.location].zombies > 0, 'noZombiesHere');
  const die = requireDie(p, dieIndex, survivorDef(survivorId).attack);
  die.used = true;
  const killed = removeZombies(s, sv.location, ability(survivorId).type === 'killTwo' ? 2 : 1);
  creditKills(s, playerId, killed);
  log(s, 'attack', { playerId, survivorId, locationId: sv.location, killed, die: die.v });
  if (ability(survivorId).type !== 'noAttackExposure') rollExposure(s, survivorId, 'attack');
}

export function search(s, { playerId, survivorId, dieIndex }) {
  const p = requireTurn(s, playerId);
  const sv = requireSurvivor(s, playerId, survivorId);
  assert(sv.location !== 'colony', 'cannotSearchColony');
  assert(s.locations[sv.location].deck.length > 0, 'deckEmpty');
  const die = requireDie(p, dieIndex, survivorDef(survivorId).search);
  die.used = true;
  const a = ability(survivorId);
  const n = a.type === 'doubleSearch' && a.location === sv.location ? 2 : 1;
  // A blueprint for this place: draw one extra, then put one back (returnCard).
  const blueprint = holdsBlueprint(s, playerId, sv.location);
  const drawn = drawItems(s, playerId, sv.location, blueprint ? n + 1 : n);
  log(s, 'search', { playerId, survivorId, locationId: sv.location, count: drawn.length, die: die.v });
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

export function barricade(s, { playerId, survivorId, dieIndex }) {
  const p = requireTurn(s, playerId);
  const sv = requireSurvivor(s, playerId, survivorId);
  assert(freeZombieSlots(s, sv.location) > 0, 'noBarricadeSpace');
  const die = requireDie(p, dieIndex);
  die.used = true;
  const n = (ability(survivorId).type === 'barricadeTwo' ? 2 : 1) + Math.min(1, booksHeld(s, 'barricadePlus', playerId));
  addBarricades(s, sv.location, n);
}

export function clean(s, { playerId, survivorId, dieIndex }) {
  const p = requireTurn(s, playerId);
  const sv = requireSurvivor(s, playerId, survivorId);
  assert(sv.location === 'colony', 'mustBeInColony');
  assert(s.waste > 0, 'nothingToClean');
  const die = requireDie(p, dieIndex);
  die.used = true;
  const amount = ability(survivorId).type === 'cleanFive' ? 5 : RULES.CLEAN_AMOUNT;
  const removed = Math.min(amount, s.waste);
  s.waste -= removed;
  log(s, 'clean', { playerId, survivorId, removed, value: s.waste });
}

export function lure(s, { playerId, survivorId, dieIndex, toLocation }) {
  const p = requireTurn(s, playerId);
  const sv = requireSurvivor(s, playerId, survivorId);
  assert(LOCATION_IDS.includes(toLocation), 'noSuchLocation', toLocation);
  assert(toLocation !== sv.location, 'sameLocation');
  assert(s.locations[sv.location].zombies > 0, 'noZombiesHere');
  const die = requireDie(p, dieIndex);
  die.used = true;
  const moved = removeZombies(s, sv.location, ability(survivorId).type === 'lureTwo' ? 2 : 1);
  log(s, 'lure', { playerId, survivorId, from: sv.location, to: toLocation, n: moved });
  addZombies(s, toLocation, moved, 'lure');
}

// ---------------------------------------------------------------- free actions

export function move(s, { playerId, survivorId, toLocation, fuelCardUid }) {
  const p = requireTurn(s, playerId);
  const sv = requireSurvivor(s, playerId, survivorId);
  assert(LOCATION_IDS.includes(toLocation), 'noSuchLocation', toLocation);
  assert(toLocation !== sv.location, 'sameLocation');
  assert(!sv.moved, 'alreadyMoved');
  assert(!(p.exiled && toLocation === 'colony'), 'exiledFromColony');
  assert(freeSurvivorSlots(s, toLocation) > 0, 'locationFull');
  let safe = ability(survivorId).type === 'noMoveExposure';
  if (fuelCardUid) {
    assert(requireCard(s, p, fuelCardUid).type === 'fuel', 'needFuel');
    wasteCard(s, playerId, fuelCardUid);
    safe = true;
  }
  const from = sv.location;
  sv.location = toLocation;
  sv.moved = true;
  log(s, 'move', { playerId, survivorId, from, to: toLocation, safe });
  if (!safe) rollExposure(s, survivorId, 'move');
}

/**
 * Play an item card for its effect (strength = item.value).
 * food -> colony supply; medicine -> heal targetSurvivorId; tools -> barricades at targetSurvivorId;
 * weapon -> kill zombies at targetSurvivorId, or anywhere (targetLocation) for long guns, no exposure;
 * junk -> reroll dieIndex (and dieIndex2); survivor -> recruit to your group.
 * Weapons are permanent: they stay in hand and work once per turn. Books are passive; fuel is used when moving.
 */
export function playCard(s, { playerId, cardUid, targetSurvivorId, targetLocation, dieIndex, dieIndex2 }) {
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
    case 'weapon': {
      assert(!(p.usedCards ?? []).includes(cardUid), 'cardUsedThisTurn');
      let where;
      if (item.range === 'any') {
        assert(LOCATION_IDS.includes(targetLocation), 'noSuchLocation', targetLocation);
        assert(p.survivors.some((id) => s.survivors[id]?.alive), 'noSuchSurvivor');
        where = targetLocation;
      } else {
        where = requireSurvivor(s, playerId, targetSurvivorId).location;
      }
      assert(s.locations[where].zombies > 0, 'noZombiesHere');
      spend();
      p.usedCards = [...(p.usedCards ?? []), cardUid];
      creditKills(s, playerId, removeZombies(s, where, item.value));
      break;
    }
    case 'junk': {
      const dice = [requireDie(p, dieIndex)];
      if (item.value > 1 && dieIndex2 != null && dieIndex2 !== dieIndex) dice.push(requireDie(p, dieIndex2));
      spend();
      for (const die of dice) die.v = rollD6(s);
      break;
    }
    case 'survivor': {
      assert(s.survivorDeck.length > 0, 'noSurvivorsLeft');
      removeFromHand(s, playerId, cardUid); // they join you; the card is not waste
      recruitSurvivor(s, playerId);
      if (item.helpless) changeHelpless(s, item.helpless, 'recruited');
      break;
    }
    case 'fuel':
      assert(false, 'fuelIsPlayedWhenMoving');
      break;
    case 'book':
      assert(false, 'passiveItem');
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

/** Scenario deposit (e.g. fuel for the beacon). Requires one of your survivors in the colony. */
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

