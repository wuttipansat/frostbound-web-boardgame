// Rendering helpers that run headless (no WebGL needed): voxel meshing, building models, board layout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoxelModel } from '../src/render/voxel.js';
import { LOCATION_BUILDERS, colony, pineTree } from '../src/render/buildings.js';
import { computeLayout, BOARD } from '../src/render/board.js';
import { LOCATIONS } from '../src/content/locations.js';
import { OUTSIDE_LOCATIONS } from '../src/core/constants.js';

const tris = (g) => (g ? g.index.count / 3 : 0);

test('voxel meshing culls hidden faces and splits glowing voxels', () => {
  const one = new VoxelModel().set(0, 0, 0, 0xffffff).buildGeometries();
  assert.equal(tris(one.lit), 12);
  assert.equal(one.glow, null);

  const two = new VoxelModel().set(0, 0, 0, 0xffffff).set(1, 0, 0, 0xffffff).buildGeometries({ greedy: false });
  assert.equal(tris(two.lit), 20, 'shared face removed from both voxels');

  const cube = new VoxelModel().box(0, 0, 0, 3, 3, 3, 0x808080).buildGeometries({ greedy: false });
  assert.equal(tris(cube.lit), 6 * 9 * 2, 'only the surface of a solid 3x3x3 is meshed');

  const mixed = new VoxelModel().set(0, 0, 0, 0x808080).set(1, 0, 0, 0xffaa00, true).buildGeometries();
  assert.equal(tris(mixed.lit), 12);
  assert.equal(tris(mixed.glow), 12, 'glow and lit voxels never cull each other');
});

test('centered origin puts the base on y=0 and centres the footprint', () => {
  const g = new VoxelModel().box(10, 5, 10, 4, 2, 4, 1).buildGeometries({ size: 0.5 }).lit;
  const bb = g.boundingBox;
  assert.equal(bb.min.y, 0);
  assert.equal(bb.max.y, 1);
  assert.equal(bb.min.x, -1);
  assert.equal(bb.max.x, 1);
});

test('snowCap adds a layer on exposed tops but not on glowing voxels', () => {
  const m = new VoxelModel().box(0, 0, 0, 2, 2, 1, 1).set(5, 3, 5, 2, true).snowCap(0xffffff, 1);
  assert.ok(m.get(0, 2, 0) && m.get(1, 2, 0));
  assert.equal(m.get(5, 4, 5), undefined);
});

test('every location model builds, has glowing details and fits its plot', () => {
  for (const id of OUTSIDE_LOCATIONS) {
    const { lit, glow } = LOCATION_BUILDERS[id]().buildGeometries({ size: BOARD.buildingScale / 2 });
    assert.ok(tris(lit) > 500, `${id} has geometry`);
    assert.ok(tris(glow) > 0, `${id} has warm/emissive details`);
    const bb = lit.boundingBox;
    const extent = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
    assert.ok(extent < BOARD.block - 4, `${id} footprint ${extent.toFixed(1)} fits between streets`);
  }
  assert.ok(tris(colony().buildGeometries({ size: 0.5 }).glow) > 0, 'campfire + torches glow');
  assert.ok(tris(pineTree(2).buildGeometries().lit) > 0);
});

test('layout has slot anchors matching the rules', () => {
  const layout = computeLayout();
  assert.deepEqual(Object.keys(layout).sort(), [...OUTSIDE_LOCATIONS, 'colony'].sort());
  for (const id of OUTSIDE_LOCATIONS) {
    const L = layout[id];
    assert.equal(L.survivorSlots.length, LOCATIONS[id].survivorSlots);
    assert.equal(L.zombieSlots.length, LOCATIONS[id].zombieSlots);
    // UI-13: each place sits on a block of the 3×3 grid; its slots stay on that block.
    // MAP-1b: the place covers 1–4 of its block's 3×3 chunks.
    const c = L.plan.c;
    assert.ok(Math.abs(c.x) % BOARD.block === 0 && Math.abs(c.z) % BOARD.block === 0);
    assert.ok(L.plan.covered.length >= 1 && L.plan.covered.length <= 4);
    for (const p of [...L.survivorSlots, ...L.zombieSlots, L.center]) assert.ok(Math.max(Math.abs(p.x - c.x), Math.abs(p.z - c.z)) < BOARD.block / 2 + 1);
  }
  assert.equal(layout.colony.zombieSlots.length, LOCATIONS.colony.zombieSlots);
  assert.equal(layout.colony.gates.length, LOCATIONS.colony.entrances);
  // Locations are evenly spread and far enough apart not to overlap.
  for (const a of OUTSIDE_LOCATIONS) for (const b of OUTSIDE_LOCATIONS) {
    if (a < b) assert.ok(layout[a].center.distanceTo(layout[b].center) > 2 * layout[a].hitRadius);
  }
});

import { clearGeometryCache, geometryCacheSize } from '../src/render/voxel.js';
import * as THREE from 'three';

test('greedy meshing merges same-colour coplanar faces (big triangle savings)', () => {
  const m = new VoxelModel().box(0, 0, 0, 8, 2, 8, 0x808080);
  const plain = m.buildGeometries({ greedy: false, jitter: 0, ao: false });
  const merged = m.buildGeometries({ greedy: true, jitter: 0, ao: false });
  assert.equal(tris(merged.lit), 12, 'a uniform slab is one quad per side');
  assert.ok(tris(merged.lit) < tris(plain.lit) / 10);
  // Different colours never merge.
  const striped = new VoxelModel().box(0, 0, 0, 4, 1, 1, (x) => (x % 2 ? 0xff0000 : 0x00ff00)).buildGeometries({ jitter: 0, ao: false });
  assert.ok(tris(striped.lit) > 12);
});

test('ambient occlusion darkens vertices in an inner corner and never merges across AO changes', () => {
  // An L-shape: floor + a wall. The floor next to the wall should be darker at the wall side.
  const m = new VoxelModel().box(0, 0, 0, 4, 1, 4, 0xffffff).box(0, 1, 0, 4, 3, 1, 0xffffff);
  const g = m.buildGeometries({ jitter: 0, greedy: true, ao: true }).lit;
  const pos = g.attributes.position;
  const colr = g.attributes.color;
  const nrm = g.attributes.normal;
  let nearWall = 1; let farFromWall = 0;
  for (let i = 0; i < pos.count; i++) {
    if (nrm.getY(i) !== 1 || Math.abs(pos.getY(i) - 0) > 1e-6 + 1) continue;
    if (pos.getY(i) !== 1 - 0) continue;
    const z = pos.getZ(i);
    const c = colr.getX(i);
    if (Math.abs(z - (1 - 2)) < 1e-6) nearWall = Math.min(nearWall, c);
    if (Math.abs(z - (4 - 2)) < 1e-6) farFromWall = Math.max(farFromWall, c);
  }
  assert.ok(nearWall < farFromWall, `inner corner ${nearWall} should be darker than open floor ${farFromWall}`);
});

test('merged quads face outwards (winding agrees with normals)', () => {
  const g = new VoxelModel().box(0, 0, 0, 3, 2, 5, 0x808080).buildGeometries({ jitter: 0 }).lit;
  const p = g.attributes.position; const n = g.attributes.normal; const idx = g.index;
  const v = (i) => new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
  for (let k = 0; k < idx.count; k += 3) {
    const [a, b, c] = [idx.getX(k), idx.getX(k + 1), idx.getX(k + 2)];
    const face = v(b).sub(v(a)).cross(v(c).sub(v(a)));
    const normal = new THREE.Vector3(n.getX(a), n.getY(a), n.getZ(a));
    assert.ok(face.dot(normal) > 0, `triangle ${k / 3} faces inwards`);
  }
});

test('upscale, bevel and the geometry cache', () => {
  const m = new VoxelModel().box(0, 0, 0, 2, 2, 2, 0x808080);
  const up = m.upscale(2);
  assert.equal(up.voxels.size, 64);
  const before = up.voxels.size;
  up.bevel(1);
  assert.ok(up.voxels.size < before && up.voxels.size > before / 2, 'bevel trims edges but keeps the body');
  clearGeometryCache();
  const a = m.buildGeometries({ cacheKey: 'cube' });
  const b = m.buildGeometries({ cacheKey: 'cube' });
  assert.equal(a, b);
  assert.equal(geometryCacheSize(), 1);
});
