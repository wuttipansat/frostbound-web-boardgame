// Test utilities: build solo games and surgically patch plain-object state.
import { createGame } from '../src/core/state.js';
import { reduce } from '../src/core/reducer.js';
import { draftPick } from '../src/core/actions.js';
import { newSurvivor } from '../src/core/rules/helpers.js';
import { RULES } from '../src/core/constants.js';

export function newGame(opts = {}) {
  const { scenarioId = 'beacon', seed = 42 } = opts;
  return createGame({ scenarioId, seed });
}

/** A game past the draft, forced into a clean TURN phase. */
export function startedGame(opts = {}) {
  let s = newGame(opts);
  s = reduce(s, draftPick(s.team.draftOptions.slice(0, RULES.TEAM_START)));
  return forceTurn(s);
}

export function forceTurn(s) {
  const c = structuredClone(s);
  c.phase = 'turn';
  c.pendingCrossroads = null;
  return c;
}

/** Replace the team's survivors with the given ids at the given locations. */
export function setSurvivors(s, placements) {
  const c = structuredClone(s);
  const p = c.team;
  for (const id of p.survivors) delete c.survivors[id];
  p.survivors = [];
  for (const [id, location] of Object.entries(placements)) {
    c.survivors[id] = newSurvivor(id, location);
    p.survivors.push(id);
  }
  return c;
}

let extraCard = 0;
/** Put a brand-new card instance of itemId into the hand; returns [state, uid]. */
export function giveCard(s, itemId) {
  const c = structuredClone(s);
  const uid = `t${extraCard++}`;
  c.cards[uid] = itemId;
  c.team.hand.push(uid);
  return [c, uid];
}

export function setEnergy(s, n) {
  const c = structuredClone(s);
  c.team.energy = n;
  return c;
}

/** Put danger cards on top of the danger deck (the last one listed is drawn first). */
export function topDanger(s, ...kinds) {
  const c = structuredClone(s);
  c.danger.deck.push(...kinds);
  return c;
}

export function patch(s, fn) {
  const c = structuredClone(s);
  fn(c);
  return c;
}

/** Find an rng seed value for which `predicate(stateAfter)` holds when running fn (shuffles, draws). */
export function findSeed(s, fn, predicate, tries = 2000) {
  for (let seed = 1; seed < tries; seed++) {
    const c = patch(s, (x) => { x.rng = seed; });
    const after = fn(c);
    if (predicate(after)) return after;
  }
  throw new Error('no seed found');
}
