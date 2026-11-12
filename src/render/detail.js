// HD detailing: turns an upscaled (2×) VoxelModel into a richer one with material patterns,
// ordered dithering, window frames + sills, icicles, lumpy snow and bevelled edges.
// Everything is deterministic (hash-based), so a model always builds the same way.
import { hash3, VoxelModel } from './voxel.js';
import { P } from './palette.js';

// ---------------------------------------------------------------- colour helpers

export function shadeHex(hex, k) {
  const r = Math.max(0, Math.min(255, Math.round(((hex >> 16) & 255) * k)));
  const g = Math.max(0, Math.min(255, Math.round(((hex >> 8) & 255) * k)));
  const b = Math.max(0, Math.min(255, Math.round((hex & 255) * k)));
  return (r << 16) | (g << 8) | b;
}

export function mixHex(a, b, t) {
  const ch = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
/** Ordered-dither threshold for a voxel (uses the two axes that vary on most surfaces). */
export const bayer = (x, y, z) => BAYER4[((y & 3) << 2) | ((x + z) & 3)];

/** Slow 3D value noise in [0,1) for large-scale tonal variation (cheap: hash of a coarse cell). */
const coarse = (x, y, z, s = 6) => hash3(Math.floor(x / s), Math.floor(y / s), Math.floor(z / s));

// ---------------------------------------------------------------- material classification

const MAT = new Map();
const tag = (kind, colors) => colors.forEach((c) => MAT.set(c, kind));
tag('snow', [P.snow, P.snowShade, P.snowBlue]);
tag('wood', [P.wood, P.woodDark, P.woodLight, 0x8a5a2b, 0x6b5a48, 0x2e5a3a, 0x2f5a3a]);
tag('brick', [0x9a4a3a, 0x86402f]);
tag('stone', [P.rock, P.rockLight, 0xb3a68d, 0x988b72, 0xc7bba2, 0xa79b84, 0xe2d9c6, 0xd6ccb7, 0x5f7f7a]);
tag('siding', [0xcfc2a4, 0x8d8473, 0xd9d2c3, 0x34425e, 0x2b3448, 0xe4eaf0, 0xc9d3dc, 0x9aa6b2]);
tag('metal', [P.metal, P.metalDark, 0x111111, 0x1d2840]);
tag('glass', [P.glass, 0xbfe6ff]);
tag('pine', [P.pine, P.pineDark]);
export const materialOf = (color) => MAT.get(color) ?? 'paint';
/** Register more colours for a material (e.g. the city palette). */
export const tagMaterial = (kind, colors) => tag(kind, colors);

const FRAME = 0xe6dfd0;
const SILL = 0xd8d0bf;
const ICE = 0xcfe6f7;
const ICE_TIP = 0xf2faff;
const MORTAR = 0xb5a596;

/** Material pattern for one voxel (HD coordinates). Returns a new colour. */
export function patternColor(v) {
  const { x, y, z, color } = v;
  const h = hash3(x, y, z);
  switch (materialOf(color)) {
    case 'brick': {
      // 3-row courses, running bond: vertical joints shift by half a brick every course
      const course = Math.floor(y / 3);
      const run = x + z + (course % 2) * 3;
      if (y % 3 === 0 || run % 6 === 0) return MORTAR;
      return shadeHex(color, 0.88 + hash3(Math.floor(run / 6), course, 7) * 0.22);
    }
    case 'stone': {
      const row = Math.floor(y / 3);
      const block = Math.floor((x + z + (row % 2) * 2) / 4);
      if (y % 3 === 0 && h < 0.85) return shadeHex(color, 0.82);
      return shadeHex(color, 0.9 + hash3(block, row, 3) * 0.16 + (bayer(x, y, z) - 0.5) * 0.05);
    }
    case 'siding':
      return shadeHex(color, (y % 3 === 0 ? 0.88 : 1) * (0.97 + coarse(x, y, z) * 0.06));
    case 'wood': {
      if (h < 0.012) return shadeHex(color, 0.7); // knot
      const grain = Math.sin(y * 1.7 + hash3(x, 0, z) * 6.28);
      return shadeHex(color, 0.92 + grain * 0.07 + (bayer(x, y, z) - 0.5) * 0.04);
    }
    case 'metal':
      return shadeHex(color, (y % 2 ? 1.06 : 0.94));
    case 'glass':
      return (x + y + z) % 7 === 0 ? shadeHex(color, 1.45) : color;
    case 'pine':
      return bayer(x, y, z) < 0.35 + coarse(x, y, z, 3) * 0.3 ? P.pineDark : P.pine;
    case 'snow':
      if (h < 0.018) return 0xffffff; // sparkle
      if (hash3(x + 3, y, z) < 0.07) return P.snowBlue;
      return bayer(x, y, z) < 0.25 * coarse(x, y, z, 4) ? P.snowShade : P.snow;
    default:
      // painted surfaces: gentle dithered two-step ramp so large areas aren't flat
      return bayer(x, y, z) < 0.3 * coarse(x, y, z, 5) ? shadeHex(color, 0.93) : color;
  }
}

// ---------------------------------------------------------------- detail passes

const H4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Window frames on the wall around every glowing window voxel, plus a protruding sill below it. */
export function frameWindows(m) {
  const add = [];
  for (const v of m.voxels.values()) {
    if (!v.glow) continue;
    const out = H4.find(([dx, dz]) => !m.get(v.x + dx, v.y, v.z + dz));
    if (!out) continue;
    const tangent = out[0] !== 0 ? [0, 1] : [1, 0];
    for (const [tx, ty, tz] of [[tangent[0], 0, tangent[1]], [-tangent[0], 0, -tangent[1]], [0, 1, 0], [0, -1, 0]]) {
      const n = m.get(v.x + tx, v.y + ty, v.z + tz);
      if (n && !n.glow && materialOf(n.color) !== 'snow') n.color = FRAME;
    }
    const below = m.get(v.x, v.y - 1, v.z);
    if (below && !below.glow) add.push([v.x + out[0], v.y - 1, v.z + out[1]]);
  }
  for (const [x, y, z] of add) if (!m.get(x, y, z)) m.set(x, y, z, SILL);
  return m;
}

/** Icicles hanging from exposed edges above `minY` (HD voxels). */
export function addIcicles(m, { minY = 10, p = 0.16, seed = 0 } = {}) {
  const hangs = [];
  for (const v of m.voxels.values()) {
    if (v.glow || v.y < minY || m.get(v.x, v.y - 1, v.z)) continue;
    if (!H4.some(([dx, dz]) => !m.get(v.x + dx, v.y, v.z + dz))) continue; // only along edges
    if (hash3(v.x + seed, v.y * 3, v.z) > p) continue;
    hangs.push([v.x, v.y, v.z, 1 + Math.floor(hash3(v.x, v.y + seed, v.z * 5) * 3)]);
  }
  for (const [x, y, z, len] of hangs) {
    for (let i = 1; i <= len; i++) {
      if (m.get(x, y - i, z)) break;
      m.set(x, y - i, z, i === len ? ICE_TIP : ICE);
    }
  }
  return m;
}

/** Upscaled snow caps are 2 voxels thick; thin them into soft, lumpy single/double layers. */
export function lumpySnow(m, { p = 0.45 } = {}) {
  const gone = [];
  for (const v of m.voxels.values()) {
    if (materialOf(v.color) !== 'snow' || m.get(v.x, v.y + 1, v.z)) continue;
    const below = m.get(v.x, v.y - 1, v.z);
    if (below && materialOf(below.color) === 'snow' && hash3(v.x, v.y, v.z + 11) < p) gone.push(v);
  }
  for (const v of gone) m.remove(v.x, v.y, v.z);
  return m;
}

export function applyPatterns(m) {
  return m.recolor((v) => (v.glow || v.color === FRAME || v.color === SILL || v.color === ICE || v.color === ICE_TIP ? undefined : patternColor(v)));
}

/** The full building treatment for an upscaled model. */
export function detailBuilding(m, { seed = 0, icicles = true, bevel = 0.4 } = {}) {
  frameWindows(m);
  lumpySnow(m);
  if (icicles) addIcicles(m, { seed });
  applyPatterns(m);
  m.bevel(bevel, { seed, keep: (v) => v.color === FRAME || v.color === SILL || v.color === ICE || v.color === ICE_TIP });
  return m;
}

export const DETAIL_COLORS = { FRAME, SILL, ICE, ICE_TIP, MORTAR };

// ---------------------------------------------------------------- MAP-2 B: city models at 2× resolution

/**
 * Turn a city model (authored at 1 voxel = 0.24 world) into a 2× one with real detail: window mullions,
 * transoms and frames, brick courses / wall panels, lumpy snow. glass / glassLit / frame are the model's colours.
 */
export function refineCity(src, { glass, glassLit, frame, mullion }) {
  // Thin parts (posts, rails, fences, ledges, awnings, signs: 1 voxel with air on both sides) become half as
  // thick at 2×, which is what makes the finer grid show.
  const thin = [];
  for (const v of src.voxels.values()) {
    if (materialOf(v.color) === 'snow') continue;
    const air = (dx, dy, dz) => !src.get(v.x + dx, v.y + dy, v.z + dz);
    thin.push([v.x, v.y, v.z, air(-1, 0, 0) && air(1, 0, 0), air(0, -1, 0) && air(0, 1, 0) && v.y > 0, air(0, 0, -1) && air(0, 0, 1)]);
  }
  const m = src.upscale(2);
  for (const [x, y, z, tx, ty, tz] of thin) {
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++) {
      if ((tx && dx) || (ty && dy) || (tz && dz)) m.remove(2 * x + dx, 2 * y + dy, 2 * z + dz);
    }
  }
  lumpySnow(m, { p: 1 }); // snow caps one fine voxel thick
  const isGlass = (v) => v && (v.color === glass || v.color === glassLit);
  const edits = [];
  for (const v of m.voxels.values()) {
    if (!isGlass(v)) continue;
    const out = H4.find(([dx, dz]) => !m.get(v.x + dx, v.y, v.z + dz));
    if (!out) continue;
    const [tx, tz] = out[0] !== 0 ? [0, 1] : [1, 0];
    const run = (sx, sy, sz) => { let n = 0; while (n < 40 && isGlass(m.get(v.x + sx * (n + 1), v.y + sy * (n + 1), v.z + sz * (n + 1)))) n++; return n; };
    const l = run(-tx, 0, -tz); const r = run(tx, 0, tz); const d = run(0, -1, 0); const u = run(0, 1, 0);
    const w = l + r + 1; const h = d + u + 1;
    // A cross of glazing bars on windows (wide shop glass gets bars every 6), then the frame around.
    const bar = (w >= 5 && (l === Math.floor((w - 1) / 2) || (w > 12 && l % 6 === 5))) || (h >= 7 && d === Math.floor(h * 0.62));
    if (bar) edits.push([v, mullion]);
    for (const [ax, ay, az] of [[tx, 0, tz], [-tx, 0, -tz], [0, 1, 0], [0, -1, 0]]) {
      const n = m.get(v.x + ax, v.y + ay, v.z + az);
      if (n && !isGlass(n) && !n.glow && materialOf(n.color) !== 'snow') edits.push([n, frame]);
    }
  }
  for (const [v, c] of edits) { v.color = c; v.glow = false; }
  // Patterns only where they read as material (brick courses, metal ribs, wood); plain paint and snow stay flat so
  // the mesher can merge big faces (dithering every wall would triple the triangle count).
  m.recolor((v) => (v.glow || !['brick', 'metal', 'wood'].includes(materialOf(v.color)) ? undefined : patternColor(v)));
  return m;
}

/** Half-resolution copy for far views: each 2×2×2 cell becomes one voxel if at least 3 of its 8 are filled
 *  (the most common colour wins; any glow keeps it glowing). */
export function downsample(src) {
  const cells = new Map();
  for (const v of src.voxels.values()) {
    const k = `${Math.floor(v.x / 2)},${Math.floor(v.y / 2)},${Math.floor(v.z / 2)}`;
    let c = cells.get(k);
    if (!c) cells.set(k, c = { n: 0, colors: new Map(), glow: false });
    c.n++; c.glow ||= !!v.glow;
    c.colors.set(v.color, (c.colors.get(v.color) ?? 0) + 1);
  }
  const out = new VoxelModel();
  for (const [k, c] of cells) {
    if (c.n < 3) continue;
    const [x, y, z] = k.split(',').map(Number);
    let best = 0; let color = 0;
    for (const [col, n] of c.colors) if (n > best) { best = n; color = col; }
    out.set(x, y, z, color, c.glow);
  }
  return out;
}

/**
 * VOXEL-2 finish pass for authored models (before the snow cap): colour noise in 3-voxel cells (±4% value, so big
 * faces still merge into a few quads), grime on the two lowest rows, lighter outer vertical edges.
 */
export function finish(m, seed = 0) {
  const H = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const v of m.voxels.values()) {
    if (v.glow || materialOf(v.color) === 'snow' || v.y === 0) continue;
    let k = 1 + (hash3(Math.floor(v.x / 3) + seed, Math.floor(v.y / 3), Math.floor(v.z / 3)) - 0.5) * 0.08;
    if (v.y <= 2) k *= 0.86;                                  // grime at the foot
    const out = H.filter(([dx, dz]) => !m.get(v.x + dx, v.y, v.z + dz));
    if (out.length >= 2 && out.some(([dx]) => dx) && out.some(([, dz]) => dz)) k *= 1.08; // an outer corner catches the light
    if (Math.abs(k - 1) > 0.01) v.color = shadeHex(v.color, k);
  }
  return m;
}
