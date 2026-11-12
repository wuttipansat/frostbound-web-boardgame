// GODOT-0: the .glb writer makes valid files whose triangles and bounds match the model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeGlb, readGlb } from '../scripts/godot/glb.mjs';
import { fileOf, lodOf } from '../scripts/export-glb.mjs';

const { collect } = await import('../scripts/bench/model-keys.mjs');

test('three real models export to valid glb with the same triangles and bounds', async () => {
  const cache = await collect({ seeds: [1], stages: 1 });
  const keys = [...cache.keys()].filter((k) => cache.get(k).lit).filter((_, i, a) => i % Math.floor(a.length / 3) === 0).slice(0, 3);
  assert.equal(keys.length, 3);
  for (const ck of keys) {
    const { lit, glow } = cache.get(ck);
    const mesh = (g) => g && { position: g.attributes.position.array, normal: g.attributes.normal.array, color: g.attributes.color.array, index: g.index.array };
    const bytes = writeGlb([{ mesh: mesh(lit) }, { mesh: mesh(glow), unlit: true }]);
    const { json, bin } = readGlb(bytes);
    const prims = json.meshes[0].primitives;
    assert.equal(prims.length, glow?.index.count ? 2 : 1);
    const tris = prims.reduce((a, p) => a + json.accessors[p.indices].count / 3, 0);
    assert.equal(tris, (lit.index.count + (glow?.index.count ?? 0)) / 3, ck);
    assert.equal(lit.index.count % 6, 0, 'quads -> 2 triangles each');
    lit.computeBoundingBox();
    const pa = json.accessors[prims[0].attributes.POSITION];
    for (let k = 0; k < 3; k++) {
      assert.ok(Math.abs(pa.min[k] - lit.boundingBox.min.getComponent(k)) < 1e-5);
      assert.ok(Math.abs(pa.max[k] - lit.boundingBox.max.getComponent(k)) < 1e-5);
    }
    for (const v of json.bufferViews) assert.ok(v.byteOffset + v.byteLength <= bin.length);
    assert.match(fileOf(ck), /^[a-zA-Z0-9_-]+-[0-9a-f]{8}\.glb$/);
    assert.match(lodOf(ck), /^(lod\d|misc)$/);
  }
});
