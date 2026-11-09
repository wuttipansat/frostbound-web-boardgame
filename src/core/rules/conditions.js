// Predicate language used by crossroads triggers (evaluated for the solo team).
import { aliveSurvivors, itemOf } from '../selectors.js';

function handCount(s, type) {
  return s.team.hand.filter((uid) => itemOf(s, uid).type === type).length;
}

const PREDICATES = {
  always: () => true,
  all: (s, c) => c.of.every((sub) => evaluate(s, sub)),
  any: (s, c) => c.of.some((sub) => evaluate(s, sub)),

  // board / colony state
  moraleAtMost: (s, c) => s.morale <= c.n,
  moraleAtLeast: (s, c) => s.morale >= c.n,
  foodAtMost: (s, c) => s.food <= c.n,
  foodAtLeast: (s, c) => s.food >= c.n,
  wasteAtLeast: (s, c) => s.waste >= c.n,
  roundAtLeast: (s, c) => s.round >= c.n,
  helplessAtLeast: (s, c) => s.helpless >= c.n,
  colonyZombiesAtLeast: (s, c) => s.locations.colony.zombies >= c.n,

  // the team
  survivorAt: (s, c) => aliveSurvivors(s).some((sv) => sv.location === c.location),
  notInColony: (s) => aliveSurvivors(s).some((sv) => sv.location !== 'colony'),
  hasItem: (s, c) => handCount(s, c.item) >= 1,
  handHas: (s, c) => handCount(s, c.item) >= c.count,
  handHasEach: (s, c) => c.items.every((t) => handCount(s, t) >= 1),
  handSizeAtLeast: (s, c) => s.team.hand.length >= c.n,
  hasWounded: (s) => aliveSurvivors(s).some((sv) => sv.wounds > 0 || sv.frostbite),
  noWoundedSurvivors: (s) => aliveSurvivors(s).every((sv) => sv.wounds === 0 && !sv.frostbite),
  survivorCountAtLeast: (s, c) => aliveSurvivors(s).length >= c.n,
  survivorsAlive: (s, c) => aliveSurvivors(s).length >= c.min,
  killsAtLeast: (s, c) => s.team.kills >= c.n,
};

export function evaluate(s, cond) {
  const fn = PREDICATES[cond.type];
  if (!fn) throw new Error(`Unknown condition type: ${cond.type}`);
  return !!fn(s, cond);
}

/** For triggers tied to a place, the focus survivor should be the one standing there. */
export function focusFilterFor(cond) {
  if (cond.type === 'survivorAt') return (sv) => sv.location === cond.location;
  if (cond.type === 'notInColony') return (sv) => sv.location !== 'colony';
  if (cond.type === 'hasWounded') return (sv) => sv.wounds > 0 || sv.frostbite;
  return () => true;
}

export const CONDITION_TYPES = Object.keys(PREDICATES);
