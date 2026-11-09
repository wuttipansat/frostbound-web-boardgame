import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/core/state.js';
import { reduce, tryReduce, serialize, deserialize } from '../src/core/reducer.js';
import { draftPick } from '../src/core/actions.js';
import { ALL_OBJECTIVES } from '../src/content/objectives.js';
import { SURVIVORS_BY_ID } from '../src/content/survivors.js';
import { random, shuffle } from '../src/core/rng.js';
import { newGame, player } from './_helpers.js';

test('rng is deterministic and shuffle is a permutation', () => {
  const a = { rng: 123 }; const b = { rng: 123 };
  assert.deepEqual([random(a), random(a)], [random(b), random(b)]);
  const arr = [1, 2, 3, 4, 5, 6, 7, 8];
  const sh = shuffle({ rng: 9 }, arr);
  assert.deepEqual([...sh].sort(), arr);
  assert.deepEqual(arr, [1, 2, 3, 4, 5, 6, 7, 8], 'input untouched');
});

test('createGame validates player count and scenario', () => {
  assert.throws(() => createGame({ players: [{ name: 'solo' }] }), /badPlayerCount/);
  assert.throws(() => createGame({ players: Array(6).fill({}) }), /badPlayerCount/);
  assert.throws(() => createGame({ players: [{}, {}], scenarioId: 'nope' }), /noSuchScenario/);
});

test('state is plain JSON and round-trips through serialization', () => {
  const s = newGame();
  assert.deepEqual(deserialize(serialize(s)), s);
});

test('each player gets 3 distinct draft options and an objective', () => {
  const s = newGame({ players: 5 });
  const all = s.players.flatMap((p) => p.draftOptions);
  assert.equal(all.length, 15);
  assert.equal(new Set(all).size, 15);
  for (const p of s.players) assert.ok(ALL_OBJECTIVES[p.objectiveId]);
});

test('betrayer modes', () => {
  const kinds = (s) => s.players.map((p) => ALL_OBJECTIVES[p.objectiveId].kind);
  for (let seed = 1; seed < 20; seed++) {
    assert.ok(!kinds(newGame({ seed, betrayer: 'never' })).includes('betrayer'));
    assert.equal(kinds(newGame({ seed, betrayer: 'always' })).filter((k) => k === 'betrayer').length, 1);
    assert.ok(kinds(newGame({ seed, betrayer: 'maybe' })).filter((k) => k === 'betrayer').length <= 1);
  }
  // 'maybe' should sometimes include and sometimes omit the betrayer.
  const counts = new Set();
  for (let seed = 1; seed < 60; seed++) counts.add(kinds(newGame({ seed, betrayer: 'maybe' })).includes('betrayer'));
  assert.equal(counts.size, 2);
});

test('same seed + same actions = same game', () => {
  const run = () => {
    let s = newGame({ seed: 'repeatable' });
    for (const p of s.players) s = reduce(s, draftPick(p.id, p.draftOptions.slice(0, 1)));
    return s;
  };
  assert.deepEqual(run(), run());
});

test('drafting validates picks and starts round 1 when everyone has drafted', () => {
  let s = newGame();
  const p0 = s.players[0];
  assert.equal(tryReduce(s, draftPick(p0.id, [])).error, 'badDraft');
  assert.equal(tryReduce(s, draftPick(p0.id, p0.draftOptions.slice(0, 2))).error, 'badDraft', 'one survivor each');
  assert.equal(tryReduce(s, draftPick(p0.id, [p0.draftOptions[0], p0.draftOptions[0]])).error, 'badDraft');
  assert.equal(tryReduce(s, draftPick(p0.id, [s.players[1].draftOptions[0]])).error, 'notInDraftOptions');

  const before = structuredClone(s);
  s = reduce(s, draftPick(p0.id, p0.draftOptions.slice(0, 1)));
  assert.deepEqual(before, newGame(), 'reduce never mutates its input');
  assert.equal(tryReduce(s, draftPick(p0.id, p0.draftOptions.slice(0, 1))).error, 'alreadyDrafted');
  assert.equal(s.phase, 'draft');

  for (const p of s.players.slice(1)) s = reduce(s, draftPick(p.id, p.draftOptions.slice(1, 2)));
  assert.ok(['turn', 'crossroads'].includes(s.phase));
  assert.equal(s.round, 1);
  assert.ok(s.crisis?.id);
  assert.equal(s.survivorDeck.length, 20 - 3);

  for (const p of s.players) {
    assert.equal(p.survivors.length, 1);
    assert.equal(p.energy, SURVIVORS_BY_ID[p.survivors[0]].energy, 'starts full');
    assert.equal(p.hand.length, 3, 'starting hand');
    for (const id of p.survivors) assert.equal(s.survivors[id].location, 'colony');
  }
  // Leader controls the highest-influence survivor.
  const maxInf = Math.max(...Object.keys(s.survivors).map((id) => SURVIVORS_BY_ID[id].influence));
  assert.ok(player(s, s.leaderId).survivors.some((id) => SURVIVORS_BY_ID[id].influence === maxInf));
  assert.equal(s.activePlayerId, s.leaderId);
});
