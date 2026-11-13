// GODOT-2: mesh vectors: what the web build makes from the pack for a few builds (godot/data/vectors/meshes.json).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { decodePack } from '../../src/render/pack.js';
import { expandQuads } from '../../src/render/mesher.js';

const pack = decodePack(zlib.gunzipSync(fs.readFileSync('godot/assets/models-pack.bin')));
const keys = [...pack.keys()];
const pickKeys = [keys.find((k) => k.startsWith('lod1-colony-w1|')), keys.find((k) => k.startsWith('lod0-place-hospital|')), keys.find((k) => k.startsWith('lamp3|')), keys.find((k) => k.startsWith('tree-0|')), keys.find((k) => k.startsWith('lod2-lm-powerplant|'))].filter(Boolean);
const out = pickKeys.map((ck) => {
  const e = pack.get(ck); const p = ck.split('|');
  const o = { size: +p[1], jitter: +p[2], jitterLevels: +p[3], aoStrength: +p[7] };
  const g = expandQuads(e.lit, e.palette, e.off, o);
  let sp = 0; let sc = 0;
  for (let i = 0; i < g.position.length; i++) sp += g.position[i] * ((i % 7) + 1);
  for (let i = 0; i < g.color.length; i++) sc += g.color[i] * ((i % 5) + 1);
  return { key: ck, verts: g.position.length / 3, tris: g.index.length / 3, posSum: sp, colSum: sc, first: Array.from(g.position.slice(0, 12)), idx: Array.from(g.index.slice(0, 12)) };
});
fs.writeFileSync('godot/data/vectors/meshes.json', JSON.stringify(out, null, 1));
console.log(out.map((o) => `${o.key.split('|')[0]} ${o.verts}v`).join(', '));
