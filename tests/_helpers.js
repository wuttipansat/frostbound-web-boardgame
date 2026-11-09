// Test utilities: build games and surgically patch plain-object state.
import { createGame } from '../src/core/state.js';
import { reduce } from '../src/core/reducer.js';
import { draftPick } from '../src/core/actions.js';
import { newSurvivor } from '../src/core/rules/helpers.js';
import { RULES } from '../src/core/constants.js';

export function newGame(opts = {}) {
  const { players = 3, scenarioId = 'beacon', seed = 42, betrayer = 'never' } = opts;
  return createGame({
    players: Array.from({ length: players }, (_, i) => ({ name: `P${i + 1}` })),
    scenarioId, seed, betrayer,
  });
}

/** A game past the draft, forced into a clean TURN phase for the active player. */
export function startedGame(opts = {}) {
  let s = newGame(opts);
  for (const p of s.players) s = reduce(s, draftPick(p.id, p.draftOptions.slice(0, RULES.SURVIVORS_PER_PLAYER)));
  return forceTurn(s);
}

export function forceTurn(s, playerId = s.activePlayerId) {
  const c = structuredClone(s);
  c.phase = 'turn';
  c.pendingCrossroads = null;
  c.activePlayerId = playerId;
  return c;
}

/** Replace a player's survivors with the given ids at the given locations. */
export function setSurvivors(s, playerId, placements) {
  const c = structuredClone(s);
  const p = c.players.find((x) => x.id === playerId);
  for (const id of p.survivors) delete c.survivors[id];
  p.survivors = [];
  for (const [id, location] of Object.entries(placements)) {
    // Steal from whoever had this survivor.
    for (const other of c.players) other.survivors = other.survivors.filter((x) => x !== id);
    c.survivors[id] = newSurvivor(id, playerId, location);
    p.survivors.push(id);
  }
  return c;
}

let extraCard = 0;
/** Put a brand-new card instance of itemId into a player's hand; returns [state, uid]. */
export function giveCard(s, playerId, itemId) {
  const c = structuredClone(s);
  const uid = `t${extraCard++}`;
  c.cards[uid] = itemId;
  c.players.find((x) => x.id === playerId).hand.push(uid);
  return [c, uid];
}

export function setEnergy(s, playerId, n) {
  const c = structuredClone(s);
  c.players.find((x) => x.id === playerId).energy = n;
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

export const player = (s, id) => s.players.find((p) => p.id === id);

/** Find an rng seed value for which `predicate(stateAfter)` holds when running fn (shuffles, draws). */
export function findSeed(s, fn, predicate, tries = 2000) {
  for (let seed = 1; seed < tries; seed++) {
    const c = patch(s, (x) => { x.rng = seed; });
    const after = fn(c);
    if (predicate(after)) return after;
  }
  throw new Error('no seed found');
}
