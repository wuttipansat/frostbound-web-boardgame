// LOAD-1: bake every city model build (all levels of detail, all stages) into public/models-pack.txt (gzipped quads, base64).
//   node scripts/bake-models.mjs   (runs before vite build)
import fs from 'node:fs';
import zlib from 'node:zlib';
import { recordQuads } from '../src/render/voxel.js';
import { encodePack, PACK_FILE } from '../src/render/pack.js';
import { collect } from './bench/model-keys.mjs';

const t0 = Date.now();
const rec = new Map();
recordQuads(rec);
await collect();
// Left out (meshed at runtime when needed): the flame, and the fine level of upgraded colony walls (rare, big).
const keep = new Map([...rec].filter(([ck]) => !ck.startsWith('flame|') && !/^lod0-colony-w[123]\|/.test(ck) ));
const raw = encodePack(keep);
const gz = zlib.gzipSync(raw, { level: 9 });
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync(`public/${PACK_FILE}`, gz.toString('base64'));
console.log(`baked ${keep.size} models: ${(raw.length / 1e6).toFixed(1)} MB raw, ${(gz.length / 1e6).toFixed(2)} MB gzip, ${Date.now() - t0} ms`);
const { LOCATION_BUILDERS_HD } = await import('../src/render/buildings.js');
const missing = Object.keys(LOCATION_BUILDERS_HD).filter((t) => ![1, 2].every((L) => [...keep.keys()].some((k) => k.startsWith(`lod${L}-place-${t}|`))));
if (missing.length) console.log(`not baked (meshed at runtime): ${missing.join(', ')}`);
