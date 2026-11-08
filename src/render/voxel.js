// VoxelModel: collect voxels in a sparse grid, then emit ONE merged BufferGeometry per material
// with hidden faces culled. Every model in FROSTBOUND is built from code with this class.
import * as THREE from 'three';

const FACES = [
  { dir: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.86 },
  { dir: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], shade: 0.8 },
  { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0 },
  { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.55 },
  { dir: [0, 0, 1], corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], shade: 0.92 },
  { dir: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], shade: 0.74 },
];

const key = (x, y, z) => `${x},${y},${z}`;

/** Cheap deterministic hash -> [0,1) used for colour jitter and decoration placement. */
export function hash3(x, y, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class VoxelModel {
  constructor() {
    this.voxels = new Map(); // key -> { x, y, z, color, glow }
  }

  set(x, y, z, color, glow = false) {
    this.voxels.set(key(x, y, z), { x, y, z, color, glow });
    return this;
  }

  get(x, y, z) {
    return this.voxels.get(key(x, y, z));
  }

  remove(x, y, z) {
    this.voxels.delete(key(x, y, z));
    return this;
  }

  /** Fill a box. `color` may be a function (x,y,z) => color | null (null = skip). */
  box(x0, y0, z0, w, h, d, color, glow = false) {
    for (let x = x0; x < x0 + w; x++) {
      for (let y = y0; y < y0 + h; y++) {
        for (let z = z0; z < z0 + d; z++) {
          const c = typeof color === 'function' ? color(x, y, z) : color;
          if (c != null) this.set(x, y, z, c, glow);
        }
      }
    }
    return this;
  }

  clearBox(x0, y0, z0, w, h, d) {
    for (let x = x0; x < x0 + w; x++) for (let y = y0; y < y0 + h; y++) for (let z = z0; z < z0 + d; z++) this.remove(x, y, z);
    return this;
  }

  /** Hollow walls (no floor/roof). */
  walls(x0, y0, z0, w, h, d, color) {
    return this.box(x0, y0, z0, w, h, d, (x, _y, z) => (
      x === x0 || x === x0 + w - 1 || z === z0 || z === z0 + d - 1 ? (typeof color === 'function' ? color(x, _y, z) : color) : null
    ));
  }

  /** Dust every exposed top surface with snow (probability p, skips glowing voxels). */
  snowCap(color = 0xf4f8ff, p = 0.9, minY = 1) {
    const tops = new Map();
    for (const v of this.voxels.values()) {
      const k = `${v.x},${v.z}`;
      if (!tops.has(k) || tops.get(k).y < v.y) tops.set(k, v);
    }
    for (const v of tops.values()) {
      if (v.glow || v.y < minY || v.noSnow) continue;
      if (hash3(v.x, v.y, v.z) < p) this.set(v.x, v.y + 1, v.z, color);
    }
    return this;
  }

  /** Copy another model into this one at an offset. */
  merge(other, ox = 0, oy = 0, oz = 0) {
    for (const v of other.voxels.values()) this.set(v.x + ox, v.y + oy, v.z + oz, v.color, v.glow);
    return this;
  }

  bounds() {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const v of this.voxels.values()) {
      min[0] = Math.min(min[0], v.x); min[1] = Math.min(min[1], v.y); min[2] = Math.min(min[2], v.z);
      max[0] = Math.max(max[0], v.x + 1); max[1] = Math.max(max[1], v.y + 1); max[2] = Math.max(max[2], v.z + 1);
    }
    return { min, max };
  }

  /** Every voxel replicated into a k×k×k block (the basis for higher-resolution "HD" models). */
  upscale(k = 2) {
    const out = new VoxelModel();
    for (const v of this.voxels.values()) {
      for (let dx = 0; dx < k; dx++) for (let dy = 0; dy < k; dy++) for (let dz = 0; dz < k; dz++) {
        out.set(v.x * k + dx, v.y * k + dy, v.z * k + dz, v.color, v.glow);
      }
    }
    return out;
  }

  /**
   * Round off convex edges: a voxel exposed on two perpendicular sides (e.g. top + side) is removed
   * with probability p. Only one layer is taken, so 2-thick (upscaled) features never disappear.
   * `keep(v)` can protect voxels (faces, symbols…).
   */
  bevel(p = 0.6, { keep = () => false, seed = 0, topOnly = false } = {}) {
    const empty = (x, y, z) => !this.voxels.has(key(x, y, z));
    const doomed = [];
    for (const v of this.voxels.values()) {
      if (v.glow || keep(v)) continue;
      const up = empty(v.x, v.y + 1, v.z);
      const sides = [empty(v.x + 1, v.y, v.z), empty(v.x - 1, v.y, v.z), empty(v.x, v.y, v.z + 1), empty(v.x, v.y, v.z - 1)];
      const nSides = sides.filter(Boolean).length;
      const topEdge = up && nSides >= 1;
      const vertEdge = !topOnly && ((sides[0] || sides[1]) && (sides[2] || sides[3]));
      // Don't hollow out thin things: the voxel below/inside must remain.
      if ((topEdge || vertEdge) && hash3(v.x + seed, v.y, v.z) < p && nSides < 3) doomed.push(v);
    }
    for (const v of doomed) this.remove(v.x, v.y, v.z);
    return this;
  }

  /** Recolour every voxel: fn(v) -> color (or null to delete, undefined to keep). */
  recolor(fn) {
    for (const v of [...this.voxels.values()]) {
      const c = fn(v);
      if (c === null) this.remove(v.x, v.y, v.z);
      else if (c !== undefined) v.color = c;
    }
    return this;
  }

  /**
   * Build geometries. Returns { lit, glow } BufferGeometries (either may be null).
   * size: world size of one voxel. origin: 'center' centers x/z on the footprint and keeps y=0 at the base.
   * greedy: merge coplanar same-colour faces into big quads (needs uniform AO to merge).
   * ao: per-vertex ambient occlusion baked into vertex colours.
   * jitter / jitterLevels: deterministic per-voxel brightness variation, quantised so faces can still merge.
   * cacheKey: reuse an earlier build with the same key and options.
   */
  buildGeometries({ size = 1, jitter = 0.05, jitterLevels = 4, origin = 'center', greedy = true, ao = true, aoStrength = 0.45, cacheKey = null } = {}) {
    const ck = cacheKey && `${cacheKey}|${size}|${jitter}|${jitterLevels}|${origin}|${greedy}|${ao}|${aoStrength}`;
    if (ck && GEO_CACHE.has(ck)) return GEO_CACHE.get(ck);
    const { min, max } = this.bounds();
    const off = origin === 'center'
      ? [-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2]
      : [0, 0, 0];
    const vox = this.voxels;
    const solid = (x, y, z) => { const n = vox.get(key(x, y, z)); return n && !n.glow ? 1 : 0; };
    const buckets = { lit: newBucket(), glow: newBucket() };
    const col = new THREE.Color();
    const AO_CURVE = [1 - aoStrength, 1 - aoStrength * 0.6, 1 - aoStrength * 0.25, 1];

    // For each axis-aligned face direction, sweep slices and collect exposed faces in a 2D mask.
    for (const f of FACES) {
      const a = f.dir.findIndex((d) => d !== 0); // normal axis
      const s = f.dir[a];
      const u = (a + 1) % 3;
      const w = (a + 2) % 3;
      const du = max[u] - min[u];
      const dw = max[w] - min[w];
      for (let slice = min[a]; slice < max[a]; slice++) {
        // mask cell -> face descriptor
        let cells = null;
        const p = [0, 0, 0];
        for (let iu = 0; iu < du; iu++) {
          for (let iw = 0; iw < dw; iw++) {
            p[a] = slice; p[u] = min[u] + iu; p[w] = min[w] + iw;
            const v = vox.get(key(p[0], p[1], p[2]));
            if (!v) continue;
            const n = vox.get(key(p[0] + f.dir[0], p[1] + f.dir[1], p[2] + f.dir[2]));
            if (n && n.glow === v.glow) continue; // hidden face
            // Per-corner AO from the three neighbours in front of the face.
            let aoc = [3, 3, 3, 3];
            if (ao && !v.glow) {
              const q = [p[0] + f.dir[0], p[1] + f.dir[1], p[2] + f.dir[2]];
              aoc = CORNER_SIGNS.map(([su, sw]) => {
                const s1 = at(q, u, su, w, 0, solid);
                const s2 = at(q, u, 0, w, sw, solid);
                const cc = at(q, u, su, w, sw, solid);
                return s1 && s2 ? 0 : 3 - (s1 + s2 + cc);
              });
            }
            const jl = jitterLevels > 1 ? Math.floor(hash3(v.x, v.y, v.z) * jitterLevels) / (jitterLevels - 1) - 0.5 : 0;
            const jf = 1 + jl * 2 * jitter;
            if (!cells) cells = new Array(du * dw);
            cells[iu * dw + iw] = { color: v.color, glow: v.glow, jf, aoc, id: `${v.color}|${v.glow ? 1 : 0}|${jf}|${aoc.join('')}`, uniformAo: aoc[0] === aoc[1] && aoc[1] === aoc[2] && aoc[2] === aoc[3] };
          }
        }
        if (!cells) continue;
        const done = new Uint8Array(du * dw);
        for (let iu = 0; iu < du; iu++) {
          for (let iw = 0; iw < dw; iw++) {
            const c0 = cells[iu * dw + iw];
            if (!c0 || done[iu * dw + iw]) continue;
            let wu = 1;
            let ww = 1;
            if (greedy && c0.uniformAo) {
              const same = (i, j) => { const c = cells[i * dw + j]; return c && !done[i * dw + j] && c.id === c0.id; };
              while (iw + ww < dw && same(iu, iw + ww)) ww++;
              outer: while (iu + wu < du) {
                for (let j = 0; j < ww; j++) if (!same(iu + wu, iw + j)) break outer;
                wu++;
              }
            }
            for (let i = 0; i < wu; i++) for (let j = 0; j < ww; j++) done[(iu + i) * dw + iw + j] = 1;
            emitQuad(c0.glow ? buckets.glow : buckets.lit, f, a, s, u, w, slice, min[u] + iu, min[w] + iw, wu, ww, c0, off, size, col, AO_CURVE);
          }
        }
      }
    }
    const result = { lit: toGeometry(buckets.lit), glow: toGeometry(buckets.glow) };
    if (ck) GEO_CACHE.set(ck, result);
    return result;
  }

  /** Convenience: a Group with a lit mesh (casts/receives shadows) and an unlit glow mesh. */
  build(opts = {}) {
    const { lit, glow } = this.buildGeometries(opts);
    const group = new THREE.Group();
    if (lit) {
      const m = new THREE.Mesh(lit, MATERIALS.lit);
      m.castShadow = opts.castShadow ?? true;
      m.receiveShadow = opts.receiveShadow ?? true;
      group.add(m);
    }
    if (glow) group.add(new THREE.Mesh(glow, MATERIALS.glow));
    return group;
  }
}

const GEO_CACHE = new Map();
export function clearGeometryCache() { GEO_CACHE.clear(); }
export const geometryCacheSize = () => GEO_CACHE.size;

// Corner order around a face, as (sign along u, sign along w).
const CORNER_SIGNS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

function at(q, u, su, w, sw, solid) {
  const p = [q[0], q[1], q[2]];
  p[u] += su;
  p[w] += sw;
  return solid(p[0], p[1], p[2]);
}

/** Emit one (possibly merged) quad with per-vertex colour = base × face shade × jitter × AO. */
function emitQuad(b, f, a, s, u, w, slice, u0, w0, wu, ww, c, off, size, col, AO_CURVE) {
  const plane = slice + (s > 0 ? 1 : 0);
  const corners = [[u0, w0], [u0 + wu, w0], [u0 + wu, w0 + ww], [u0, w0 + ww]];
  col.setHex(c.color);
  const shade = (c.glow ? 1 : f.shade) * c.jf;
  const base = b.pos.length / 3;
  const pts = corners.map(([cu, cw]) => { const p = [0, 0, 0]; p[a] = plane; p[u] = cu; p[w] = cw; return p; });
  corners.forEach((_, i) => {
    const p = pts[i];
    b.pos.push((p[0] + off[0]) * size, (p[1] + off[1]) * size, (p[2] + off[2]) * size);
    b.nrm.push(...f.dir);
    const k = shade * (c.glow ? 1 : AO_CURVE[c.aoc[i]]);
    b.col.push(col.r * k, col.g * k, col.b * k);
  });
  // Winding must face along the normal; flip the diagonal when AO would otherwise look anisotropic.
  const e1 = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]];
  const e2 = [pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]];
  const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const facing = cross[0] * f.dir[0] + cross[1] * f.dir[1] + cross[2] * f.dir[2] > 0;
  const flip = c.aoc[0] + c.aoc[2] < c.aoc[1] + c.aoc[3];
  let tris = flip ? [[0, 1, 3], [1, 2, 3]] : [[0, 1, 2], [0, 2, 3]];
  if (!facing) tris = tris.map(([x, y, z]) => [x, z, y]);
  for (const tr of tris) b.idx.push(base + tr[0], base + tr[1], base + tr[2]);
}

function newBucket() {
  return { pos: [], nrm: [], col: [], idx: [] };
}

function toGeometry(b) {
  if (!b.pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
  g.setIndex(b.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

// Shared materials: every voxel mesh uses one of these two, so the GPU state stays tiny.
export const MATERIALS = {
  lit: new THREE.MeshLambertMaterial({ vertexColors: true }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false }), // lights cut through the haze
};
