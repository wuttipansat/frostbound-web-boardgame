// Predicate language used by crossroads triggers and secret objectives.
// All predicates are evaluated for a specific player.
import {
  getPlayer, aliveSurvivorsOf, itemOf,
} from '../selectors.js';

function handCount(s, playerId, type) {
  return getPlayer(s, playerId).hand.filter((uid) => itemOf(s, uid).type === type).length;
}

const PREDICATES = {
  always: () => true,
  all: (s, pid, c) => c.of.every((sub) => evaluate(s, pid, sub)),
  any: (s, pid, c) => c.of.some((sub) => evaluate(s, pid, sub)),

  // board / colony state
  moraleAtMost: (s, _p, c) => s.morale <= c.n,
  moraleAtLeast: (s, _p, c) => s.morale >= c.n,
  foodAtMost: (s, _p, c) => s.food <= c.n,
  foodAtLeast: (s, _p, c) => s.food >= c.n,
  wasteAtLeast: (s, _p, c) => s.waste >= c.n,
  roundAtLeast: (s, _p, c) => s.round >= c.n,
  helplessAtLeast: (s, _p, c) => s.helpless >= c.n,
  colonyZombiesAtLeast: (s, _p, c) => s.locations.colony.zombies >= c.n,

  // player-specific
  survivorAt: (s, pid, c) => aliveSurvivorsOf(s, pid).some((sv) => sv.location === c.location),
  notInColony: (s, pid) => aliveSurvivorsOf(s, pid).some((sv) => sv.location !== 'colony'),
  hasItem: (s, pid, c) => handCount(s, pid, c.item) >= 1,
  handHas: (s, pid, c) => handCount(s, pid, c.item) >= c.count,
  handHasEach: (s, pid, c) => c.items.every((t) => handCount(s, pid, t) >= 1),
  handSizeAtLeast: (s, pid, c) => getPlayer(s, pid).hand.length >= c.n,
  hasWounded: (s, pid) => aliveSurvivorsOf(s, pid).some((sv) => sv.wounds > 0 || sv.frostbite),
  noWoundedSurvivors: (s, pid) => aliveSurvivorsOf(s, pid).every((sv) => sv.wounds === 0 && !sv.frostbite),
  survivorCountAtLeast: (s, pid, c) => aliveSurvivorsOf(s, pid).length >= c.n,
  survivorsAlive: (s, pid, c) => aliveSurvivorsOf(s, pid).length >= c.min,
  killsAtLeast: (s, pid, c) => getPlayer(s, pid).kills >= c.n,
  isExiled: (s, pid) => getPlayer(s, pid).exiled,
};

export function evaluate(s, playerId, cond) {
  const fn = PREDICATES[cond.type];
  if (!fn) throw new Error(`Unknown condition type: ${cond.type}`);
  return !!fn(s, playerId, cond);
}

/** For triggers tied to a place, the focus survivor should be the one standing there. */
export function focusFilterFor(cond) {
  if (cond.type === 'survivorAt') return (sv) => sv.location === cond.location;
  if (cond.type === 'notInColony') return (sv) => sv.location !== 'colony';
  if (cond.type === 'hasWounded') return (sv) => sv.wounds > 0 || sv.frostbite;
  return () => true;
}

export const CONDITION_TYPES = Object.keys(PREDICATES);
