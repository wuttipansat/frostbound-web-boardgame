// LOAD-1: fast mesher = old mesher, baked pack = runtime meshing, progressive board build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { VoxelModel, recordQuads, usePack, clearGeometryCache, geometriesFor } from '../src/render/voxel.js';
import { VoxelModel as LegacyModel } from './_legacyVoxel.js';
import { encodePack, decodePack, PACK_FILE } from '../src/render/pack.js';
import { LOCATION_BUILDERS_HD, colonyHD } from '../src/render/buildings.js';
import * as city from '../src/render/city.js';

const fakeCtx = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
globalThis.document ??= { createElement: () => ({ getContext: () => fakeCtx }) };

const sameGeo = (a, b) => {
  if (!a || !b) return a === b;
  for (const k of ['position', 'normal', 'color']) {
    const x = a.attributes[k].array; const y = b.attributes[k].array;
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (Math.abs(x[i] - y[i]) > 1e-6) return false;
  }
  const x = a.index.array; const y = b.index.array;
  return x.length === y.length && x.every((v, i) => v === y[i]);
};
const legacyOf = (m) => { const o = new LegacyModel(); for (const v of m.voxels.values()) o.set(v.x, v.y, v.z, v.color, v.glow); return o; };

test('typed mesher builds exactly the same meshes as the old one (every place, colony, a fine city model)', () => {
  const models = { colony: colonyHD(20), fine: city.lod(0, 'load-test', () => city.smallBuilding(1)) };
  for (const [k, f] of Object.entries(LOCATION_BUILDERS_HD)) models[k] = f();
  for (const [k, m] of Object.entries(models)) {
    for (const opts of [{ size: 0.1 }, { size: 0.2, jitter: 0 }, { ao: false, greedy: false }]) {
      const a = m.buildGeometries(opts); const b = legacyOf(m).buildGeometries(opts);
      assert.ok(sameGeo(a.lit, b.lit) && sameGeo(a.glow, b.glow), `${k} ${JSON.stringify(opts)}`);
    }
  }
});

test('numeric voxel keys: set/get/remove/merge behave as before', () => {
  const m = new VoxelModel().box(-3, 0, -3, 6, 2, 6, 0x123456);
  m.set(-4095, 4095, 7, 0xffffff, true);
  assert.equal(m.get(-4095, 4095, 7).glow, true);
  assert.equal(m.voxels.size, 73);
  m.remove(-3, 0, -3);
  assert.equal(m.get(-3, 0, -3), undefined);
  assert.equal(new VoxelModel().merge(m, 1, 1, 1).get(-2, 1, -1).color, 0x123456);
});

test('baked pack round trip gives the same geometry as runtime meshing', () => {
  const rec = new Map();
  recordQuads(rec);
  const make = () => LOCATION_BUILDERS_HD.hospital();
  const opts = { size: 0.12, jitter: 0 };
  const direct = make().buildGeometries({ ...opts, cacheKey: 'pack-test' });
  recordQuads(null);
  const pack = decodePack(zlib.gunzipSync(zlib.gzipSync(encodePack(rec))));
  clearGeometryCache();
  usePack(pack);
  let made = 0;
  const fromPack = geometriesFor('pack-test', opts, () => { made++; return make(); });
  usePack(null);
  assert.equal(made, 0, 'a packed model is never rebuilt from voxels');
  assert.ok(sameGeo(direct.lit, fromPack.lit) && sameGeo(direct.glow, fromPack.glow));
});

test('the baked pack stays small (when built)', () => {
  const f = `public/${PACK_FILE}`;
  if (!fs.existsSync(f)) return;
  assert.ok(fs.statSync(f).size <= 3e6, `pack ${fs.statSync(f).size} bytes`);
});

test('progressive board: colony and ground first, the rest made in small steps, same result', async () => {
  const { createBoard } = await import('../src/render/board.js');
  const tris = (b) => { let n = 0; b.root.traverse((o) => { if (o.geometry?.index && o.visible !== false) n += o.geometry.index.count / 3; }); return n; };
  const eager = createBoard();
  eager.update(0); // (update hides idle hover rings)
  clearGeometryCache(); // the queue really has to mesh
  const prog = createBoard({ progressive: true });
  assert.ok(prog.pending > 0, 'models wait in the queue');
  assert.ok(prog.locationGroups.colony.children.some((g) => g.children.length), 'colony is there at once');
  let frames = 0;
  for (let t = 0; prog.pending && frames < 2000; t += 0.016) { prog.update(t); frames++; }
  assert.equal(prog.pending, 0);
  assert.ok(frames > 1, 'spread over several frames');
  assert.equal(tris(prog), tris(eager));
});
