// MAP-3: wider grid, calm blocks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/core/state.js';
import { growCity } from '../src/core/rules/city.js';
import { computeLayout, placePlan, blockPieces, blockPos, blockHalf, gridOf, chunksOf, CHUNK, BOARD } from '../src/render/board.js';
import { ROAD } from '../src/render/terrain.js';

const cities = () => [1, 2, 3, 4].map((seed) => { const s = createGame({ seed, players: 1 }); growCity(s); growCity(s); return s; });
const OPEN = new Set(['bench', 'tree']);

test('grid: pitch 30, two-lane streets, colony row and column 5 chunks, blocks tile without gaps', () => {
  assert.equal(BOARD.block, 30);
  assert.equal(ROAD.half * 2, 6);
  assert.ok(Math.abs(CHUNK - (30 - 2 * ROAD.walk) / 3) < 1e-9);
  assert.equal(chunksOf(0), 5); assert.equal(chunksOf(3), 3);
  for (let b = -4; b < 4; b++) {
    assert.ok(Math.abs(blockPos(b) + blockHalf(b) - (blockPos(b + 1) - blockHalf(b + 1))) < 1e-9, `blocks ${b}/${b + 1} meet on one street line`);
    assert.equal(gridOf(blockPos(b)), b);
    assert.equal(gridOf(blockPos(b) + blockHalf(b) - 0.01), b);
  }
  assert.ok(Math.abs(2 * blockHalf(0) - (5 * CHUNK + 2 * ROAD.walk)) < 1e-9, 'colony plot = 5×5 chunks + sidewalks');
});

test('calm blocks: built things fit a 3×2 window at the front; places fit their chunks', () => {
  for (const s of cities()) {
    const roads = new Set(s.map.roads);
    const layout = computeLayout(s.map);
    for (const [k, b] of Object.entries(s.map.blocks)) {
      if (b.kind === 'colony' || b.kind === 'rail') continue;
      const [bx, bz] = k.split(',').map(Number);
      const plan = b.kind === 'place' ? layout[b.placeId].plan : placePlan(`${b.kind}@`, b.kind, bx, bz, roads, [1, 1], b.front);
      for (const c of plan.covered) { const [i, j] = c.split(',').map(Number); assert.ok(i < plan.rows && j < plan.cols, `${k} covers ${c}`); }
      const built = [...plan.covered, ...blockPieces(b, bx, bz, plan).filter(([, , w]) => !OPEN.has(w)).map(([i, j]) => `${i},${j}`)];
      assert.equal(new Set(built).size, built.length, `${k}: no chunk used twice`);
      assert.ok(built.length <= 6, `${k} builds on ${built.length} chunks`);
      const rows = built.map((c) => +c.split(',')[0]); const cols = built.map((c) => +c.split(',')[1]);
      if (built.length) {
        assert.ok(Math.max(...rows) <= 1, `${k}: built rows at the front`);
        assert.ok(Math.max(...cols) - Math.min(...cols) <= 2, `${k}: built columns within 3`);
      }
      if (b.kind === 'place') assert.ok(built.length >= plan.covered.length);
    }
  }
});

test('calm blocks are stable: same pieces for the same block in every growth', () => {
  const s = createGame({ seed: 7, players: 1 });
  const roads = () => new Set(s.map.roads);
  const snap = () => Object.fromEntries(Object.entries(s.map.blocks).filter(([, b]) => b.kind !== 'place' && b.kind !== 'colony').map(([k, b]) => {
    const [bx, bz] = k.split(',').map(Number);
    return [k, JSON.stringify(blockPieces(b, bx, bz, placePlan(`${b.kind}@`, b.kind, bx, bz, roads(), [1, 1], b.front)))];
  }));
  const before = snap();
  growCity(s);
  const after = snap();
  for (const [k, v] of Object.entries(before)) assert.equal(after[k], v, `block ${k}`);
});

test('lamps: spaced on each side, never in a junction box, always on the sidewalk; markings only on asphalt', async () => {
  const { lampSpots, markingQuads, streetRuns } = await import('../src/render/streets.js');
  const THREE = await import('three');
  const seg = (k) => {
    const [cx, cz, d] = k.split(',');
    const line = (c) => blockPos(+c) - blockHalf(+c);
    const a = new THREE.Vector3(line(cx), 0, line(cz));
    const b = d === 'h' ? new THREE.Vector3(line(+cx + 1), 0, line(cz)) : new THREE.Vector3(line(cx), 0, line(+cz + 1));
    return [a, b, k];
  };
  const dist = (x, z, [a, b]) => {
    const t = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z)) / a.distanceToSquared(b)));
    return Math.hypot(x - (a.x + (b.x - a.x) * t), z - (a.z + (b.z - a.z) * t));
  };
  for (const s of cities()) {
    const segs = s.map.roads.map(seg);
    const lamps = lampSpots(segs);
    assert.ok(lamps.length > 10);
    const { nodes } = streetRuns(segs);
    for (const l of lamps) {
      const d = Math.min(...segs.map((g) => dist(l.x, l.z, g)));
      assert.ok(d > ROAD.kerb && d < ROAD.walk, `lamp on the sidewalk (${d.toFixed(2)})`);
      assert.ok(!nodes.some((n) => n.kind === 'junction' && Math.abs(n.x - l.x) < ROAD.walk && Math.abs(n.z - l.z) < ROAD.walk && Math.hypot(n.x - l.x, n.z - l.z) < 5), 'not in a junction box');
    }
    for (const a of lamps) for (const b of lamps) {
      if (a === b || a.dx !== b.dx || a.dz !== b.dz) continue; // same side = same facing
      const sameLine = a.dx ? Math.abs(a.x - b.x) < 0.01 : Math.abs(a.z - b.z) < 0.01;
      if (sameLine) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 7, 'lamps ≥ 7 apart on one side');
    }
    const q = markingQuads(segs);
    for (let i = 0; i < q.position.length; i += 3) {
      const d = Math.min(...segs.map((g) => dist(q.position[i], q.position[i + 2], g)));
      assert.ok(d <= ROAD.half + 1e-6, 'markings stay on the asphalt');
    }
  }
});
