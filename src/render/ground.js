// MAP-3 part D: the raised ground of a city block. Flat geometry (no heightmap cells), so edges stay straight:
// a slab GROUND high with kerb stones round its edge (corners cut at 45°), small grey sidewalk slabs in running bond,
// large slabs (or snow) inside, dark grout showing between them, the odd cracked slab and a manhole cover.
import * as THREE from 'three';
import { hash3 } from './mesher.js';

export const GROUND = 0.25;          // top of every block above the street
const KERB = 0.3;                    // kerb stone band at the slab's edge
const GROUT = 0.06;
const CUT = 0.8;                     // 45° corner cut
// One field of large pale concrete slabs (the reference look), mostly buried under snow: clustered bare patches
// show the slabs, thin dark grout and dirt specks.
const TILE = 2;
const SLABS = [0xcfccbf, 0xcac7b9, 0xd4d1c5];
const SNOWY = [0xeef3f8, 0xe6edf4, 0xf4f7fa];
const BASE = 0x8e8b80; const SNOW_BASE = 0xdde5ee;
const KERBS = [0xdcd9ce, 0xd2cfc3]; const SIDE = 0xa8a598;
const CRACK = 0x7a776c; const SNOW = 0xf3f6f9;
const DIRT = [0x6b5a48, 0x7a6650];

const col = new THREE.Color();
/**
 * o: { x0, x1, z0, z1 (slab edge, world), walk (sidewalk width inside the kerb), surface: 'paved' | 'snow',
 *      detail (false = the far level: a plain slab), seed: [bx, bz] }
 * Returns typed arrays { position, normal, color, index } in world space.
 */
export function blockSlab({ x0, x1, z0, z1, walk = 2.2, surface = 'paved', detail = true, seed = [0, 0] }) {
  const pos = []; const nrm = []; const cols = []; const idx = [];
  const [sa, sb] = seed;
  const quad = (pts, n, hex) => {
    const b = pos.length / 3;
    col.setHex(hex);
    for (const p of pts) { pos.push(...p); nrm.push(...n); cols.push(col.r, col.g, col.b); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  // Top rectangle at height y (wound to face up).
  const top = (ax, az, bx, bz, y, hex) => { if (bx - ax > 1e-4 && bz - az > 1e-4) quad([[ax, y, az], [ax, y, bz], [bx, y, bz], [bx, y, az]], [0, 1, 0], hex); };
  const cutAt = (x, z) => [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].some(([cx, cz]) => Math.abs(x - cx) + Math.abs(z - cz) < CUT + 0.05);
  // Outline (octagon) and its side faces from 0 to GROUND.
  const ring = [[x0 + CUT, z0], [x1 - CUT, z0], [x1, z0 + CUT], [x1, z1 - CUT], [x1 - CUT, z1], [x0 + CUT, z1], [x0, z1 - CUT], [x0, z0 + CUT]];
  for (let i = 0; i < 8; i++) {
    const [ax, az] = ring[i]; const [bx, bz] = ring[(i + 1) % 8];
    const ex = bx - ax; const ez = bz - az; const len = Math.hypot(ex, ez);
    const n = [ez / len, 0, -ex / len]; // outward for a clockwise-from-above ring
    const steps = detail && i % 2 === 0 ? Math.max(1, Math.round(len)) : 1; // kerb stone joints every ~1 world
    for (let k = 0; k < steps; k++) {
      const t0 = k / steps; const t1 = (k + 1) / steps;
      const p0 = [ax + ex * t0, az + ez * t0]; const p1 = [ax + ex * t1, az + ez * t1];
      quad([[p1[0], 0, p1[1]], [p0[0], 0, p0[1]], [p0[0], GROUND, p0[1]], [p1[0], GROUND, p1[1]]], n, detail && k % 2 ? SIDE : 0xb3b0a4);
    }
  }
  // Base (grout colour) covering the octagon: centre rectangle + 4 trapezoid-free strips (corners left as cut).
  const base = surface === 'snow' ? SNOW_BASE : BASE;
  const yb = GROUND - 0.005;
  top(x0 + CUT, z0, x1 - CUT, z1, yb, detail ? base : SLABS[0]);
  top(x0, z0 + CUT, x0 + CUT, z1 - CUT, yb, detail ? base : SLABS[0]);
  top(x1 - CUT, z0 + CUT, x1, z1 - CUT, yb, detail ? base : SLABS[0]);
  // The cut corners themselves (triangles as degenerate quads).
  for (const [cx, cz, sx, sz] of [[x0, z0, 1, 1], [x1, z0, -1, 1], [x0, z1, 1, -1], [x1, z1, -1, -1]]) {
    const a = [cx + sx * CUT, yb, cz]; const b = [cx, yb, cz + sz * CUT]; const c = [cx + sx * CUT, yb, cz + sz * CUT];
    const up = (sx * sz > 0);
    quad(up ? [a, b, c, c] : [a, c, b, b], [0, 1, 0], detail ? KERBS[0] : SLABS[0]);
  }
  if (!detail) return finish(pos, nrm, cols, idx);
  // Tiles: rect clipped to a zone; skip ones in a cut corner.
  const tile = (ax, az, bx, bz, zone, hex) => {
    const cx0 = Math.max(ax, zone[0]) + GROUT / 2; const cz0 = Math.max(az, zone[1]) + GROUT / 2;
    const cx1 = Math.min(bx, zone[2]) - GROUT / 2; const cz1 = Math.min(bz, zone[3]) - GROUT / 2;
    if (cx1 - cx0 < 0.12 || cz1 - cz0 < 0.12 || cutAt((cx0 + cx1) / 2, (cz0 + cz1) / 2)) return null;
    top(cx0, cz0, cx1, cz1, GROUND, hex);
    return [cx0, cz0, cx1, cz1];
  };
  const tone = (list, i, j, k) => list[Math.floor(hash3(i * 3 + sa, k, j * 3 + sb) * list.length)];
  // Kerb: a pale band of 2-world stones round the edge.
  const K = [[x0, z0, x1, z0 + KERB], [x0, z1 - KERB, x1, z1], [x0, z0 + KERB, x0 + KERB, z1 - KERB], [x1 - KERB, z0 + KERB, x1, z1 - KERB]];
  K.forEach((zone, s) => {
    const alongX = s < 2;
    for (let t = Math.floor((alongX ? zone[0] : zone[1]) / 2) * 2; t < (alongX ? zone[2] : zone[3]); t += 2) {
      const hex = KERBS[(t / 2 + s) & 1];
      if (alongX) tile(t, zone[1], t + 2, zone[3], zone, hex); else tile(zone[0], t, zone[2], t + 2, zone, hex);
    }
  });
  // One grid of large slabs over the whole block (aligned to world coordinates); snow inside parks / lots / colony.
  const i0 = [x0 + KERB, z0 + KERB, x1 - KERB, z1 - KERB];
  const inner = [i0[0] + walk, i0[1] + walk, i0[2] - walk, i0[3] - walk];
  const inside = (x, z) => x > inner[0] && x < inner[2] && z > inner[1] && z < inner[3];
  const edgeD = (x, z) => Math.min(x - i0[0], i0[2] - x, z - i0[1], i0[3] - z);
  const bit = (cx, cz, w, d, hex, y = 0.004) => top(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, GROUND + y, hex);
  for (let x = Math.floor(i0[0] / TILE) * TILE; x < i0[2]; x += TILE) {
    for (let z = Math.floor(i0[1] / TILE) * TILE; z < i0[3]; z += TILE) {
      const mx = x + TILE / 2; const mz = z + TILE / 2;
      // Snow covers every slab: one soft white field (no grout showing), its tone drifting in large soft patches.
      // Here and there a slab is only partly covered: one corner melted / swept bare, showing the concrete and grout.
      const cx0 = Math.max(x, i0[0]); const cz0 = Math.max(z, i0[1]); const cx1 = Math.min(x + TILE, i0[2]); const cz1 = Math.min(z + TILE, i0[3]);
      if (cx1 - cx0 < 0.05 || cz1 - cz0 < 0.05 || cutAt((cx0 + cx1) / 2, (cz0 + cz1) / 2)) continue;
      const soft = SNOWY[Math.floor(hash3(Math.floor(mx / 6) + sa, 47, Math.floor(mz / 6) + sb) * SNOWY.length)];
      const h = (k) => hash3(x * 5 + sa, k, z * 5 + sb);
      const snowInside = surface === 'snow' && inside(mx, mz);
      const partial = !snowInside && cx1 - cx0 > 1.5 && cz1 - cz0 > 1.5 && h(49) < (edgeD(mx, mz) < 2.5 ? 0.16 : 0.07);
      if (!partial) { top(cx0, cz0, cx1, cz1, GROUND + 0.002, soft); continue; }
      const t = tile(x, z, x + TILE, z + TILE, i0, tone(SLABS, x, z, 33));
      if (!t) continue;
      // The bare part: a corner of the slab (0.6–1.3 by 0.5–1.1), snow over the rest as an L of two pieces.
      const bw = 0.6 + h(50) * 0.7; const bd = 0.5 + h(51) * 0.6;
      const right = h(52) < 0.5; const far = h(53) < 0.5;
      const bx0 = right ? cx1 - bw : cx0; const bx1 = right ? cx1 : cx0 + bw;
      const bz0 = far ? cz1 - bd : cz0; const bz1 = far ? cz1 : cz0 + bd;
      const ys = GROUND + 0.004;
      top(cx0, far ? cz0 : bz1, cx1, far ? bz0 : cz1, ys, soft);              // full-width band beside the bare corner
      top(right ? cx0 : bx1, bz0, right ? bx0 : cx1, bz1, ys, soft);          // the rest of the corner's row
      // Ragged snow edge: a few small lumps reaching into the bare corner.
      for (let k = 0; k < 3; k++) {
        const ex = bx0 + h(54 + k) * (bx1 - bx0); const ez = bz0 + h(58 + k) * (bz1 - bz0);
        bit(ex, ez, 0.15 + h(62 + k) * 0.3, 0.12 + h(66 + k) * 0.25, SNOW, 0.006 + k * 0.001);
      }
      if (h(101) < 0.25) bit((bx0 + bx1) / 2, (bz0 + bz1) / 2, 0.25, 0.18, DIRT[Math.floor(h(104) * 2)], 0.005);
      continue;
      // Dirt, leaves and litter specks; a few cracked slabs.
      if (h(101) < 0.07) bit(t[0] + 0.5 + h(102) * (t[2] - t[0] - 1), t[1] + 0.5 + h(103) * (t[3] - t[1] - 1), 0.35, 0.25, DIRT[Math.floor(h(104) * 2)], 0.005);
      if (h(105) < 0.05) top(t[0] + 0.2, (t[1] + t[3]) / 2 - 0.02, t[2] - 0.3, (t[1] + t[3]) / 2 + 0.02, GROUND + 0.003, CRACK);
    }
  }
  if (surface !== 'snow' && inner[2] - inner[0] > 3) {
    const mx = inner[0] + 1 + hash3(sa, 41, sb) * (inner[2] - inner[0] - 2.4); const mz = inner[1] + 1 + hash3(sb, 43, sa) * (inner[3] - inner[1] - 2.4);
    top(mx, mz, mx + 1.2, mz + 1.2, GROUND + 0.004, 0x5e5c55);
    top(mx + 0.15, mz + 0.15, mx + 1.05, mz + 1.05, GROUND + 0.006, 0x77746b);
  }
  return finish(pos, nrm, cols, idx);
}

function finish(pos, nrm, cols, idx) {
  return { position: new Float32Array(pos), normal: new Float32Array(nrm), color: new Float32Array(cols), index: new Uint32Array(idx) };
}
