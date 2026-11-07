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

  /**
   * Build geometries. Returns { lit, glow } BufferGeometries (either may be null).
   * size: world size of one voxel. origin: 'center' centers x/z on the footprint and keeps y=0 at the base.
   */
  buildGeometries({ size = 1, jitter = 0.05, origin = 'center' } = {}) {
    const { min, max } = this.bounds();
    const off = origin === 'center'
      ? [-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2]
      : [0, 0, 0];
    const buckets = { lit: newBucket(), glow: newBucket() };
    const col = new THREE.Color();
    for (const v of this.voxels.values()) {
      const b = v.glow ? buckets.glow : buckets.lit;
      const j = 1 + (hash3(v.x, v.y, v.z) - 0.5) * 2 * jitter;
      for (const f of FACES) {
        const n = this.voxels.get(key(v.x + f.dir[0], v.y + f.dir[1], v.z + f.dir[2]));
        if (n && n.glow === v.glow) continue; // hidden face
        col.setHex(v.color);
        // Baked ambient-occlusion-ish face shading keeps the voxel look readable at night.
        const s = (v.glow ? 1 : f.shade) * j;
        const base = b.pos.length / 3;
        for (const c of f.corners) {
          b.pos.push((v.x + c[0] + off[0]) * size, (v.y + c[1] + off[1]) * size, (v.z + c[2] + off[2]) * size);
          b.nrm.push(...f.dir);
          b.col.push(col.r * s, col.g * s, col.b * s);
        }
        b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    return { lit: toGeometry(buckets.lit), glow: toGeometry(buckets.glow) };
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
