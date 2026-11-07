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

  const two = new VoxelModel().set(0, 0, 0, 0xffffff).set(1, 0, 0, 0xffffff).buildGeometries();
  assert.equal(tris(two.lit), 20, 'shared face removed from both voxels');

  const cube = new VoxelModel().box(0, 0, 0, 3, 3, 3, 0x808080).buildGeometries();
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
    const { lit, glow } = LOCATION_BUILDERS[id]().buildGeometries({ size: BOARD.buildingScale });
    assert.ok(tris(lit) > 500, `${id} has geometry`);
    assert.ok(tris(glow) > 0, `${id} has warm/emissive details`);
    const bb = lit.boundingBox;
    const extent = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
    assert.ok(extent < 16, `${id} footprint ${extent.toFixed(1)} fits between roads`);
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
    assert.ok(Math.abs(L.center.length() - BOARD.locationRadius) < 1e-6);
    // Slots sit between the building and the colony.
    for (const p of [...L.survivorSlots, ...L.zombieSlots]) assert.ok(p.length() < L.center.length());
  }
  assert.equal(layout.colony.zombieSlots.length, LOCATIONS.colony.zombieSlots);
  assert.equal(layout.colony.gates.length, LOCATIONS.colony.entrances);
  // Locations are evenly spread and far enough apart not to overlap.
  for (const a of OUTSIDE_LOCATIONS) for (const b of OUTSIDE_LOCATIONS) {
    if (a < b) assert.ok(layout[a].center.distanceTo(layout[b].center) > 2 * layout[a].hitRadius);
  }
});
