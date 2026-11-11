// VoxelModel: collect voxels in a sparse grid, then emit ONE merged BufferGeometry per material
// with hidden faces culled. Every model in FROSTBOUND is built from code with this class.
import * as THREE from 'three';
import { hash3, quadVoxels, expandQuads } from './mesher.js';


// LOAD-1: numeric keys (no string building per lookup). Coordinates must stay within ±4095.
const key = (x, y, z) => ((x + 4096) * 8192 + (y + 4096)) * 8192 + (z + 4096);

/** Cheap deterministic hash -> [0,1) used for colour jitter and decoration placement. */
export { hash3 };

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
    const opts = { size, jitter, jitterLevels, origin, greedy, ao, aoStrength };
    const ck = cacheKey && keyOf(cacheKey, opts);
    if (ck && GEO_CACHE.has(ck)) return GEO_CACHE.get(ck);
    const [vox, palette] = this.toArrays();
    const q = quadVoxels(vox, palette, opts);
    if (ck && RECORD) RECORD.set(ck, { ...q, palette, opts });
    const result = { lit: toGeometry(expandQuads(q.lit, palette, q.off, opts)), glow: toGeometry(expandQuads(q.glow, palette, q.off, opts)) };
    if (ck) GEO_CACHE.set(ck, result);
    return result;
  }

  /** Flat typed arrays for the mesher (and for workers): voxel coordinates + palette indices, and the palette. */
  toArrays() {
    const n = this.voxels.size;
    const xs = new Int32Array(n); const ys = new Int32Array(n); const zs = new Int32Array(n); const pal = new Uint32Array(n);
    const ids = new Map(); const rgb = []; const glow = [];
    let i = 0;
    for (const v of this.voxels.values()) {
      const pk = v.glow ? -1 - v.color : v.color;
      let pi = ids.get(pk);
      if (pi === undefined) {
        pi = ids.size; ids.set(pk, pi);
        const c = linear(v.color); rgb.push(c[0], c[1], c[2]); glow.push(v.glow ? 1 : 0);
      }
      xs[i] = v.x; ys[i] = v.y; zs[i] = v.z; pal[i] = pi; i++;
    }
    return [{ n, xs, ys, zs, pal }, { rgb: new Float32Array(rgb), glow: new Uint8Array(glow) }];
  }

  /** Convenience: a Group with a lit mesh (casts/receives shadows) and an unlit glow mesh. */
  build(opts = {}) {
    return groupOf(this.buildGeometries(opts), opts);
  }
}

const GEO_CACHE = new Map();
const DEFAULTS = { size: 1, jitter: 0.05, jitterLevels: 4, origin: 'center', greedy: true, ao: true, aoStrength: 0.45 };
/** The cache key of one build (model key + every option that changes the mesh). */
export function keyOf(cacheKey, o = {}) {
  const x = { ...DEFAULTS, ...o };
  return `${cacheKey}|${x.size}|${x.jitter}|${x.jitterLevels}|${x.origin}|${x.greedy}|${x.ao}|${x.aoStrength}`;
}

// LOAD-1: meshes baked at build time (scripts/bake-models.mjs). A packed model needs no voxels at all.
let PACK = null;
export function usePack(pack) { PACK = pack; }
/** Voxel bounds of a packed build (or null). */
export const packedBounds = (cacheKey, opts) => PACK?.get(keyOf(cacheKey, opts)) ?? null;
/** Geometries for a model build: memory cache, then the baked pack, then make() + mesh. */
export function geometriesFor(cacheKey, opts, make) {
  const ck = keyOf(cacheKey, opts);
  if (GEO_CACHE.has(ck)) return GEO_CACHE.get(ck);
  const e = PACK?.get(ck);
  if (e) {
    const o = { ...DEFAULTS, ...opts };
    const result = { lit: toGeometry(expandQuads(e.lit, e.palette, e.off, o)), glow: toGeometry(expandQuads(e.glow, e.palette, e.off, o)) };
    GEO_CACHE.set(ck, result);
    return result;
  }
  return make().buildGeometries({ ...opts, cacheKey });
}
/** A lit + glow group from geometries (what VoxelModel.build returns). */
export function groupOf({ lit, glow }, opts = {}) {
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
// Baking: record quad output of keyed builds.
let RECORD = null;
export function recordQuads(map) { RECORD = map; }
export function clearGeometryCache() { GEO_CACHE.clear(); }
export const geometryCacheSize = () => GEO_CACHE.size;
export const geometryCache = () => GEO_CACHE;

const LINEAR = new Map();
const tmpColor = new THREE.Color();
/** sRGB hex -> working-space (linear) rgb, as THREE.Color.setHex does; cached per colour. */
function linear(hex) {
  let c = LINEAR.get(hex);
  if (!c) { tmpColor.setHex(hex); c = [tmpColor.r, tmpColor.g, tmpColor.b]; LINEAR.set(hex, c); }
  return c;
}

/** Typed mesher output -> BufferGeometry. */
export function toGeometry(b) {
  if (!b) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(b.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(b.normal, 3));
  g.setAttribute('color', new THREE.BufferAttribute(b.color, 3));
  g.setIndex(new THREE.BufferAttribute(b.index, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

// Shared materials: every voxel mesh uses one of these two, so the GPU state stays tiny.
export const MATERIALS = {
  lit: new THREE.MeshLambertMaterial({ vertexColors: true }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false }), // lights cut through the haze
};
