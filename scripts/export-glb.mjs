// GODOT-0: export every city model build (all levels of detail) as .glb for the Godot port.
//   node scripts/export-glb.mjs   -> godot/assets/models/<lod>/<name>.glb + index.json
// Builds the same models as the bake (scripts/bench/model-keys.mjs). Voxel world scale is kept
// (L0 0.15 / L1 0.3 / L2 0.6 world units per voxel), Y up. If everything is over LIMIT_MB, only L1 + L2 go out.
import fs from 'node:fs';
import { collect } from './bench/model-keys.mjs';
import { writeGlb } from './godot/glb.mjs';

const OUT = 'godot/assets/models';
const LIMIT_MB = 60;

export const lodOf = (ck) => (/^lod(\d)-/.exec(ck)?.[1] ? `lod${/^lod(\d)-/.exec(ck)[1]}` : 'misc');
export function fileOf(ck) {
  let h = 2166136261; for (let i = 0; i < ck.length; i++) h = Math.imul(h ^ ck.charCodeAt(i), 16777619);
  const base = ck.split('|')[0].replace(/^lod\d-/, '').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 60);
  return `${base}-${(h >>> 0).toString(16).padStart(8, '0')}.glb`;
}
const meshOf = (g) => g && { position: g.attributes.position.array, normal: g.attributes.normal.array, color: g.attributes.color.array, index: g.index.array };

export async function exportGlb({ out = OUT, write = true } = {}) {
  const t0 = Date.now();
  const cache = await collect();
  const files = [];
  for (const [ck, { lit, glow }] of cache) {
    if (ck.startsWith('flame|')) continue;
    const bytes = writeGlb([{ mesh: meshOf(lit) }, { mesh: meshOf(glow), unlit: true }], { name: ck.split('|')[0] });
    const g = lit ?? glow; g.computeBoundingBox?.();
    const box = lit?.boundingBox ?? glow?.boundingBox;
    const tris = ((lit?.index.count ?? 0) + (glow?.index.count ?? 0)) / 3;
    files.push({ key: ck, lod: lodOf(ck), file: `${lodOf(ck)}/${fileOf(ck)}`, tris, bbox: box ? [box.min.toArray(), box.max.toArray()] : null, bytes });
  }
  const mb = (list) => list.reduce((a, f) => a + f.bytes.length, 0) / 1e6;
  let keep = files; let note = 'all levels of detail';
  if (mb(files) > LIMIT_MB) { keep = files.filter((f) => f.lod !== 'lod0'); note = `all levels were ${mb(files).toFixed(1)} MB (> ${LIMIT_MB}); close-up level (lod0) left out`; }
  if (write) {
    fs.rmSync(out, { recursive: true, force: true });
    for (const f of keep) { fs.mkdirSync(`${out}/${f.lod}`, { recursive: true }); fs.writeFileSync(`${out}/${f.file}`, f.bytes); }
    fs.writeFileSync(`${out}/index.json`, JSON.stringify({ note, models: keep.map(({ bytes, ...f }) => f) }, null, 1));
  }
  return { files: keep, note, MB: mb(keep), ms: Date.now() - t0 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await exportGlb();
  console.log(`exported ${r.files.length} glb, ${r.MB.toFixed(1)} MB (${r.note}), ${r.ms} ms`);
}
