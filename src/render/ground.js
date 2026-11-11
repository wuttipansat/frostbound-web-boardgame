// MAP-3 part D: the raised ground of a city block. Flat geometry (no heightmap cells), so edges stay straight:
// a slab GROUND high with kerb stones round its edge (corners cut at 45°), small grey sidewalk slabs in running bond,
// large slabs (or snow) inside, dark grout showing between them, the odd cracked slab and a manhole cover.
import * as THREE from 'three';
import { hash3 } from './mesher.js';

export const GROUND = 0.25;          // top of every block above the street
const KERB = 0.3;                    // kerb stone band at the slab's edge
const GROUT = 0.06;
const CUT = 0.8;                     // 45° corner cut
const SIDEWALK = [0xbac1c9, 0xb1b8c1, 0xc4cad1, 0xaab1ba];
const INNER = [0xa4abb4, 0x9ba2ab, 0xaeb4bc, 0x949ba4];
const SNOWY = [0xeef3f8, 0xe6edf4, 0xf4f7fa, 0xdfe7ef];
const BASE = 0x6c737d; const SNOW_BASE = 0xdde5ee;
const KERBS = [0xd6dade, 0xc7ccd2]; const SIDE = 0x8d949e;
const CRACK = 0x5a6069; const SNOW = 0xf1f5f9;

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
      quad([[p1[0], 0, p1[1]], [p0[0], 0, p0[1]], [p0[0], GROUND, p0[1]], [p1[0], GROUND, p1[1]]], n, detail && k % 2 ? SIDE : 0x979ea8);
    }
  }
  // Base (grout colour) covering the octagon: centre rectangle + 4 trapezoid-free strips (corners left as cut).
  const base = surface === 'snow' ? SNOW_BASE : BASE;
  const yb = GROUND - 0.005;
  top(x0 + CUT, z0, x1 - CUT, z1, yb, detail ? base : INNER[0]);
  top(x0, z0 + CUT, x0 + CUT, z1 - CUT, yb, detail ? base : INNER[0]);
  top(x1 - CUT, z0 + CUT, x1, z1 - CUT, yb, detail ? base : INNER[0]);
  // The cut corners themselves (triangles as degenerate quads).
  for (const [cx, cz, sx, sz] of [[x0, z0, 1, 1], [x1, z0, -1, 1], [x0, z1, 1, -1], [x1, z1, -1, -1]]) {
    const a = [cx + sx * CUT, yb, cz]; const b = [cx, yb, cz + sz * CUT]; const c = [cx + sx * CUT, yb, cz + sz * CUT];
    const up = (sx * sz > 0);
    quad(up ? [a, b, c, c] : [a, c, b, b], [0, 1, 0], detail ? KERBS[0] : INNER[0]);
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
  // Kerb stones: a band of 1-world stones round the edge.
  const K = [[x0, z0, x1, z0 + KERB], [x0, z1 - KERB, x1, z1], [x0, z0 + KERB, x0 + KERB, z1 - KERB], [x1 - KERB, z0 + KERB, x1, z1 - KERB]];
  K.forEach((zone, s) => {
    const alongX = s < 2;
    for (let t = Math.floor(alongX ? zone[0] : zone[1]); t < (alongX ? zone[2] : zone[3]); t++) {
      const hex = KERBS[(t + s) & 1];
      if (alongX) tile(t, zone[1], t + 1, zone[3], zone, hex); else tile(zone[0], t, zone[2], t + 1, zone, hex);
    }
  });
  // Sidewalk: small 1×1 slabs in running bond, in 4 strips inside the kerb.
  const i0 = [x0 + KERB, z0 + KERB, x1 - KERB, z1 - KERB];
  const inner = [i0[0] + walk, i0[1] + walk, i0[2] - walk, i0[3] - walk];
  const strips = [[i0[0], i0[1], i0[2], inner[1], true], [i0[0], inner[3], i0[2], i0[3], true], [i0[0], inner[1], inner[0], inner[3], false], [inner[2], inner[1], i0[2], inner[3], false]];
  const palette = SIDEWALK; // sidewalks stay grey paving; only the inside of a park / lot / the colony is snow
  for (const [ax, az, bx, bz, alongX] of strips) {
    const zone = [ax, az, bx, bz];
    for (let r = Math.floor(alongX ? az : ax); r < (alongX ? bz : bx); r++) {
      const off = r & 1 ? 0.5 : 0;
      for (let c = Math.floor((alongX ? ax : az) - off); c < (alongX ? bx : bz); c++) {
        const a = c + off;
        const near = Math.min(Math.abs(r + 0.5 - (alongX ? inner[1] : inner[0])), Math.abs(r + 0.5 - (alongX ? inner[3] : inner[2])));
        const snowy = hash3(r + sa, 31, c + sb) < (near < 0.8 ? 0.22 : 0.05); // snow lingers by the building line
        const t = alongX ? tile(a, r, a + 1, r + 1, zone, snowy ? SNOW : tone(palette, r, c, 33)) : tile(r, a, r + 1, a + 1, zone, snowy ? SNOW : tone(palette, r, c, 33));
        if (t && !snowy && hash3(c + sa, 35, r + sb) < 0.04) top(t[0] + 0.1, (t[1] + t[3]) / 2 - 0.02, t[2] - 0.15, (t[1] + t[3]) / 2 + 0.02, GROUND + 0.003, CRACK);
      }
    }
  }
  // Inside: large 2×2 slabs in a straight grid (or snow), a few cracked, one manhole cover.
  const ip = surface === 'snow' ? SNOWY : INNER;
  for (let x = Math.floor(inner[0] / 2) * 2; x < inner[2]; x += 2) {
    for (let z = Math.floor(inner[1] / 2) * 2; z < inner[3]; z += 2) {
      const t = tile(x, z, x + 2, z + 2, inner, tone(ip, x, z, 37));
      if (t && surface !== 'snow' && hash3(x + sa, 39, z + sb) < 0.05) top(t[0] + 0.3, t[1] + 0.25, t[2] - 0.2, t[1] + 0.3, GROUND + 0.003, CRACK);
    }
  }
  if (surface !== 'snow' && inner[2] - inner[0] > 3) {
    const mx = inner[0] + 1 + hash3(sa, 41, sb) * (inner[2] - inner[0] - 2.4); const mz = inner[1] + 1 + hash3(sb, 43, sa) * (inner[3] - inner[1] - 2.4);
    top(mx, mz, mx + 1.2, mz + 1.2, GROUND + 0.004, 0x4a5058);
    top(mx + 0.15, mz + 0.15, mx + 1.05, mz + 1.05, GROUND + 0.006, 0x5c636c);
  }
  return finish(pos, nrm, cols, idx);
}

function finish(pos, nrm, cols, idx) {
  return { position: new Float32Array(pos), normal: new Float32Array(nrm), color: new Float32Array(cols), index: new Uint32Array(idx) };
}
