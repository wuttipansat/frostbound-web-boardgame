// Step 7: HD (2×) models, detail passes, heightmap terrain and quality tiers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoxelModel } from '../src/render/voxel.js';
import {
  LOCATION_BUILDERS, LOCATION_BUILDERS_HD, colonyHD, treeModelHD, rockModelHD,
} from '../src/render/buildings.js';
import {
  survivorModel, survivorModelHD, zombieModelHD, dieModelHD, exposureDieModelHD, barricadeModelHD, DIE_VOXELS, HD,
} from '../src/render/characters.js';
import { frameWindows, addIcicles, patternColor, materialOf, DETAIL_COLORS } from '../src/render/detail.js';
import { heightmapGeometry, buildTerrainHD } from '../src/render/terrain.js';
import { QUALITY_TIERS, resolveQuality, defaultQuality } from '../src/render/quality.js';
import { BOARD } from '../src/render/board.js';
import { SURVIVORS } from '../src/content/survivors.js';
import { OUTSIDE_LOCATIONS } from '../src/core/constants.js';

const tris = (g) => (g ? g.index.count / 3 : 0);
const count = (m, pred) => [...m.voxels.values()].filter(pred).length;

test('HD buildings: same footprint as before, more detail (frames, sills, icicles), budgeted triangles', () => {
  for (const id of OUTSIDE_LOCATIONS) {
    const lo = LOCATION_BUILDERS[id]();
    const hd = LOCATION_BUILDERS_HD[id]();
    assert.ok(hd.voxels.size > lo.voxels.size * 4, `${id}: much more voxel detail`);
    const g = hd.buildGeometries({ size: BOARD.buildingScale / 2, jitter: 0 });
    const bb = g.lit.boundingBox;
    const extent = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
    assert.ok(extent < 16, `${id} still fits its plot (${extent.toFixed(1)})`);
    assert.ok(tris(g.glow) > 0, `${id} keeps its lit windows/signs`);
    assert.ok(tris(g.lit) < 25000, `${id} triangle budget (${tris(g.lit)})`);
    assert.ok(count(hd, (v) => v.color === DETAIL_COLORS.FRAME) > 0, `${id} has window frames`);
  }
  assert.ok(count(colonyHD(), (v) => v.color === DETAIL_COLORS.ICE || v.color === DETAIL_COLORS.ICE_TIP) > 0, 'colony has icicles');
});

test('HD trees and rocks come in three shapes each and stay cheap enough to instance', () => {
  const shapes = new Set();
  for (const s of [0, 1, 2]) {
    const m = treeModelHD(s, 1);
    shapes.add([...m.voxels.keys()].length);
    assert.ok(tris(m.buildGeometries({ size: 0.25, jitter: 0 }).lit) < 2500, `tree ${s}`);
    assert.ok(tris(rockModelHD(s).buildGeometries({ size: 0.25, jitter: 0 }).lit) < 800, `rock ${s}`);
  }
  assert.equal(shapes.size, 3);
});

test('HD survivors: 2× the resolution, real faces, all 20 still distinct', () => {
  const shapes = new Set();
  for (const s of SURVIVORS) {
    const m = survivorModelHD(s);
    const { min, max } = m.bounds();
    const [w, h] = [max[0] - min[0], max[1] - min[1]];
    const lo = survivorModel(s).bounds();
    assert.equal(h, (lo.max[1] - lo.min[1]) * HD, `${s.id} keeps its height at 2×`);
    assert.ok(w >= 16 && w <= 22, `${s.id} width ${w}`);
    assert.ok(count(m, (v) => v.color === 0xffffff && v.z === 13) >= 2, `${s.id} has catchlights in both eyes`);
    shapes.add([...m.voxels.keys()].sort().join('|'));
  }
  assert.equal(shapes.size, SURVIVORS.length);
});

test('HD zombies: five variants, glowing eyes, teeth', () => {
  const shapes = new Set();
  for (let v = 0; v < 5; v++) {
    const m = zombieModelHD(v);
    assert.ok(count(m, (x) => x.glow) > 0, `variant ${v} eyes glow`);
    assert.ok(count(m, (x) => x.color === 0xe8e0c8) > 0, `variant ${v} has teeth`);
    shapes.add([...m.voxels.keys()].sort().join('|'));
  }
  assert.equal(shapes.size, 5);
});

test('HD dice: pips are carved in (no pip colour left on the outer surface) and faces are unchanged', () => {
  const m = dieModelHD();
  const N = DIE_VOXELS * HD - 1;
  const outer = (v) => v.x === 0 || v.x === N || v.y === 0 || v.y === N || v.z === 0 || v.z === N;
  assert.equal(count(m, (v) => v.color !== 0xf4f1ea && outer(v)), 0);
  assert.ok(count(m, (v) => v.color !== 0xf4f1ea) > 0, 'recessed pips are still there one layer in');
  assert.ok(count(exposureDieModelHD(), (v) => v.color !== 0x2b3442) > 0);
  assert.ok(tris(barricadeModelHD().buildGeometries({ jitter: 0 }).lit) > 0);
});

test('detail passes: materials, brick mortar, window sills and icicles', () => {
  assert.equal(materialOf(0x9a4a3a), 'brick');
  assert.equal(patternColor({ x: 1, y: 3, z: 0, color: 0x9a4a3a }), DETAIL_COLORS.MORTAR);
  const m = new VoxelModel().box(0, 0, 0, 5, 6, 1, 0x34425e);
  m.set(2, 3, 0, 0xffb347, true);
  frameWindows(m);
  assert.equal(m.get(1, 3, 0).color, DETAIL_COLORS.FRAME, 'frame beside the window');
  assert.ok(m.get(2, 2, 1) || m.get(2, 2, -1), 'sill sticks out under the window');
  const roof = new VoxelModel().box(0, 12, 0, 6, 1, 6, 0x2b3448);
  addIcicles(roof, { minY: 10, p: 1 });
  assert.ok(count(roof, (v) => v.y < 12) > 0, 'icicles hang under the eaves');
});

test('heightmap mesher: one top quad per cell, walls only where the ground steps down', () => {
  const flat = heightmapGeometry({ n: 1, cell: 1, column: () => ({ h: 0, top: 0xffffff }), side: () => 0x808080, bottom: -2 });
  // 9 tops + rim walls (12 outer edges, each one merged 2-high quad)
  assert.equal(tris(flat), (9 + 12) * 2);
  const bump = heightmapGeometry({ n: 1, cell: 1, column: (x, z) => ({ h: x === 0 && z === 0 ? 2 : 0, top: 0xffffff }), side: () => 0x808080, bottom: -2 });
  assert.equal(tris(bump), tris(flat) + 4 * 2, 'the raised centre adds 4 side walls');
  // Ground next to the bump is darker (AO) than ground far away.
  const col = bump.attributes.color; const pos = bump.attributes.position; const nrm = bump.attributes.normal;
  let near = 1; let far = 0;
  for (let i = 0; i < pos.count; i++) {
    if (nrm.getY(i) !== 1 || pos.getY(i) !== 0) continue;
    const onBumpEdge = Math.abs(pos.getX(i)) <= 1 && Math.abs(pos.getZ(i)) <= 1 && (pos.getX(i) === 0 || pos.getX(i) === 1 || pos.getZ(i) === 0 || pos.getZ(i) === 1);
    if (onBumpEdge) near = Math.min(near, col.getX(i)); else far = Math.max(far, col.getX(i));
  }
  assert.ok(near < far);
  const terrain = buildTerrainHD({ radius: 46, distRoad: () => 99, distPlot: () => 99 });
  assert.ok(tris(terrain) < 150000, `HD terrain budget (${tris(terrain)})`);
});

test('quality tiers: Low keeps 1× models and no post; URL beats saved beats device default', () => {
  for (const [id, q] of Object.entries(QUALITY_TIERS)) {
    for (const k of ['hd', 'maxPixelRatio', 'shadowMapSize', 'post', 'snowFlakes', 'particleScale', 'mist', 'sky', 'glowBoost']) assert.ok(k in q, `${id}.${k}`);
  }
  assert.equal(QUALITY_TIERS.low.hd, false);
  assert.equal(QUALITY_TIERS.low.post, false);
  assert.ok(QUALITY_TIERS.high.shadowMapSize > QUALITY_TIERS.medium.shadowMapSize);
  assert.equal(resolveQuality({ search: '?quality=high', saved: 'low' }).id, 'high');
  assert.equal(resolveQuality({ search: '', saved: 'low' }).id, 'low');
  assert.equal(defaultQuality({ navigator: { userAgent: 'iPhone', hardwareConcurrency: 6 } }), 'low');
  assert.equal(defaultQuality({ navigator: { userAgent: 'Desktop', hardwareConcurrency: 8 } }), 'medium');
});
