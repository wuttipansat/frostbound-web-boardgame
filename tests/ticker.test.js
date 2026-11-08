import { test } from 'node:test';
import assert from 'node:assert/strict';
import { track, resetTicker } from '../src/ui/ticker.js';

test('resource ticker: first value is not a change; later changes report delta and age; reset forgets', () => {
  resetTicker();
  assert.deepEqual(track('food', 3, 0), { delta: 0, age: Infinity, from: 3 });
  assert.deepEqual(track('food', 3, 100), { delta: 0, age: Infinity, from: 3 }, 'same value: still no change');
  assert.deepEqual(track('food', 5, 200), { delta: 2, age: 0, from: 3 });
  assert.equal(track('food', 5, 900).age, 700, 're-renders keep timing from the change');
  assert.equal(track('food', 1, 1000).delta, -4);
  resetTicker();
  assert.equal(track('food', 9, 1100).delta, 0, 'a new game starts clean');
});
