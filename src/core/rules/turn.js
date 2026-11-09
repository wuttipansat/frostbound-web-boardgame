// Active-player actions: die actions (attack, search, barricade, clean, lure) and free actions.
import { PHASES, LOCATION_IDS, RULES } from '../constants.js';
import { rollD6 } from '../rng.js';
import { assert } from '../errors.js';
import {
  getPlayer, survivorDef, freeSurvivorSlots, freeZombieSlots, itemOf, scenarioDef, booksHeld, holdsBlueprint,
  isFrostbound, actionCost,
} from '../selectors.js';
import {
  log, rollExposure, drawItems, wasteCard, removeFromHand, addZombies, removeZombies,
  addBarricades, creditKills, healSurvivor, changeFood, changeHelpless, recruitSurvivor,
  spendEnergy, gainEnergy, drawDanger,
} from './helpers.js';
import { ENERGY } from '../constants.js';
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

/**
 * Pay for an action: classic = spend a die (value >= min); Frostbound = spend energy (actionCost).
 * Returns the die value (classic) or null. Any paid action ends a "search deeper" chance.
 */
function pay(s, p, survivorId, kind, dieIndex, min = 1, to = null) {
  if (isFrostbound(s)) {
    spendEnergy(s, p.id, actionCost(s, survivorId, kind, to));
    p.lastSearch = null;
    return null;
  }
  const die = requireDie(p, dieIndex, min);
  die.used = true;
  return die.v;
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
  const v = pay(s, p, survivorId, 'attack', dieIndex, survivorDef(survivorId).attack);
  const killed = removeZombies(s, sv.location, ability(survivorId).type === 'killTwo' ? 2 : 1);
  creditKills(s, playerId, killed);
  log(s, 'attack', { playerId, survivorId, locationId: sv.location, killed, die: v });
  // Frostbound: only a bare-handed fight is risky (a weapon in hand keeps them at bay).
  const armed = isFrostbound(s) && p.hand.some((u) => itemOf(s, u).type === 'weapon');
  if (ability(survivorId).type !== 'noAttackExposure' && !armed) rollExposure(s, survivorId, 'attack');
}

export function search(s, { playerId, survivorId, dieIndex }) {
  const p = requireTurn(s, playerId);
  const sv = requireSurvivor(s, playerId, survivorId);
  assert(sv.location !== 'colony', 'cannotSearchColony');
  assert(s.locations[sv.location].deck.length > 0, 'deckEmpty');
  const v = pay(s, p, survivorId, 'search', dieIndex, survivorDef(survivorId).search);
  const a = ability(survivorId);
  const n = a.type === 'doubleSearch' && a.location === sv.location ? 2 : 1;
  // A blueprint for this place: draw one extra, then put one back (returnCard).
  const blueprint = holdsBlueprint(s, playerId, sv.location);
  const drawn = drawItems(s, playerId, sv.location, blueprint ? n + 1 : n);
  log(s, 'search', { playerId, survivorId, locationId: sv.location, count: drawn.length, die: v });
  if (blueprint && drawn.length > n) p.pick = { locationId: sv.location, uids: drawn };
  if (isFrostbound(s)) p.lastSearch = { survivorId, locationId: sv.location };
  return drawn;
}

/** Frostbound: right after a search, dig deeper for free — one more card, then a danger card. Repeatable. */
export function searchDeeper(s, { playerId, survivorId }) {
  const p = requireTurn(s, playerId);
  assert(isFrostbound(s), 'classicRules');
  const sv = requireSurvivor(s, playerId, survivorId);
  assert(p.lastSearch && p.lastSearch.survivorId === survivorId && p.lastSearch.locationId === sv.location, 'searchFirst');
  assert(s.locations[sv.location].deck.length > 0, 'deckEmpty');
  const drawn = drawItems(s, playerId, sv.location, 1);
  log(s, 'searchDeeper', { playerId, survivorId, locationId: sv.location, count: drawn.length });
  drawDanger(s, survivorId, 'deeper');
  if (!s.survivors[survivorId].alive) p.lastSearch = null;
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
  pay(s, p, survivorId, 'barricade', dieIndex);
  const n = (ability(survivorId).type === 'barricadeTwo' ? 2 : 1) + Math.min(1, booksHeld(s, 'barricadePlus', playerId));
  addBarricades(s, sv.location, n);
}

export function clean(s, { playerId, survivorId, dieIndex }) {
  const p = requireTurn(s, playerId);
  const sv = requireSurvivor(s, playerId, survivorId);
  assert(sv.location === 'colony', 'mustBeInColony');
  assert(s.waste > 0, 'nothingToClean');
  pay(s, p, survivorId, 'clean', dieIndex);
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
  pay(s, p, survivorId, 'lure', dieIndex);
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
  const fb = isFrostbound(s);
  // Classic: one free move per survivor per turn. Frostbound: moving costs energy instead.
  assert(fb || !sv.moved, 'alreadyMoved');
  assert(!(p.exiled && toLocation === 'colony'), 'exiledFromColony');
  assert(freeSurvivorSlots(s, toLocation) > 0, 'locationFull');
  let safe = ability(survivorId).type === 'noMoveExposure';
  if (fuelCardUid) assert(requireCard(s, p, fuelCardUid).type === 'fuel', 'needFuel');
  if (fb) pay(s, p, survivorId, 'move', null, 1, toLocation);
  if (fuelCardUid) {
    wasteCard(s, playerId, fuelCardUid);
    safe = true;
  }
  // Frostbound: walking into a place with zombies draws a danger card; empty places are safe.
  if (fb && s.locations[toLocation].zombies === 0) safe = true;
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
      if (isFrostbound(s)) { spend(); gainEnergy(s, playerId, ENERGY.JUNK * item.value, ENERGY.MAX + 20); break; }
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

