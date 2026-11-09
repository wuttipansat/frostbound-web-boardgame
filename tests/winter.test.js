import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atmosphereFor } from '../src/render/atmosphere.js';
import { createPrintPool, pathPrints } from '../src/render/footprints.js';

const base = (o = {}) => ({ scenario: { days: 7 }, day: 1, morale: 8, maxMorale: 10, phase: 'turn', ...o });

test('storm grows with rounds and falling morale; fire follows morale', () => {
  const early = atmosphereFor(base());
  const late = atmosphereFor(base({ day: 7, morale: 2 }));
  assert.ok(late.storm > early.storm + 0.4);
  assert.ok(late.fire < early.fire);
  assert.ok(late.storm <= 1 && early.storm >= 0);
});

test('the light follows the time of day: day < dawn < dusk < night', () => {
  const d = (time) => atmosphereFor(base({ time })).dusk;
  assert.ok(d('day') < d('dawn') && d('dawn') < d('dusk') && d('dusk') < d('night'));
});

test('ending: won = calm + blazing fire, lost = blizzard + fire out', () => {
  const won = atmosphereFor(base({ phase: 'gameOver', result: { reason: 'objectiveComplete' } }));
  const lost = atmosphereFor(base({ phase: 'gameOver', result: { reason: 'timeOut' } }));
  assert.equal(won.mood, 'won'); assert.equal(lost.mood, 'lost');
  assert.ok(won.fire > 1 && lost.fire < 0.15 && lost.storm === 1 && won.storm < 0.2);
  assert.equal(atmosphereFor(null).mood, 'calm');
});

test('prints alternate feet along the path and skip tiny moves', () => {
  const pts = pathPrints({ x: 0, z: 0 }, { x: 0, z: 14 });
  assert.ok(pts.length >= 6);
  assert.ok(pts[0].x * pts[1].x < 0, 'left/right');
  assert.equal(pathPrints({ x: 0, z: 0 }, { x: 0.5, z: 0 }).length, 0);
});

test('print pool is fixed size and reuses the oldest slot', () => {
  const pool = createPrintPool(3);
  for (let i = 0; i < 5; i++) pool.add({ n: i, day: 1 });
  assert.equal(pool.used, 3);
  assert.deepEqual(pool.slots.map((p) => p.n), [3, 4, 2]);
  pool.clear(); assert.equal(pool.used, 0);
});

test('a day runs dawn → day → (dusk, night) → next dawn', async () => {
  const { startedGame } = await import('./_helpers.js');
  const { reduce } = await import('../src/core/reducer.js');
  const a = await import('../src/core/actions.js');
  let s = startedGame();
  assert.equal(s.day, 1);
  s = { ...s, time: 'day' };
  s = reduce(s, a.endTurn());
  assert.equal(s.day, 2);
  assert.ok(s.time === 'day' || (s.time === 'dawn' && s.phase === 'crossroads'));
  assert.ok(s.log.some((e) => e.k === 'spawn' || e.k === 'crisisResolved'));
});
