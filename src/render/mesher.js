// LOAD-1: the voxel mesher on typed arrays. Pure (no three.js), so it also runs in a Web Worker and in Node.
// Input: flat voxel lists + a palette. Output: typed vertex buffers for the lit and glow meshes.
// Produces exactly the same quads, in the same order, as the old Map-based mesher.

// Per direction: normal, the 4 corner offsets, face shade (same table as before).
const FACES = [
  { dir: [1, 0, 0], shade: 0.86 },
  { dir: [-1, 0, 0], shade: 0.8 },
  { dir: [0, 1, 0], shade: 1.0 },
  { dir: [0, -1, 0], shade: 0.55 },
  { dir: [0, 0, 1], shade: 0.92 },
  { dir: [0, 0, -1], shade: 0.74 },
];
const CORNER_SIGNS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

export function hash3(x, y, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// A quad record: plane, u0, w0, wu, ww, face | ao << 3, palette entry, jitter level (8 × Int16).
export const QUAD = 8;
class Quads {
  constructor() { this.n = 0; this.a = new Int16Array(QUAD * 1024); }
  push(plane, u0, w0, wu, ww, face, ao, pe, jl) {
    if ((this.n + 1) * QUAD > this.a.length) { const b = new Int16Array(this.a.length * 2); b.set(this.a); this.a = b; }
    const o = this.n++ * QUAD; const a = this.a;
    a[o] = plane; a[o + 1] = u0; a[o + 2] = w0; a[o + 3] = wu; a[o + 4] = ww; a[o + 5] = face | (ao << 3); a[o + 6] = pe; a[o + 7] = jl;
  }
  out() { return this.n ? this.a.slice(0, this.n * QUAD) : null; }
}

/**
 * vox: { n, xs, ys, zs (Int32Array), pal (Uint32Array, palette index per voxel) }
 * palette: { rgb (Float32Array, linear r,g,b per entry), glow (Uint8Array per entry) }
 * Returns { lit, glow } with typed attribute arrays (or null).
 */
export function meshVoxels(vox, palette, opts = {}) {
  const q = quadVoxels(vox, palette, opts);
  return { lit: expandQuads(q.lit, palette, q.off, opts), glow: expandQuads(q.glow, palette, q.off, opts) };
}

/** The greedy pass: exposed faces merged into quad records (lit and glow), plus the centring offset. */
export function quadVoxels(vox, palette, { jitter = 0.05, jitterLevels = 4, origin = 'center', greedy = true, ao = true } = {}) {
  const { n, xs, ys, zs, pal } = vox;
  if (!n) return { lit: null, glow: null, off: [0, 0, 0], min: [0, 0, 0], max: [0, 0, 0] };
  let x0 = Infinity; let y0 = Infinity; let z0 = Infinity; let x1 = -Infinity; let y1 = -Infinity; let z1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = xs[i]; const y = ys[i]; const z = zs[i];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  const min = [x0, y0, z0]; const max = [x1 + 1, y1 + 1, z1 + 1];
  const off = origin === 'center' ? [-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2] : [0, 0, 0];
  // Dense grid with a 1-voxel empty border, so neighbour lookups need no bounds checks.
  const D = [max[0] - min[0] + 2, max[1] - min[1] + 2, max[2] - min[2] + 2];
  const stride = [D[1] * D[2], D[2], 1];
  const grid = new Int32Array(D[0] * D[1] * D[2]).fill(-1); // voxel index or -1
  const at = (x, y, z) => (x - min[0] + 1) * stride[0] + (y - min[1] + 1) * stride[1] + (z - min[2] + 1);
  for (let i = 0; i < n; i++) grid[at(xs[i], ys[i], zs[i])] = i;
  const isGlow = palette.glow;
  const solid = (gi) => { const v = grid[gi]; return v >= 0 && !isGlow[pal[v]] ? 1 : 0; };
  const useJitter = jitterLevels > 1 && jitter !== 0;
  const bufs = [new Quads(), new Quads()]; // lit, glow
  const p = [0, 0, 0];
  const aoc = [3, 3, 3, 3];

  for (let fi = 0; fi < 6; fi++) {
    const f = FACES[fi];
    const a = f.dir.findIndex((d) => d !== 0);
    const s = f.dir[a];
    const u = (a + 1) % 3; const w = (a + 2) % 3;
    const du = max[u] - min[u]; const dw = max[w] - min[w];
    const dOff = s * stride[a]; const su = stride[u]; const sw = stride[w];
    const ids = new Float64Array(du * dw);   // -1 = no face, else a merge id
    const vix = new Int32Array(du * dw);     // voxel index per cell
    const aos = new Uint8Array(du * dw);     // packed AO (4 × 2 bits)
    const done = new Uint8Array(du * dw);
    for (let slice = min[a]; slice < max[a]; slice++) {
      let any = false;
      for (let iu = 0; iu < du; iu++) {
        for (let iw = 0; iw < dw; iw++) {
          const c = iu * dw + iw;
          ids[c] = -1;
          p[a] = slice; p[u] = min[u] + iu; p[w] = min[w] + iw;
          const gi = at(p[0], p[1], p[2]);
          const vi = grid[gi];
          if (vi < 0) continue;
          const g = isGlow[pal[vi]];
          const ni = grid[gi + dOff];
          if (ni >= 0 && isGlow[pal[ni]] === g) continue; // hidden face
          let packed = 255;
          if (ao && !g) {
            const q = gi + dOff;
            packed = 0;
            for (let k = 0; k < 4; k++) {
              const cu = CORNER_SIGNS[k][0] * su; const cw = CORNER_SIGNS[k][1] * sw;
              const s1 = solid(q + cu); const s2 = solid(q + cw); const cc = solid(q + cu + cw);
              const v = s1 && s2 ? 0 : 3 - (s1 + s2 + cc);
              packed |= v << (k * 2);
            }
          }
          const jl = useJitter ? Math.floor(hash3(xs[vi], ys[vi], zs[vi]) * jitterLevels) : 0;
          ids[c] = ((pal[vi] * 2 + g) * 16 + jl) * 256 + packed;
          vix[c] = vi; aos[c] = packed;
          any = true;
        }
      }
      if (!any) continue;
      done.fill(0);
      for (let iu = 0; iu < du; iu++) {
        for (let iw = 0; iw < dw; iw++) {
          const c0 = iu * dw + iw;
          if (ids[c0] < 0 || done[c0]) continue;
          const id = ids[c0]; const pk = aos[c0];
          for (let k = 0; k < 4; k++) aoc[k] = (pk >> (k * 2)) & 3;
          const uniformAo = aoc[0] === aoc[1] && aoc[1] === aoc[2] && aoc[2] === aoc[3];
          let wu = 1; let ww = 1;
          if (greedy && uniformAo) {
            while (iw + ww < dw && ids[iu * dw + iw + ww] === id && !done[iu * dw + iw + ww]) ww++;
            outer: while (iu + wu < du) {
              for (let j = 0; j < ww; j++) { const c = (iu + wu) * dw + iw + j; if (ids[c] !== id || done[c]) break outer; }
              wu++;
            }
          }
          for (let i = 0; i < wu; i++) for (let j = 0; j < ww; j++) done[(iu + i) * dw + iw + j] = 1;
          const vi = vix[c0]; const pe = pal[vi];
          const jl = jitterLevels > 1 ? Math.floor(hash3(xs[vi], ys[vi], zs[vi]) * jitterLevels) : 0;
          bufs[isGlow[pe] ? 1 : 0].push(slice + (s > 0 ? 1 : 0), min[u] + iu, min[w] + iw, wu, ww, fi, pk, pe, jl);
        }
      }
    }
  }
  return { lit: bufs[0].out(), glow: bufs[1].out(), off, min, max };
}

/** Quad records -> typed vertex buffers (positions, normals, colours, indices). */
export function expandQuads(quads, palette, off, { size = 1, jitter = 0.05, jitterLevels = 4, aoStrength = 0.45 } = {}) {
  if (!quads) return null;
  const nq = quads.length / QUAD; const nv = nq * 4;
  const pos = new Float32Array(nv * 3); const nrm = new Float32Array(nv * 3); const col = new Float32Array(nv * 3);
  const idx = nv > 65535 ? new Uint32Array(nq * 6) : new Uint16Array(nq * 6);
  const AO_CURVE = [1 - aoStrength, 1 - aoStrength * 0.6, 1 - aoStrength * 0.25, 1];
  const rgb = palette.rgb; const isGlow = palette.glow;
  const facing = FACES.map((f) => { const a = f.dir.findIndex((d) => d !== 0); return faceWinding(a, (a + 1) % 3, (a + 2) % 3, f.dir); });
  const q = [0, 0, 0];
  for (let k = 0; k < nq; k++) {
    const o = k * QUAD;
    const plane = quads[o]; const u0 = quads[o + 1]; const w0 = quads[o + 2]; const wu = quads[o + 3]; const ww = quads[o + 4];
    const fi = quads[o + 5] & 7; const pk = (quads[o + 5] >> 3) & 255; const pe = quads[o + 6]; const jl = quads[o + 7];
    const f = FACES[fi]; const a = f.dir.findIndex((d) => d !== 0); const u = (a + 1) % 3; const w = (a + 2) % 3;
    const g = isGlow[pe];
    const jf = jitterLevels > 1 ? 1 + (jl / (jitterLevels - 1) - 0.5) * 2 * jitter : 1;
    const shade = (g ? 1 : f.shade) * jf;
    const r = rgb[pe * 3]; const gg = rgb[pe * 3 + 1]; const bb = rgb[pe * 3 + 2];
    const base = k * 4;
    let a0 = 3; let a1 = 3; let a2 = 3; let a3 = 3;
    for (let i = 0; i < 4; i++) {
      q[a] = plane; q[u] = u0 + CU[i] * wu; q[w] = w0 + CW[i] * ww;
      const vo = (base + i) * 3;
      pos[vo] = (q[0] + off[0]) * size; pos[vo + 1] = (q[1] + off[1]) * size; pos[vo + 2] = (q[2] + off[2]) * size;
      nrm[vo] = f.dir[0]; nrm[vo + 1] = f.dir[1]; nrm[vo + 2] = f.dir[2];
      const ac = (pk >> (i * 2)) & 3;
      if (i === 0) a0 = ac; else if (i === 1) a1 = ac; else if (i === 2) a2 = ac; else a3 = ac;
      const kk = shade * (g ? 1 : AO_CURVE[ac]);
      col[vo] = r * kk; col[vo + 1] = gg * kk; col[vo + 2] = bb * kk;
    }
    const t = a0 + a2 < a1 + a3 ? FLIP : NOFLIP;
    const io = k * 6;
    for (let i = 0; i < 6; i += 3) {
      idx[io + i] = base + t[i];
      if (facing[fi]) { idx[io + i + 1] = base + t[i + 1]; idx[io + i + 2] = base + t[i + 2]; }
      else { idx[io + i + 1] = base + t[i + 2]; idx[io + i + 2] = base + t[i + 1]; }
    }
  }
  return { position: pos, normal: nrm, color: col, index: idx };
}
const FLIP = [0, 1, 3, 1, 2, 3]; const NOFLIP = [0, 1, 2, 0, 2, 3];

function faceWinding(a, u, w, dir) {
  const pts = [[0, 0], [1, 0], [1, 1]].map(([cu, cw]) => { const q = [0, 0, 0]; q[u] = cu; q[w] = cw; return q; });
  const e1 = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]];
  const e2 = [pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]];
  const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  return cr[0] * dir[0] + cr[1] * dir[1] + cr[2] * dir[2] > 0;
}

const CU = [0, 1, 1, 0]; const CW = [0, 0, 1, 1];
