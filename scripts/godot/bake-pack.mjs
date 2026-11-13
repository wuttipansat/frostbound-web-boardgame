// GODOT-2: the model pack for the Godot port: every model build the board can need (all levels of detail, every
// place type and landmark, the flame), as gzipped quad records (same format as public/models-pack.txt, not base64).
//   node scripts/godot/bake-pack.mjs [seeds=40] [stages=5]  -> godot/assets/models-pack.bin
import fs from 'node:fs';
import zlib from 'node:zlib';
import { recordQuads } from '../../src/render/voxel.js';
import { encodePack } from '../../src/render/pack.js';
import { collect } from '../bench/model-keys.mjs';

const seeds = Number(process.argv[2] ?? 40); const stages = Number(process.argv[3] ?? 5);
const t0 = Date.now();
const rec = new Map();
recordQuads(rec);
await collect({ seeds: Array.from({ length: seeds }, (_, i) => i + 1), stages });
// GODOT-3: the characters (pieces.js builds them unkeyed): survivors, zombie variants, a barricade.
{
  const ch = await import('../../src/render/characters.js');
  const { SURVIVORS } = await import('../../src/content/survivors.js');
  for (const def of SURVIVORS) ch.survivorModelHD(def).buildGeometries({ size: 0.075, jitter: 0, cacheKey: `char-${def.id}` });
  for (let v = 0; v < 5; v++) ch.zombieModelHD(v).buildGeometries({ size: 0.075, jitter: 0, cacheKey: `zombie-${v}` });
  ch.barricadeModelHD().buildGeometries({ size: 0.11, jitter: 0, cacheKey: 'barricade' });
}
const raw = encodePack(rec);
const gz = zlib.gzipSync(raw, { level: 9 });
fs.mkdirSync('godot/assets', { recursive: true });
fs.writeFileSync('godot/assets/models-pack.bin', gz);
const { LOCATION_BUILDERS_HD } = await import('../../src/render/buildings.js');
const { LANDMARKS } = await import('../../src/render/board.js');
const keys = [...rec.keys()];
const miss = [];
for (const t of Object.keys(LOCATION_BUILDERS_HD)) for (const L of [0, 1, 2]) if (!keys.some((k) => k.startsWith(`lod${L}-place-${t}|`))) miss.push(`lod${L}-place-${t}`);
for (const t of Object.keys(LANDMARKS)) for (const L of [0, 1, 2]) if (!keys.some((k) => k.startsWith(`lod${L}-lm-${t}|`))) miss.push(`lod${L}-lm-${t}`);
// lodExtent (board.js) for every place and landmark: the board scales them to fit their chunks.
const city = await import('../../src/render/city.js');
const { packedBounds, usePack } = await import('../../src/render/voxel.js');
const { decodePack } = await import('../../src/render/pack.js');
usePack(decodePack(raw));
const LOD_SIZE = [0.15, 0.3, 0.6];
const extents = {};
for (const [key, make] of [...Object.entries(LOCATION_BUILDERS_HD).map(([t, mk]) => [`place-${t}`, mk]), ...Object.entries(LANDMARKS).map(([t, mk]) => [`lm-${t}`, mk])]) {
  let x = 0; let z = 0;
  for (let L = 0; L < 3; L++) {
    const { min, max } = packedBounds(`lod${L}-${key}`, { size: LOD_SIZE[L], jitter: 0, ao: L < 2 }) ?? city.lod(L, key, make).bounds();
    x = Math.max(x, (max[0] - min[0]) * LOD_SIZE[L]); z = Math.max(z, (max[2] - min[2]) * LOD_SIZE[L]);
  }
  extents[key] = { x, z };
}
fs.writeFileSync('godot/data/extents.json', JSON.stringify(extents, null, 1));
console.log(`godot pack: ${rec.size} models, ${(raw.length / 1e6).toFixed(1)} MB raw, ${(gz.length / 1e6).toFixed(2)} MB gzip, ${Date.now() - t0} ms`);
if (miss.length) console.log(`missing: ${miss.join(', ')}`);
