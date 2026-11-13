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
console.log(`godot pack: ${rec.size} models, ${(raw.length / 1e6).toFixed(1)} MB raw, ${(gz.length / 1e6).toFixed(2)} MB gzip, ${Date.now() - t0} ms`);
if (miss.length) console.log(`missing: ${miss.join(', ')}`);
