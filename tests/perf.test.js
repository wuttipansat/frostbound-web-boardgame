import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGovernor, TIERS } from '../src/render/perf.js';

const run = (g, fps, seconds) => { for (let t = 0; t < seconds; t += 1 / fps) g.sample(1 / fps); };

test('auto steps down on slow frames, one tier per two slow windows', () => {
  const seen = [];
  const g = createGovernor({ onTier: (t) => seen.push(t.id) });
  run(g, 25, 4.1);
  assert.equal(g.tier, 'medium');
  run(g, 25, 4.1);
  assert.equal(g.tier, 'low');
  run(g, 25, 10);
  assert.equal(g.tier, 'low', 'floor');
  assert.deepEqual(seen, ['medium', 'low']);
});

test('auto climbs back only with lots of headroom, after a cool-off, never above start', () => {
  const g = createGovernor({ start: 'medium' });
  run(g, 25, 4.1); assert.equal(g.tier, 'low');
  run(g, 60, 10); assert.equal(g.tier, 'low', 'cool-off');
  run(g, 60, 14); assert.equal(g.tier, 'medium');
  run(g, 60, 30); assert.equal(g.tier, 'medium', 'never above start');
});

test('ok-ish fps holds; tab-switch gaps are ignored', () => {
  const g = createGovernor();
  run(g, 48, 20); assert.equal(g.tier, 'high');
  for (let i = 0; i < 20; i++) g.sample(3); // hidden tab
  assert.equal(g.tier, 'high');
});

test('fixed modes ignore fps; saver draws every other frame', () => {
  const g = createGovernor({ mode: 'saver' });
  run(g, 10, 10); assert.equal(g.tier, 'saver');
  assert.equal(TIERS.saver.every, 2);
  g.setMode('high'); run(g, 10, 10); assert.equal(g.tier, 'high');
  g.setMode('auto'); assert.equal(g.tier, 'high');
});
