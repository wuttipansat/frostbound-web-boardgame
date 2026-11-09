import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/core/state.js';
import { reduce, tryReduce, serialize, deserialize } from '../src/core/reducer.js';
import { draftPick } from '../src/core/actions.js';
import { RULES } from '../src/core/constants.js';
import { SURVIVORS_BY_ID } from '../src/content/survivors.js';
import { random, shuffle } from '../src/core/rng.js';
import { newGame } from './_helpers.js';

test('rng is deterministic and shuffle is a permutation', () => {
  const a = { rng: 123 }; const b = { rng: 123 };
  assert.deepEqual([random(a), random(a)], [random(b), random(b)]);
  const arr = [1, 2, 3, 4, 5, 6, 7, 8];
  const sh = shuffle({ rng: 9 }, arr);
  assert.deepEqual([...sh].sort(), arr);
  assert.deepEqual(arr, [1, 2, 3, 4, 5, 6, 7, 8], 'input untouched');
});

test('createGame is a solo game and validates the scenario', () => {
  const s = createGame();
  assert.ok(s.team, 'one team');
  assert.equal(s.players, undefined, 'no player seats');
  assert.equal(s.vote, undefined);
  assert.equal(s.requests, undefined);
  assert.equal(s.config.scenarioId, 'beacon');
  assert.throws(() => createGame({ scenarioId: 'nope' }), /noSuchScenario/);
});

test('state is plain JSON and round-trips through serialization', () => {
  const s = newGame();
  assert.deepEqual(deserialize(serialize(s)), s);
});

test('the team gets 3 distinct survivors to choose from', () => {
  const s = newGame();
  assert.equal(s.team.draftOptions.length, RULES.DRAFT_OPTIONS);
  assert.equal(new Set(s.team.draftOptions).size, RULES.DRAFT_OPTIONS);
  assert.equal(s.survivorDeck.length, 20 - RULES.DRAFT_OPTIONS);
});

test('same seed + same actions = same game', () => {
  const run = () => {
    let s = newGame({ seed: 'repeatable' });
    s = reduce(s, draftPick(s.team.draftOptions.slice(0, RULES.TEAM_START)));
    return s;
  };
  assert.deepEqual(run(), run());
});

test('drafting validates picks and starts round 1', () => {
  let s = newGame();
  const opts = s.team.draftOptions;
  assert.equal(tryReduce(s, draftPick([])).error, 'badDraft');
  assert.equal(tryReduce(s, draftPick(opts.slice(0, RULES.TEAM_START + 1))).error, 'badDraft');
  assert.equal(tryReduce(s, draftPick([opts[0], opts[0]])).error, 'badDraft');
  assert.equal(tryReduce(s, draftPick([opts[0], s.survivorDeck[0]])).error, 'notInDraftOptions');

  const before = structuredClone(s);
  s = reduce(s, draftPick(opts.slice(0, RULES.TEAM_START)));
  assert.deepEqual(before, newGame(), 'reduce never mutates its input');
  assert.ok(['turn', 'crossroads'].includes(s.phase));
  assert.equal(tryReduce(s, draftPick(opts.slice(0, RULES.TEAM_START))).error, 'wrongPhase');
  assert.equal(s.day, 1);
  assert.ok(s.crisis?.id);
  assert.equal(s.survivorDeck.length, 20 - RULES.TEAM_START, 'unpicked options go back');

  const t = s.team;
  assert.equal(t.survivors.length, RULES.TEAM_START);
  for (const id of t.survivors) assert.equal(s.survivors[id].ap, SURVIVORS_BY_ID[id].energy, 'starts full');
  assert.equal(t.hand.length, RULES.STARTING_HAND, 'starting hand');
  for (const id of t.survivors) assert.equal(s.survivors[id].location, 'colony');
});
