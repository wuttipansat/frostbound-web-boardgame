// GODOT-0: stateHash is stable (key order does not matter) and changes with the state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stateHash, stableJson, fnv1a } from '../src/core/hash.js';
import { createGame } from '../src/core/state.js';

test('stateHash: key order free, deterministic, sensitive', () => {
  assert.equal(stableJson({ b: 1, a: [2, { d: 3, c: undefined }] }), '{"a":[2,{"d":3}],"b":1}');
  assert.equal(fnv1a(''), '811c9dc5');
  assert.equal(fnv1a('a'), 'e40c292c');
  assert.equal(stateHash({ x: 1, y: 2 }), stateHash({ y: 2, x: 1 }));
  const a = createGame({ seed: 7, players: 1 }); const b = createGame({ seed: 7, players: 1 });
  assert.equal(stateHash(a), stateHash(b));
  b.day += 1;
  assert.notEqual(stateHash(a), stateHash(b));
});
