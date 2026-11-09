import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Tweens, ease } from '../src/render/tween.js';
import { assignSlots, zombieSlotIndex, barricadeSlotIndex } from '../src/render/pieces.js';
import { survivorModel, zombieModel, SURVIVOR_STYLES } from '../src/render/characters.js';
import { SURVIVORS } from '../src/content/survivors.js';
import { LOCATIONS } from '../src/content/locations.js';

test('tweens: delay, easing, completion order, and tweens chained from callbacks', async () => {
  const tw = new Tweens();
  const seen = [];
  const p = tw.add({ duration: 1, delay: 0.5, ease: ease.linear, onUpdate: (e) => seen.push(+e.toFixed(2)) });
  let chained = false;
  tw.add({ duration: 0.1, onComplete: () => tw.add({ duration: 0.1, onComplete: () => { chained = true; } }) });
  tw.update(0.25);
  assert.deepEqual(seen, []);
  tw.update(0.5);
  assert.deepEqual(seen, [0.25]);
  assert.ok(tw.busy);
  tw.update(1);
  await p;
  assert.equal(seen.at(-1), 1);
  tw.update(0.2);
  assert.ok(chained);
  assert.ok(!tw.busy);
});

test('easing functions start at 0 and end at 1', () => {
  for (const [name, f] of Object.entries(ease)) {
    assert.ok(Math.abs(f(0)) < 1e-9, name);
    assert.ok(Math.abs(f(1) - 1) < 1e-9, name);
  }
});

test('assignSlots keeps existing survivors in place and fills gaps', () => {
  const prev = new Map([['a', 0], ['b', 2]]);
  const out = assignSlots(prev, ['b', 'c', 'a', 'd']);
  assert.equal(out.get('a'), 0);
  assert.equal(out.get('b'), 2);
  assert.equal(out.get('c'), 1);
  assert.equal(out.get('d'), 3);
  assert.equal(new Set(out.values()).size, 4);
});

test('zombie and barricade slot orders never collide while zombies + barricades <= slots', () => {
  for (const id of Object.keys(LOCATIONS)) {
    const slots = LOCATIONS[id].zombieSlots;
    const all = Array.from({ length: slots }, (_, i) => zombieSlotIndex(id, i));
    assert.deepEqual([...all].sort((a, b) => a - b), Array.from({ length: slots }, (_, i) => i), `${id} is a permutation`);
    for (let z = 0; z <= slots; z++) {
      const zs = new Set(Array.from({ length: z }, (_, i) => zombieSlotIndex(id, i)));
      for (let j = 0; j < slots - z; j++) assert.ok(!zs.has(barricadeSlotIndex(id, j)), `${id} z=${z} b=${j}`);
    }
  }
  // Colony spreads its first four zombies over four different gates.
  const gates = new Set([0, 1, 2, 3].map((i) => Math.floor(zombieSlotIndex('colony', i) / 3)));
  assert.equal(gates.size, 4);
});

test('every survivor has a style and builds a chunky ~8x8x16 figure; silhouettes differ', () => {
  const shapes = new Set();
  for (const s of SURVIVORS) {
    assert.ok(SURVIVOR_STYLES[s.id], s.id);
    const m = survivorModel(s);
    const { min, max } = m.bounds();
    const [w, h, d] = [0, 1, 2].map((i) => max[i] - min[i]);
    assert.ok(w >= 8 && w <= 11 && d >= 6 && d <= 11, `${s.id} footprint ${w}x${d}`);
    assert.ok(h >= 14 && h <= 19, `${s.id} height ${h}`);
    shapes.add([...m.voxels.keys()].sort().join('|'));
  }
  assert.equal(shapes.size, SURVIVORS.length, 'no two survivors share a voxel silhouette');
});

test('zombies are hunched: the head is pushed forward of the feet and has glowing eyes', () => {
  for (const v of [0, 1, 2]) {
    const m = zombieModel(v);
    const head = [...m.voxels.values()].filter((x) => x.y >= 11);
    const feet = [...m.voxels.values()].filter((x) => x.y === 0);
    const avg = (arr) => arr.reduce((s, x) => s + x.z, 0) / arr.length;
    assert.ok(avg(head) > avg(feet) + 2);
    assert.ok([...m.voxels.values()].some((x) => x.glow));
  }
});

test('a new game drops survivor figures that are not in the new state', async () => {
  const { staleSurvivors } = await import('../src/render/pieces.js');
  const state = { survivors: { 'maren-holt': { owner: 'p0', alive: true }, 'ezra-kade': { owner: 'p1', alive: false } } };
  assert.deepEqual(staleSurvivors(['maren-holt', 'bo-lindqvist', 'ezra-kade'], state), ['bo-lindqvist']);
  assert.deepEqual(staleSurvivors(['maren-holt'], { survivors: {} }), ['maren-holt'], 'draft of a new game: board is empty');
});
