// UI-13 part C (take 2): the town's buildings as a city diorama — our own models, built at full voxel
// resolution (1 voxel = 0.3 world units): hollow concrete shells with floor ledges, framed windows (lit, dark,
// boarded), shopfronts with awnings and shutters, balconies, drainpipes, wall and roof AC units, a stair hut,
// a water tank, moss, graffiti, neon signs with a dead letter, and a light dusting of snow on top.
// Front (door side) faces +z; the board turns each model so its front faces a side the camera sees.
import { VoxelModel, hash3 } from './voxel.js';
import { P } from './palette.js';
import { refineCity, tagMaterial, downsample, finish, addIcicles } from './detail.js';

export const C = {
  sage: 0xa7b5a0, sageDark: 0x8a9884, cream: 0xddd5bc, creamDark: 0xbcb399, ochre: 0xdca04c, ochreDark: 0xb27d33,
  grey: 0xa3adb8, greyDark: 0x6c7580, brick: 0xa45a46, trim: 0xe4e2da, roof: 0x8d948f, roofDark: 0x6d746f,
  tile: 0xcfc8b2, tileLine: 0xaea78f, asphalt: 0x2b2e33, paint: 0xe6e6e0,
  glass: 0x2c3b4c, glassLit: 0xffc66b, board: 0x6a4a30, metal: 0x8e979f, metalDark: 0x4b525a,
  moss: 0x5f8a3e, mossDark: 0x46692e, rust: 0x9a4b2f,
  red: 0xc0392b, neonRed: 0xff5a4f, neonBlue: 0x76d6ff, neonPink: 0xff74b8, neonGreen: 0x86ffa2, neonWarm: 0xffd27a,
  cont: [0xa63a2e, 0x2b4170, 0x2f6446],
};
const FH = 10; // floor height in voxels
// MAP-6: a dying town: few windows are lit (places, where people and generators are, a few more).
let litRate = 0.03;
/** Build a model with another lit-window rate (places). */
export function withLit(rate, make) { const was = litRate; litRate = rate; try { return make(); } finally { litRate = was; } }

// 3×5 pixel font, drawn at scale 2 (6×10 voxels a letter).
const GLYPH = {
  A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'], C: ['011', '100', '100', '100', '011'],
  E: ['111', '100', '110', '100', '111'], G: ['011', '100', '101', '101', '011'], H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'], K: ['101', '110', '100', '110', '101'], L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'], O: ['010', '101', '101', '101', '010'], P: ['110', '101', '110', '100', '100'],
  R: ['110', '101', '110', '101', '101'], S: ['011', '100', '010', '001', '110'], T: ['111', '010', '010', '010', '010'],
  // MAP-8: for place names and direction signs.
  D: ['110', '101', '101', '101', '110'], N: ['101', '111', '111', '111', '101'], U: ['101', '101', '101', '101', '111'],
  Y: ['101', '101', '010', '010', '010'], W: ['101', '101', '111', '111', '101'], F: ['111', '100', '110', '100', '100'],
  '>': ['100', '010', '001', '010', '100'],
};
/** MAP-8: painted letters (no glow) on the plane z, centred on cx, bottom at y. */
export function paint(m, text, cx, y, z, color, k = 1) {
  const w = text.length * 4 * k - k; const x0 = Math.round(cx - w / 2);
  [...text].forEach((ch, i) => GLYPH[ch]?.forEach((row, r) => [...row].forEach((bit, c) => { if (bit === '1') m.box(x0 + (i * 4 + c) * k, y + (4 - r) * k, z, k, k, 1, color); })));
  return w;
}

/** Neon letters on a dark board on the front plane z, centred on cx, bottom at y. Letter `dead` (or every index in a list) is unlit. */
export function neon(m, text, cx, y, z, color, dead = -1, k = 1) {
  const w = text.length * 4 * k - k;
  const x0 = Math.round(cx - w / 2);
  m.box(x0 - 2, y - 2, z, w + 4, 5 * k + 4, 1, 0x1e2126);
  [...text].forEach((ch, i) => {
    const g = GLYPH[ch]; if (!g) return;
    g.forEach((row, r) => [...row].forEach((bit, c) => {
      if (bit !== '1') return;
      const off = Array.isArray(dead) ? dead.includes(i) : i === dead;
      m.box(x0 + (i * 4 + c) * k, y + (4 - r) * k, z + 1, k, k, 1, off ? 0x4a3a3c : color, !off);
    }));
  });
}

/** Iterate the outward cells of one face of a box: fn(x, z, u, out) per column along the face. */
function eachFace(x0, z0, w, d, fn) {
  for (let u = 0; u < w; u++) { fn(x0 + u, z0 + d - 1, u, [0, 1], 'front'); fn(x0 + u, z0, u, [0, -1], 'back'); }
  for (let u = 0; u < d; u++) { fn(x0 + w - 1, z0 + u, u, [1, 0], 'right'); fn(x0, z0 + u, u, [-1, 0], 'left'); }
}

/**
 * A concrete block, hollow: walls, a slab per floor, a ledge on every floor line, framed windows,
 * then the roof. o: { x0, z0, w, d, floors, wall, trim, seed, shop, balconies }
 */
export function block(m, o) {
  const { x0 = 0, z0 = 0, w, d, floors, wall, trim = C.trim, seed = 1, shop = false, balconies = false } = o;
  const H = floors * FH;
  m.walls(x0, 1, z0, w, H, d, wall);
  for (let f = 1; f <= floors; f++) m.box(x0 + 1, f * FH, z0 + 1, w - 2, 1, d - 2, C.roofDark); // floor slabs (hide the hollow)
  // Ledges: a 1-voxel trim band sticking out on every floor line.
  for (let f = 1; f < floors; f++) {
    eachFace(x0, z0, w, d, (x, z, _u, [ox, oz]) => m.set(x + ox, f * FH, z + oz, trim));
  }
  // Windows: 3 wide × 5 high, framed, every 6 voxels; ground floor of a shop is a shopfront instead.
  eachFace(x0, z0, w, d, (x, z, u, [ox, oz], side) => {
    const len = side === 'front' || side === 'back' ? w : d;
    if (u < 2 || u > len - 3) return;
    const slot = (u - 2) % 6;
    for (let f = 0; f < floors; f++) {
      if (f === 0 && shop && side === 'front') continue;
      if (slot > 2) continue;
      const yb = f * FH + 3;
      const r = hash3(Math.floor((u - 2) / 6), f, seed + side.length * 7);
      const lit = r < litRate; /* MAP-6: ~3% of windows lit */ const boarded = r > 0.9; const broken = r > 0.8 && !boarded;
      // MAP-3: windows sit one voxel back in the wall (depth on the façade); boards are nailed on the face.
      for (let y = yb; y < yb + 5; y++) {
        if (boarded) { m.set(x, y, z, C.board); continue; }
        m.remove(x, y, z);
        m.set(x - ox, y, z - oz, broken ? 0x15191e : lit ? C.glassLit : C.glass, lit);
      }
      m.set(x + ox, yb - 1, z + oz, trim); // sill
      if (slot === 1) { m.set(x + ox, yb + 5, z + oz, trim); m.set(x, yb + 5, z, trim); } // lintel
      if (boarded && slot === 1) m.set(x + ox, yb + 2, z + oz, C.board);
      // Shutters beside a few windows.
      if (!boarded && slot === 0 && hash3(u, f, seed + 31) < 0.18) for (let y = yb; y < yb + 5; y++) m.set(x - (side === 'front' || side === 'back' ? 1 : 0), y, z - (side === 'left' || side === 'right' ? 1 : 0), 0x4e5d4a);
    }
  });
  // MAP-3 façade depth: a dark plinth, pilasters between window bays and at the corners, a cornice at the roof line.
  eachFace(x0, z0, w, d, (x, z, u, [ox, oz], side) => {
    const len = side === 'front' || side === 'back' ? w : d;
    m.set(x + ox, 1, z + oz, C.greyDark);
    if (u === 0 || u === len - 1 || (u % 12 === 6 && u < len - 3)) for (let y = 2; y < H; y++) if (!m.get(x + ox, y, z + oz)) m.set(x + ox, y, z + oz, trim);
    m.set(x + ox, H - 1, z + oz, trim); m.set(x + ox, H, z + oz, C.creamDark);
    // Snow drifted against the wall base: a low, uneven bank (never across a doorway or shopfront at the front).
    const n = hash3(Math.floor(u / 4), 17, seed);
    if (n < 0.55 && !(side === 'front' && o.shop)) {
      m.set(x + 2 * ox, 1, z + 2 * oz, P.snow);
      if (n < 0.3) m.set(x + ox, 2, z + oz, P.snow);
    }
  });
  if (shop) shopfront(m, x0, z0, w, d, seed);
  if (balconies) {
    for (let f = 1; f < floors; f++) for (let u = 4; u < w - 6; u += 12) {
      if (hash3(u, f, seed) < 0.3) continue;
      const bx = x0 + u; const bz = z0 + d;
      m.box(bx - 1, f * FH + 1, bz, 7, 1, 3, C.trim);
      for (let k = 0; k < 7; k += 1) m.set(bx - 1 + k, f * FH + 2, bz + 2, k % 2 ? C.metalDark : C.metal);
      m.set(bx - 1, f * FH + 2, bz + 1, C.metal); m.set(bx + 5, f * FH + 2, bz + 1, C.metal);
      if (hash3(u, f, seed + 3) < 0.4) m.box(bx + 1, f * FH + 2, bz, 2, 2, 1, 0x7a5a3a); // junk on the balcony
    }
  }
  // Drainpipe on the front-right corner, wall AC units on the right side.
  m.box(x0 + w, 1, z0 + d - 1, 1, H, 1, C.metalDark);
  for (let f = 0; f < floors; f++) if (hash3(f, seed, 4) < 0.6) {
    const z = z0 + 3 + Math.floor(hash3(f, seed, 5) * (d - 8));
    m.box(x0 + w, f * FH + 2, z, 2, 2, 3, C.metal); m.set(x0 + w + 1, f * FH + 3, z + 1, C.metalDark);
  }
  // MAP-1c: an external fire escape down the right side of tall buildings (landings + zigzag ladders).
  if (floors >= 3 && d >= 14) {
    const fz = z0 + d - 12;
    for (let f = 1; f < floors; f++) {
      const y = f * FH;
      m.box(x0 + w, y, fz, 3, 1, 9, C.metalDark);
      for (let z = fz; z < fz + 9; z += 2) m.set(x0 + w + 2, y + 1, z, C.metal);
      for (let k = 0; k < FH - 1; k++) m.set(x0 + w + 1, y - 1 - k, fz + (f % 2 ? 1 + Math.floor(k * 7 / FH) : 7 - Math.floor(k * 7 / FH)), C.metal);
    }
  }
  // A warning sign (skull) on some walls.
  if (hash3(seed, 8, 8) < 0.35 && w > 14) {
    const sx = x0 + 3 + Math.floor(hash3(seed, 9, 9) * (w - 9)); const sy = Math.min(H - 6, FH + 2);
    m.box(sx, sy, z0 + d, 5, 5, 1, C.trim);
    for (const [x, y] of [[1, 1], [3, 1], [2, 2], [1, 3], [2, 3], [3, 3]]) m.set(sx + x, sy + y, z0 + d, 0x15191e);
  }
  moss(m, x0, z0, w, d, H, seed);
  roof(m, x0, z0, w, d, H, seed);
  return H;
}

function shopfront(m, x0, z0, w, d, seed) {
  const z = z0 + d - 1;
  const tones = [0x2f5f6f, 0x6f2f2f, 0x2f4f2f, 0x3f3f6a];
  for (let x = x0 + 2; x < x0 + w - 2; x++) {
    const bay = Math.floor((x - x0 - 2) / 7);
    const shutter = hash3(bay, 1, seed) < 0.35;
    for (let y = 2; y < 7; y++) {
      // Glass sits back in the shopfront; roller shutters (ribbed, half down on some) stay on the face.
      if (shutter && y >= 3 + Math.floor(hash3(bay, 2, seed) * 3)) m.set(x, y, z, y % 2 ? C.metal : C.metalDark);
      else { m.remove(x, y, z); m.set(x, y, z - 1, hash3(x, y, seed) < 0.08 ? 0x15191e : C.glass); }
    }
    if ((x - x0 - 2) % 7 === 0) for (let y = 1; y < 8; y++) m.set(x, y, z + 1, C.trim);
    m.set(x, 7, z + 1, tones[seed % 4]); m.set(x, 8, z + 1, tones[seed % 4]); // signboard band
    if (hash3(bay, 3, seed) < 0.5) for (let k = 0; k < 2; k++) m.set(x, 8, z + 2 + k, Math.floor(x / 2) % 2 ? C.red : C.trim); // striped awning: a flat sheet (snow lies flat on it)
  }
  m.box(x0 + 1, 6, z + 1, w - 2, 1, 1, C.trim);
}

function moss(m, x0, z0, w, d, H, seed) {
  eachFace(x0, z0, w, d, (x, z, u, [ox, oz]) => {
    const n = hash3(Math.floor(u / 3), 9, seed);
    if (n < 0.75) return;
    const top = 2 + Math.floor(hash3(u, 3, seed) * Math.min(H - 2, 18));
    for (let y = 1; y < top; y++) if (hash3(x, y, z + seed) < 0.55) m.set(x + ox, y, z + oz, y % 3 ? C.moss : C.mossDark);
  });
}

/** Roof: slab, a 2-high parapet with coping, AC units with grilles, a vent, a stair hut, maybe a water tank. */
function roof(m, x0, z0, w, d, H, seed) {
  const y = H + 1;
  m.box(x0, H, z0, w, 1, d, C.roof);
  m.walls(x0, y, z0, w, 2, d, C.trim);
  m.walls(x0, y + 2, z0, w, 1, d, C.creamDark);
  const units = 2 + Math.floor(hash3(seed, 2, 3) * 3);
  for (let i = 0; i < units; i++) {
    const ax = x0 + 3 + Math.floor(hash3(i, seed, 5) * (w - 9));
    const az = z0 + 3 + Math.floor(hash3(i, seed, 7) * (d - 8));
    m.box(ax, y, az, 4, 3, 3, C.metal);
    m.box(ax + 1, y + 1, az + 3, 2, 1, 1, C.metalDark);
    m.set(ax + 1, y + 3, az + 1, C.metalDark); m.set(ax + 2, y + 3, az + 1, C.metalDark);
  }
  // Stair hut with a door, at the back-left.
  m.box(x0 + 2, y, z0 + 2, 7, 7, 6, C.creamDark);
  m.box(x0 + 2, y + 7, z0 + 2, 7, 1, 6, C.roofDark);
  m.box(x0 + 4, y, z0 + 8, 3, 5, 1, C.board);
  m.box(x0 + w - 4, y, z0 + 2, 1, 6, 1, C.metalDark); // vent pipe
  if (hash3(seed, 5, 5) < 0.5) { // satellite dish
    const dx = x0 + 3 + Math.floor(hash3(seed, 6, 6) * (w - 8)); const dz = z0 + d - 5;
    m.box(dx + 1, y, dz, 1, 3, 1, C.metalDark); m.box(dx, y + 3, dz - 1, 3, 3, 1, C.trim); m.set(dx + 1, y + 4, dz + 1, C.metalDark);
  }
  for (let i = 0; i < 4; i++) { // debris and potted plants
    const px = x0 + 2 + Math.floor(hash3(i, seed, 11) * (w - 4)); const pz = z0 + 2 + Math.floor(hash3(i, seed, 13) * (d - 4));
    if (hash3(i, seed, 15) < 0.5) m.box(px, y, pz, 2, 1, 1, 0x7a5a3a); else { m.set(px, y, pz, C.brick); m.set(px, y + 1, pz, C.moss); }
  }
  if (hash3(seed, 4, 4) > 0.4 && w > 24) {
    // Water tank on legs.
    const tx = x0 + w - 12; const tz = z0 + d - 10;
    for (const [lx, lz] of [[0, 0], [5, 0], [0, 5], [5, 5]]) m.box(tx + lx, y, tz + lz, 1, 4, 1, C.metalDark);
    for (let yy = 0; yy < 6; yy++) for (let x = 0; x < 6; x++) for (let z = 0; z < 6; z++) {
      if ((x - 2.5) ** 2 + (z - 2.5) ** 2 <= 9) m.set(tx + x, y + 4 + yy, tz + z, yy % 3 === 0 ? C.rust : 0xb86b48);
    }
  }
}

/** Sidewalk pad the building stands on: cream tiles with grout lines, a kerb, a grass patch, light snow. */
export function pad(m, x0, z0, w, d, seed = 0) {
  for (let x = x0; x < x0 + w; x++) for (let z = z0; z < z0 + d; z++) {
    const edge = x === x0 || z === z0 || x === x0 + w - 1 || z === z0 + d - 1;
    // MAP-3: a snowed-over concrete apron like the city ground (bare slabs here and there).
    let c = hash3(Math.floor(x / 6), seed, Math.floor(z / 6)) < 0.25 && hash3(x, 7, z) > 0.3 ? ((x - x0) % 6 === 0 || (z - z0) % 6 === 0 ? C.tileLine : C.tile) : P.snow;
    if (edge) c = C.trim;
    m.set(x, 0, z, c);
  }
}

function graffiti(m, x, y, z, seed) {
  const cols = [C.neonPink, C.neonGreen, C.neonBlue, 0xf0f0f0];
  for (let i = 0; i < 9; i++) for (let j = 0; j < 3; j++) if (hash3(i, j, seed) < 0.55) m.set(x + i, y + j, z, cols[(i + seed) % 4]);
}

function dust(m) { return m.snowCap(P.snow, 1, 2); }
/** VOXEL-2: the finish pass (noise, grime, edge light), icicles under eaves, then the snow cap. */
function fin(m, seed = 0) { finish(m, seed); m.snowCap(P.snow, 1, 2); return addIcicles(m, { minY: 6, p: 0.1, seed }); }

// ---------------------------------------------------------------- the six places

export function policeStation() {
  const m = new VoxelModel(); const w = 40; const d = 26;
  pad(m, -4, -4, w + 8, d + 14, 1);
  block(m, { w, d, floors: 2, wall: C.grey, seed: 11 });
  m.clearBox(16, 1, d - 1, 8, 7, 1); m.box(16, 1, d - 1, 8, 7, 1, C.glass); // glass doors
  m.box(14, 8, d, 12, 1, 3, C.trim); // entrance canopy
  neon(m, 'POLICE', 20, 12, d, C.neonBlue, 3);
  m.box(6, 21, 10, 3, 2, 3, 0xff3b3b, true); m.box(9, 21, 10, 3, 2, 3, 0x3b7bff, true); // light bar on the roof
  // MAP-3 group 2: bars on the ground-floor windows, a flag on a pole, a radio mast, sandbags by the door,
  // a fenced holding yard with razor wire at the side, notices on the wall. (Cruisers and barriers stand at the kerb.)
  for (let x = 2; x < w - 2; x++) if ((x - 2) % 6 < 3) for (let y = 3; y < 8; y++) if (x % 2 === 0) m.set(x, y, d, C.metalDark);
  m.box(w - 4, 1, d + 4, 1, 22, 1, C.metal); m.box(w - 3, 18, d + 4, 6, 4, 1, 0x2b4a8c); m.box(w - 3, 20, d + 4, 6, 1, 1, C.trim);
  m.box(4, 22, 4, 1, 16, 1, C.metalDark); for (let y = 26; y < 38; y += 4) m.box(3, y, 4, 3, 1, 1, C.metalDark); m.set(4, 38, 4, C.neonRed, true);
  for (const x of [12, 26]) { for (let k = 0; k < 4; k++) m.box(x, 1 + k, d + 1, 3, 1, 3, (k % 2) ? 0xb8a47a : 0xa8946a); }
  for (let z = 2; z < d - 2; z++) { m.set(-3, 1 + (z % 2), z, C.metalDark); if (z % 3 === 0) m.box(-3, 1, z, 1, 6, 1, C.metal); m.set(-3, 6, z, 0x9aa0a6); }
  m.box(-3, 1, 1, 1, 6, 1, C.metal); m.box(-9, 1, 1, 7, 1, 1, C.metalDark);
  for (const x of [6, 30]) m.box(x, 4, d, 3, 4, 1, 0xe8e2d0); m.set(7, 5, d, 0x1c1f24); m.set(31, 6, d, 0xc0392b);
  return dust(m);
}

export function groceryStore() {
  const m = new VoxelModel(); const w = 42; const d = 24;
  pad(m, -4, -4, w + 8, d + 14, 2);
  block(m, { w, d, floors: 2, wall: C.cream, trim: C.creamDark, seed: 22, shop: true });
  // Entrance: sliding glass doors, lit inside, under a deep canopy on two posts.
  m.clearBox(17, 1, d - 2, 7, 6, 2); m.box(17, 1, d - 2, 7, 6, 1, C.glassLit, true); m.box(20, 1, d - 1, 1, 6, 1, C.metalDark);
  m.box(15, 8, d, 11, 1, 5, C.creamDark); m.box(15, 7, d + 4, 11, 1, 1, C.red);
  for (const x of [15, 25]) m.box(x, 1, d + 4, 1, 7, 1, C.metalDark);
  // Striped awnings over the shop bays.
  for (let x = 1; x < w - 1; x++) if (x < 15 || x > 25) for (let k = 0; k < 3; k++) m.set(x, 9, d + k, Math.floor(x / 3) % 2 ? C.red : C.trim); // flat striped awning
  neon(m, 'MART', 21, 12, d, C.neonGreen, 2);
  // Posters and price tags in the windows.
  for (const [x, c] of [[4, C.neonWarm], [9, C.red], [31, 0x2f5fa8], [36, C.neonWarm]]) m.box(x, 3, d, 2, 2, 1, c);
  // Outside: produce crates on a stand, a row of carts, a dumpster and pallets at the loading side.
  m.box(2, 1, d + 2, 9, 2, 3, P.woodDark);
  for (let x = 2; x < 11; x += 2) m.box(x, 3, d + 2, 2, 1, 3, [C.red, 0xe0a030, C.moss, 0xd8b03a][x % 4]);
  for (let k = 0; k < 4; k++) { m.box(29 + k * 2, 1, d + 4, 2, 1, 3, C.metal); m.box(29 + k * 2, 2, d + 4, 2, 2, 1, C.metal); m.set(29 + k * 2, 2, d + 6, C.metalDark); }
  m.box(w + 1, 1, 4, 4, 4, 7, 0x2f5a3f); m.box(w + 1, 5, 4, 4, 1, 7, 0x24452f); // dumpster
  for (let k = 0; k < 2; k++) m.box(w + 1, 1 + k, 13, 4, 1, 5, 0xb08a5a);
  m.box(w + 1, 3, 13, 4, 2, 5, 0x8a5a2b); // boxes on the pallets
  graffiti(m, 28, 2, d, 3);
  // A lit billboard on the roof.
  for (const x of [4, 15]) m.box(x, 22, 6, 1, 6, 1, C.metalDark);
  m.box(2, 28, 6, 16, 7, 1, C.trim);
  for (let x = 3; x < 17; x++) for (let y = 29; y < 34; y++) m.set(x, y, 7, (x + y) % 5 === 0 ? C.neonWarm : y > 31 ? 0x2f5fa8 : 0xc0392b, true);
  return dust(m);
}

export function school() {
  const m = new VoxelModel(); const w = 42; const d = 24;
  pad(m, -4, -4, w + 8, d + 16, 3);
  block(m, { w, d, floors: 3, wall: C.ochre, trim: C.trim, seed: 33, balconies: false });
  m.box(19, 1, d - 1, 8, 8, 1, C.ochreDark); m.box(21, 1, d - 1, 4, 7, 1, C.board);
  neon(m, 'SCHOOL', 23, 33, d - 2, C.neonPink, 1);
  // Yard fence with a gate, a hoop, and a buried bench.
  for (let x = -3; x <= w + 2; x++) m.set(x, x % 3 ? 2 : 1, d + 10, C.metalDark);
  for (let x = -3; x <= w + 2; x += 3) m.box(x, 1, d + 10, 1, 4, 1, C.metal);
  m.clearBox(20, 1, d + 10, 6, 4, 1);
  m.box(37, 1, d + 5, 1, 9, 1, C.metal); m.box(35, 10, d + 5, 4, 3, 1, C.paint);
  m.box(6, 1, d + 5, 6, 1, 2, C.board); m.box(6, 2, d + 6, 6, 2, 1, C.board);
  graffiti(m, 30, 2, d, 7);
  // MAP-3 group 2: a small bell tower with a clock over the entrance, a flag, entrance steps, a painted court
  // in the yard (lines under the snow), a slide and swings.
  const H = 3 * FH + 1;
  m.box(18, H, 8, 10, 10, 8, C.ochreDark); m.box(17, H + 10, 7, 12, 1, 10, C.roofDark); m.box(19, H + 11, 9, 8, 3, 6, C.roofDark);
  m.box(20, H + 4, 16, 6, 5, 1, 0xf0ede4); m.box(22, H + 6, 17, 2, 1, 1, 0x1c1f24); m.box(23, H + 5, 17, 1, 3, 1, 0x1c1f24);
  m.box(2, H, d - 3, 1, 12, 1, C.metal); m.box(3, H + 8, d - 3, 5, 3, 1, C.red); m.box(3, H + 9, d - 3, 5, 1, 1, P.white);
  for (let k = 0; k < 3; k++) m.box(18 - k, 1, d + k, 10 + 2 * k, 1, 1, C.trim);
  for (let x = 24; x < 40; x++) { m.set(x, 0, d + 3, C.paint); m.set(x, 0, d + 9, C.paint); } for (let z = d + 3; z <= d + 9; z++) { m.set(24, 0, z, C.paint); m.set(39, 0, z, C.paint); m.set(31, 0, z, C.paint); }
  m.box(2, 1, d + 2, 1, 6, 1, C.red); for (let k = 0; k < 6; k++) m.set(3 + k, 6 - k, d + 2, C.red); m.box(2, 1, d + 2, 2, 1, 2, C.metal); // slide
  for (const x of [12, 17]) m.box(x, 1, d + 3, 1, 7, 1, C.metalDark); m.box(12, 8, d + 3, 6, 1, 1, C.metalDark); m.box(14, 3, d + 3, 2, 1, 1, C.board);
  return dust(m);
}

export function hospital() {
  const m = new VoxelModel(); const w = 34; const d = 28;
  pad(m, -16, -4, w + 20, d + 14, 4);
  block(m, { w, d, floors: 5, wall: C.sage, trim: C.trim, seed: 44, balconies: true });
  // ER wing on the left, one floor.
  block(m, { x0: -12, z0: 8, w: 12, d: 20, floors: 1, wall: C.sageDark, seed: 45 });
  m.box(-11, 1, 27, 8, 6, 1, C.glass);
  // MAP-4: the red cross is a proper sign, off the window grid: a framed white panel on two posts at the front roof
  // edge, the cross lit inside it. (The ER neon is gone; a small cross plate sits on the ER canopy instead.)
  const roofY = 5 * FH + 1;
  for (const x of [12, 21]) m.box(x, roofY, d - 3, 1, 4, 1, C.metalDark);
  m.box(10, roofY + 4, d - 3, 14, 14, 1, 0x2a2d31);
  m.box(11, roofY + 5, d - 3, 12, 12, 1, 0xf2f2ee);
  m.box(15, roofY + 6, d - 4, 4, 10, 1, C.neonRed, true); m.box(12, roofY + 9, d - 4, 10, 4, 1, C.neonRed, true);
  // MAP-3 group 2: a canopy over the ER bay on posts, a rooftop helipad (H in a ring), triage tents with red
  // crosses, oxygen tanks and a generator by the ER, a ramp to the main door. (Ambulances park at the kerb.)
  m.box(-13, 8, 28, 14, 1, 7, C.trim); for (const x of [-13, 0]) m.box(x, 1, 34, 1, 7, 1, C.metalDark);
  m.box(-12, 9, 28, 12, 1, 1, C.red);
  m.box(-9, 9, 35, 5, 5, 1, 0xf2f2ee); m.box(-7, 10, 36, 1, 3, 1, C.neonRed, true); m.box(-8, 11, 36, 3, 1, 1, C.neonRed, true); // cross plate on the canopy
  const top = 5 * FH + 1;
  for (let x = 4; x < 30; x++) for (let z = 2; z < 22; z++) { const r = Math.hypot(x - 17, z - 11); if (r < 8.5) m.set(x, top, z, r > 7.3 ? 0xd8b03a : 0x4b525a); }
  for (const [x, z, ww, dd] of [[13, 7, 2, 9], [20, 7, 2, 9], [15, 11, 5, 1]]) m.box(x, top, z, ww, 1, dd, C.trim);
  for (const [x, z] of [[-14, 38], [-6, 38]]) { for (let y = 0; y < 5; y++) m.box(x - 3 + Math.floor(y / 2), 1 + y, z, 7 - 2 * Math.floor(y / 2), 1, 6, 0xe9e4d8); m.box(x, 3, z + 6, 1, 3, 1, C.red); m.box(x - 1, 4, z + 6, 3, 1, 1, C.red); }
  for (let k = 0; k < 4; k++) m.box(-15 + k * 2, 1, 22, 1, 5, 1, k % 2 ? 0x2f6b4a : 0xe8e8e2);
  m.box(-15, 1, 16, 4, 3, 4, 0xc9a227); m.box(-15, 4, 16, 4, 1, 4, 0x2a2d31);
  for (let k = 0; k < 6; k++) m.box(10 + k, 1, d + 1 + k, 1, 1, 1, C.trim); m.box(15, 1, d + 1, 1, 2, 6, C.metal); // ramp
  return dust(m);
}

export function library() {
  // MAP-4: a classical public library: symmetric hall, taller central pavilion with columns, pediment and a low dome,
  // two side wings with tall arched windows, a plinth and full-width steps. No neon: the name is a pale stone band.
  const m = new VoxelModel(); const w = 44; const d = 24; const cx = w / 2;
  pad(m, -4, -4, w + 8, d + 16, 5);
  const stone = C.cream; const dark = C.creamDark; const trim = C.trim;
  m.box(-1, 1, -1, w + 2, 3, d + 2, dark);                                   // plinth
  const wing = (x0, ww) => {
    m.walls(x0, 4, 0, ww, 18, d, stone); m.box(x0 + 1, 21, 1, ww - 2, 1, d - 2, C.roofDark);
    m.box(x0 - 1, 22, -1, ww + 2, 2, d + 2, trim); m.box(x0, 24, 0, ww, 2, d, dark);          // cornice + parapet
    for (const ux of [x0, x0 + ww - 1]) for (let y = 4; y < 22; y++) if (y % 3) m.set(ux, y, d, trim); // quoins
    for (let k = 0; k < Math.floor((ww - 4) / 5); k++) {
      const x = x0 + 3 + k * 5;
      // Upper floor: tall arched window; ground floor: a small square one.
      for (let y = 12; y < 19; y++) { m.remove(x, y, d - 1); m.remove(x + 1, y, d - 1); m.set(x, y, d - 2, C.glass); m.set(x + 1, y, d - 2, hash3(x, y, 5) < 0.2 ? C.glassLit : C.glass, hash3(x, y, 5) < 0.2); }
      m.set(x, 19, d - 1, trim); m.set(x + 1, 19, d - 1, trim); m.set(x - 1, 18, d - 1, trim); m.set(x + 2, 18, d - 1, trim);
      m.box(x - 1, 11, d, 4, 1, 1, trim);                                                    // sill
      for (let y = 6; y < 9; y++) { m.remove(x, y, d - 1); m.remove(x + 1, y, d - 1); m.set(x, y, d - 2, C.glass); m.set(x + 1, y, d - 2, C.glass); }
      m.box(x - 1, 5, d, 4, 1, 1, trim);
    }
    for (let x = x0 + 2; x < x0 + ww - 2; x += 4) m.box(x, 26, d - 1, 2, 2, 2, trim);          // urns on the parapet
  };
  wing(0, 15); wing(w - 15, 15);
  // Central pavilion, one storey taller, pushed forward.
  const px0 = 15; const pw = w - 30;
  m.walls(px0, 4, -2, pw, 26, d + 4, stone); m.box(px0 + 1, 29, -1, pw - 2, 1, d + 2, C.roofDark);
  m.box(px0 - 1, 30, -3, pw + 2, 2, d + 6, trim);
  // Low dome with a lantern.
  for (let y = 0; y < 6; y++) for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) if (x * x + z * z + (y * 1.6) ** 2 <= 40 && x * x + z * z + (y * 1.6) ** 2 > 22) m.set(cx + x, 32 + y, d / 2 + z, y > 3 ? 0x7d9a8c : 0x6c8a7c);
  m.box(cx - 1, 38, d / 2 - 1, 3, 3, 3, trim); m.set(cx, 41, d / 2, C.metalDark);
  // Portico: columns with bases and capitals, entablature with the name band, pediment with a round window.
  const fz = d + 2;
  for (let k = 0; k < 4; k++) {
    const x = px0 + 1 + k * Math.floor((pw - 3) / 3);
    m.box(x, 4, fz, 2, 1, 2, trim); m.box(x, 5, fz, 2, 15, 2, k === 2 ? 0xd2cbb6 : 0xece6d6); m.box(x - 1, 20, fz - 1, 4, 1, 4, trim);
    if (k === 2) m.set(x + 1, 12, fz + 1, 0x8a8370); // a crack
  }
  m.box(px0 - 1, 21, fz - 1, pw + 2, 3, 4, trim);
  for (let x = px0 + 2; x < px0 + pw - 2; x += 2) m.set(x, 22, fz + 3, 0xa8a08a);           // carved name band (unlit)
  for (let k = 0; k < 6; k++) m.box(px0 - 1 + k * 2, 24 + k, fz - 1, pw + 2 - k * 4, 1, 3, k === 5 ? dark : trim);
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) m.set(cx - 1 + dx, 26 + dy, fz + 2, C.glass);
  // Double wooden door with a fanlight.
  m.box(cx - 3, 4, d + 1, 6, 9, 1, 0x5a3a24); m.box(cx, 4, d + 2, 1, 9, 1, 0x3a2416); m.box(cx - 2, 13, d + 1, 4, 2, 1, C.glassLit, true);
  // Full-width steps, two lamp posts on pedestals, a book-return box, a noticeboard; one boarded window, a little rubble.
  for (let k = 0; k < 3; k++) m.box(px0 - 3 - k, 1 + 2 - k, fz + 2 + k * 2, pw + 6 + 2 * k, 1, 2, k % 2 ? dark : trim);
  for (const x of [px0 - 4, px0 + pw + 3]) { m.box(x, 1, fz + 6, 2, 3, 2, trim); m.box(x, 4, fz + 6, 1, 8, 1, C.metalDark); m.box(x - 1, 12, fz + 5, 3, 2, 3, C.glassLit, true); }
  m.box(w - 4, 1, d + 4, 3, 4, 2, 0x2b4a8c); m.box(w - 4, 4, d + 5, 3, 1, 1, 0x1c1f24);
  m.box(3, 4, d + 1, 6, 4, 1, P.woodDark); m.box(4, 5, d + 2, 4, 2, 1, 0xe8e2d0);
  m.box(4, 12, d - 1, 2, 7, 1, C.board);
  for (let i = 0; i < 10; i++) m.box(w + 1 + Math.floor(hash3(i, 1, 9) * 3), 1, 4 + Math.floor(hash3(i, 2, 9) * 12), 2, 1 + Math.floor(hash3(i, 3, 9) * 2), 2, i % 2 ? stone : dark);
  return dust(m);
}

export function gasStation() {
  const m = new VoxelModel(); const w = 44; const d = 30;
  // Forecourt: concrete slabs (snow on most), white bay lines, a kerbed island under the canopy.
  for (let x = -2; x < w + 2; x++) for (let z = -2; z < d + 4; z++) {
    const bare = hash3(Math.floor(x / 5), 61, Math.floor(z / 5)) < 0.35;
    m.set(x, 0, z, bare ? (x % 5 === 0 || z % 5 === 0 ? 0x8d8a80 : 0xb9b6aa) : P.snow);
  }
  // Kiosk at the back: big shop window with a lit fridge wall, an OPEN sign, an ice chest and a tyre stack.
  block(m, { x0: 1, z0: 0, w: 18, d: 12, floors: 1, wall: C.ochre, trim: C.trim, seed: 66, shop: true });
  m.box(3, 2, 10, 4, 4, 1, 0xbfe6ff, true);
  neon(m, 'OPEN', 10, 8, 12, C.neonRed, 3);
  m.box(1, 1, 13, 3, 3, 2, 0xe8eef2); m.box(1, 3, 13, 3, 1, 2, 0x2f5fa8);
  for (let k = 0; k < 4; k++) m.box(16, 1 + k, 13, 3, 1, 3, 0x1c1f24);
  // Canopy on four posts: red fascia with a white stripe, lit panels underneath; two pump islands with hoses.
  for (const [x, z] of [[24, 6], [41, 6], [24, 24], [41, 24]]) m.box(x, 1, z, 2, 12, 2, C.trim);
  m.box(22, 13, 4, 22, 2, 23, C.trim);
  for (const [x0, z0, ww, dd] of [[22, 4, 22, 1], [22, 26, 22, 1], [22, 4, 1, 23], [43, 4, 1, 23]]) { m.box(x0, 12, z0, ww, 2, dd, C.red); m.box(x0, 14, z0, ww, 1, dd, C.trim); }
  for (const [x, z] of [[27, 9], [37, 9], [27, 20], [37, 20]]) m.box(x, 12, z, 3, 1, 3, 0xfff6d8, true);
  for (const x of [29, 36]) {
    m.box(x - 2, 1, 12, 6, 1, 7, C.trim); m.box(x - 2, 1, 12, 6, 1, 1, 0xd8b03a); // island with a yellow kerb
    m.box(x, 2, 14, 2, 6, 3, C.red); m.box(x, 6, 17, 2, 1, 1, C.glassLit, true); m.box(x, 4, 17, 2, 1, 1, 0x1c1f24);
    m.set(x + 2, 4, 15, C.metalDark); m.set(x + 3, 3, 15, C.metalDark); m.set(x + 3, 2, 16, C.metalDark); // hose
    m.box(x - 2, 2, 13, 1, 2, 1, 0x1c1f24); // bin
  }
  // Tall price sign: the brand board, three price rows (one dead), a flickering letter.
  m.box(8, 1, d, 2, 22, 2, C.metalDark);
  neon(m, 'GAS', 9, 23, d, C.neonRed, 1, 2);
  for (let r = 0; r < 3; r++) { m.box(5, 13 + r * 3, d + 1, 8, 2, 1, 0x1c1f24); for (let k = 0; k < 3; k++) m.set(9 + k, 13 + r * 3, d + 2, 0xffd27a, r !== 1); }
  // Air pump, oil drums, an abandoned taxi at the pump and a snow-buried car by the kiosk.
  m.box(20, 1, 2, 2, 4, 2, C.red); m.set(21, 3, 4, C.metalDark);
  for (const [x, z, c] of [[1, 20, 0x2f5fa8], [3, 21, C.red], [1, 23, 0x3f7a4a]]) m.box(x, 1, z, 2, 3, 2, c);
  m.box(26, 1, d - 2, 10, 3, 5, 0xd8b03a); m.box(28, 4, d - 2, 5, 2, 5, 0xd8b03a); m.box(28, 4, d + 2, 5, 2, 1, C.glass); m.box(30, 6, d, 2, 1, 1, 0x1c1f24);
  m.box(4, 1, 15, 9, 3, 5, 0x5a6878); m.box(6, 4, 15, 5, 2, 5, P.snow);
  return dust(m);
}

// ---------------------------------------------------------------- the colony and the filler blocks

/** The colony: a square wall of stacked shipping containers, barricaded gates, the bonfire, huts, tents and a watch post. */
// ---------------------------------------------------------------- MAP-3 C: containers and the colony

/** Muted container colours: rust red, navy, olive, teal, faded orange. */
export const CONTAINER_TONES = [0x8e3a2c, 0x2b3a5c, 0x5d6b3a, 0x2f6b6b, 0xb8682f];
const dim = (c, k) => { const r = (c >> 16) & 255; const g = (c >> 8) & 255; const b = c & 255; return (Math.round(r * k) << 16) | (Math.round(g * k) << 8) | Math.round(b * k); };

/**
 * A detailed shipping container (authored grid): corrugated sides (light/dark ribs), dark corner castings, top and
 * bottom rails, a door end with 4 locking bars and handles, a faded stencil band, rust streaks, roof dents.
 * Runs `len` along x (alongX) or z from (x0, y0, z0); 7 wide, 8 high. skew: the far half sits 1 voxel over.
 */
export function containerBox(m, x0, y0, z0, len, alongX, color, seed = 0, { skew = 0, door = 1 } = {}) {
  const dark = dim(color, 0.72); const rail = dim(color, 0.55); const rust = 0x7a3b22; const stencil = 0xd9d2bf;
  for (let t = 0; t < len; t++) {
    const sk = skew && t >= len / 2 ? skew : 0;
    const streak = hash3(t, seed, 5) < 0.12;
    const dent = hash3(t, seed, 9) < 0.1;
    for (let k = 0; k < 7; k++) for (let y = 0; y < 8; y++) {
      const end = t === 0 || t === len - 1; const side = k === 0 || k === 6; const cap = y === 0 || y === 7;
      if (dent && y === 7 && !side && !end) continue; // a dent in the roof
      let c;
      if (end && side && cap) c = 0x1c1f24;                              // corner castings
      else if (cap) c = rail;                                            // top / bottom rails
      else if (end) {
        const doorEnd = (t === len - 1) === (door > 0);
        c = doorEnd && (k === 2 || k === 4) ? (y === 3 ? 0x9aa0a6 : 0x2a2d31) : doorEnd && k === 3 ? dark : dim(color, 0.85);
      } else if (side) {
        c = t % 2 ? color : dark;                                        // corrugation
        if (y === 5 && t > 2 && t < len - 3 && hash3(t, seed + k, 7) < 0.55) c = stencil; // faded stencil band
        else if (streak && y >= 2 && y <= 5 && t % 2) c = rust;          // rust streak under a seam
      } else c = y === 6 ? color : dark;
      const x = alongX ? x0 + t : x0 + k + sk; const z = alongX ? z0 + k + sk : z0 + t;
      m.set(x, y0 + y, z, c);
    }
  }
  return m;
}

/** Starter container houses (voxel centres, inside the wall; front faces +z / −z towards the fire's side). */
export const COLONY_HOUSES = [[18, 18], [-18, -18]];
/** Yard dressing: [kind, x, z, half-width x, half-depth z] in colony voxels (wall radius 50). */
export const COLONY_PROPS = [
  ['logs', 13, -13, 3, 2], ['logs', 17, -10, 2, 3], ['woodpile', 21, -21, 4, 2], ['generator', 24, -13, 2, 2], ['barrel-fire', 17, -24, 1, 1],
  ['tank', 34, -34, 4, 4], ['crates', 40, -29, 2, 3], ['snowpile', 38, -40, 4, 2],
  ['logs', -13, 13, 3, 2], ['logs', -9, 17, 2, 3], ['tarp', -20, 20, 4, 3], ['sled', -10, 23, 1, 3], ['line', -24, 17, 1, 7],
  ['drums', -34, 34, 3, 3], ['pallets', -40, 29, 2, 3], ['barrel-fire', -29, 40, 1, 1], ['snowpile', -40, 40, 3, 3],
];

function colonyProp(m, kind, x, z) {
  const W = P.wood; const WD = P.woodDark;
  switch (kind) {
    case 'logs': m.box(x - 3, 1, z - 1, 6, 2, 2, 0x6b4a2e); m.box(x - 3, 1, z - 1, 1, 2, 2, 0xb08a5a); break;
    case 'woodpile': for (let y = 0; y < 3; y++) m.box(x - 4 + y, 1 + y, z - 2, 8 - 2 * y, 1, 4, y % 2 ? 0x7a5636 : 0x5e4129); m.box(x - 4, 1, z - 2, 1, 3, 4, 0xb08a5a); break;
    case 'generator': m.box(x - 2, 1, z - 2, 4, 3, 4, 0xc9a227); m.box(x - 2, 4, z - 2, 4, 1, 4, 0x2a2d31); m.set(x + 1, 3, z + 2, C.neonGreen, true); m.box(x - 1, 4, z, 1, 2, 1, 0x2a2d31); break;
    case 'barrel-fire': m.box(x - 1, 1, z - 1, 2, 3, 2, 0x4b3a2e); m.box(x - 1, 4, z - 1, 2, 1, 2, P.fire, true); break;
    case 'tank': for (let y = 1; y < 9; y++) for (let a = -4; a < 4; a++) for (let b = -4; b < 4; b++) if (a * a + b * b < (y > 7 ? 9 : 16)) m.set(x + a, y, z + b, y % 3 === 0 ? 0x6c7580 : 0x8e979f); for (const [a, b] of [[-3, -3], [2, 2]]) m.box(x + a, 0, z + b, 1, 2, 1, 0x2a2d31); break;
    case 'crates': m.box(x - 2, 1, z - 3, 4, 3, 3, 0x8a5a2b); m.box(x - 2, 1, z, 4, 3, 3, 0x9a6a38); m.box(x - 1, 4, z - 2, 3, 3, 3, 0x7a5a3a); break;
    case 'snowpile': for (let y = 1; y < 4; y++) m.box(x - 4 + y, y, z - 2 + (y > 2 ? 1 : 0), 8 - 2 * y, 1, 4 - (y > 2 ? 2 : 0), P.snow); break;
    case 'tarp': for (const [a, b] of [[-4, -3], [3, -3]]) m.box(x + a, 1, z + b, 1, 6, 1, WD); for (let k = 0; k < 6; k++) m.box(x - 4, 6 - k, z - 3 + k, 8, 1, 1, 0x3f6f8f); m.box(x - 2, 1, z - 1, 3, 2, 2, 0x8a5a2b); break;
    case 'sled': m.box(x - 1, 1, z - 3, 2, 1, 6, W); m.box(x - 1, 1, z + 3, 2, 2, 1, WD); break;
    case 'line': m.box(x, 1, z - 7, 1, 8, 1, WD); m.box(x, 1, z + 7, 1, 8, 1, WD); for (let k = -6; k <= 6; k++) { m.set(x, 8 - (Math.abs(k) < 4 ? 1 : 0), z + k, 0x2a2d31); if (k % 3 === 0) m.box(x, 5, z + k, 1, 2, 2, [0xc0392b, 0xe6e2d6, 0x3f6f8f][(k + 9) % 3]); } break;
    case 'drums': for (const [a, b, c] of [[-2, -2, 0x2f5fa8], [1, -2, 0xc0392b], [-2, 1, 0x3f7a4a], [1, 1, 0x2f5fa8]]) m.box(x + a, 1, z + b, 2, 3, 2, c); break;
    case 'pallets': for (let y = 0; y < 3; y++) m.box(x - 2, 1 + y, z - 3, 4, 1, 6, y % 2 ? 0xb08a5a : 0x9a7a4e); break;
    default:
  }
}

/** A container house: door cut in the side, a lit window with a shutter, stovepipe, porch with steps, a shovel. */
function containerHouse(m, cx, cz, front, seed) {
  const x0 = cx - 6; const z0 = cz - 3;
  containerBox(m, x0, 1, z0, 13, true, CONTAINER_TONES[seed % 5], seed, { skew: seed % 2 });
  const fz = front > 0 ? z0 + 6 : z0; const out = front > 0 ? fz + 1 : fz - 1;
  m.box(cx - 3, 2, fz, 2, 5, 1, P.woodDark);                       // door
  m.box(cx + 2, 4, fz, 2, 2, 1, C.glassLit, true); m.box(cx + 4, 4, fz, 1, 2, 1, P.wood); // window + shutter
  m.box(cx + 3, 9, cz, 1, 4, 1, P.rock);                           // stovepipe
  m.box(cx - 4, 1, Math.min(out, out + front * 2), 5, 1, 3, P.wood); // porch
  m.box(cx - 4, 0, out + front * 3, 5, 1, 1, P.woodDark);          // step
  m.box(cx, 1, out + front * 2, 1, 4, 1, 0x7a5636); m.set(cx, 1, out + front * 2 + front, 0x8e979f); // shovel
}
/** Stovepipe tops of the starter houses (colony voxels: x, y, z). */
export const HOUSE_CHIMNEYS = COLONY_HOUSES.map(([x, z]) => [x + 3, 13, z]);

/**
 * The colony's base (MAP-3): a 2-layer container wall stacked a little untidily (lengths, in/out pushes, skews and
 * top-layer offsets seeded per container), 4 straight gates, the packed-snow yard and fire, two starter container
 * houses and the yard dressing. wall = the "wall" upgrade: 1 catwalk + sandbag parapet, 2 spiked barricades and
 * floodlights at the gates, 3 a tower on every corner.
 */
export function colony(R = 30, wall = 0) {
  const m = new VoxelModel();
  const gate = 6;
  // side: [axis along which the wall runs, sign of the wall's side]
  const sides = [['x', -1], ['x', 1], ['z', -1], ['z', 1]];
  sides.forEach(([axis, sg], si) => {
    const alongX = axis === 'x';
    const base = sg > 0 ? R - 6 : -R;                 // inner coordinate of the 7-deep wall
    const lo = alongX ? -R : -R + 7; const hi = alongX ? R : R - 7; // x-walls run through the corners, z-walls butt into them
    for (let layer = 0; layer < 2; layer++) {
      let t = lo + (layer ? 1 + Math.floor(hash3(si, 3, 1) * 3) : 0);
      let i = 0; let prevPush = 0;
      const gapAt = layer ? 1 + Math.floor(hash3(si, 5, 2) * 3) : -1; // one gap per side in the top layer
      while (t < hi) {
        let len = 10 + Math.floor(hash3(si * 31 + i, layer, 7) * 7);
        // Keep the gate opening straight and clear.
        if (t < -gate - 1 && t + len > -gate - 1) len = -gate - 1 - t;
        if (t >= -gate - 1 && t <= gate + 1) { t = gate + 2; continue; }
        len = Math.min(len, hi - t);
        if (len < 4) { t += len; continue; }
        const push = Math.round(hash3(si, i, 11 + layer) * 3) - 2;      // 2 in … 1 out
        const skew = hash3(i, si, 13 + layer) < 0.3 ? -sg * (push > 0 ? 1 : hash3(i, si, 17) < 0.5 ? 1 : -1) : 0;
        if (i !== gapAt) {
          const off = base + push * sg;
          const c = CONTAINER_TONES[Math.floor(hash3(si * 7 + i, layer, 19) * 5)];
          if (alongX) containerBox(m, t, 1 + layer * 8, off, len, true, c, si * 50 + i + layer * 13, { skew, door: hash3(i, si, 23) < 0.5 ? 1 : -1 });
          else containerBox(m, off, 1 + layer * 8, t, len, false, c, si * 50 + i + layer * 13, { skew, door: hash3(i, si, 23) < 0.5 ? 1 : -1 });
          // Where pushes step by 2+, plug the joint with sandbags (the wall stays closed).
          if (!layer && i && Math.abs(push - prevPush) >= 2) {
            if (alongX) m.box(t - 1, 1, base, 2, 4, 7, 0xb8a47a); else m.box(base, 1, t - 1, 7, 4, 2, 0xb8a47a);
          }
          prevPush = push;
        }
        t += len; i++;
      }
    }
    // Gate posts with torches; wall level 2: floodlights and spiked barricades outside.
    for (const k of [-gate, gate]) {
      const x = alongX ? k : sg * (R - 3); const z = alongX ? sg * (R - 3) : k;
      m.box(x, 1, z, 1, 12, 1, P.woodDark); m.set(x, 13, z, P.fire, true);
      if (wall >= 2) { m.box(x, 13, z, 1, 6, 1, 0x2a2d31); m.box(x - 1, 19, z - 1, 3, 1, 3, 0x2a2d31); m.set(x, 18, z, 0xfff6d8, true); }
    }
    for (let k = -gate + 1; k < gate; k++) {
      const x = alongX ? k : sg * (R - 3); const z = alongX ? sg * (R - 3) : k;
      if ((k + gate) % 3 !== 0) { m.set(x, 3, z, P.wood); m.set(x, 6, z, P.wood); }
    }
    if (wall >= 2) for (const k of [-4, 4]) { // czech hedgehogs outside the gate
      const x = alongX ? k : sg * (R + 1); const z = alongX ? sg * (R + 1) : k;
      for (let d = -1; d <= 1; d++) { m.set(x + d, 1 + Math.abs(d), z, 0x3a3f46); m.set(x, 1 + Math.abs(d), z + d, 0x3a3f46); }
    }
    // Wall level 1+: sandbag parapet on the outer top edge and a plank catwalk inside it.
    if (wall >= 1) {
      for (let t = lo; t < hi; t++) {
        if (Math.abs(t) <= gate + 1) continue;
        const outer = sg > 0 ? R : -R; const inner = sg > 0 ? R - 6 : -R + 6;
        if (alongX) { m.set(t, 17, outer, t % 2 ? 0xb8a47a : 0xa8946a); if (t % 2) m.set(t, 18, outer, 0xb8a47a); m.set(t, 17, inner, P.wood); }
        else { m.set(outer, 17, t, t % 2 ? 0xb8a47a : 0xa8946a); if (t % 2) m.set(outer, 18, t, 0xb8a47a); m.set(inner, 17, t, P.wood); }
      }
    }
  });
  // Level 3: a watch tower on every corner of the wall, a fire basket on top.
  if (wall >= 3) {
    for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const x0 = sx > 0 ? R - 7 : -R; const z0 = sz > 0 ? R - 7 : -R;
      for (const [dx, dz] of [[0, 0], [6, 0], [0, 6], [6, 6]]) m.box(x0 + dx, 1, z0 + dz, 1, 28, 1, P.woodDark);
      m.box(x0 - 1, 29, z0 - 1, 9, 1, 9, P.wood); m.walls(x0 - 1, 30, z0 - 1, 9, 2, 9, P.woodLight);
      m.box(x0 + 3, 30, z0 + 3, 1, 1, 1, P.fire, true);
    }
  }
  // Packed-snow yard with a melted ring around the fire; trodden paths to the gates.
  for (let x = -R + 7; x < R - 6; x++) for (let z = -R + 7; z < R - 6; z++) {
    const r2 = x * x + z * z;
    const path = Math.min(Math.abs(x), Math.abs(z)) < 3;
    m.set(x, 0, z, r2 <= 20 ? P.dirt : r2 <= 49 ? 0x9aa6b6 : path ? 0xb9c3cf : hash3(x, 1, z) < 0.1 ? P.snowShade : P.snow);
  }
  for (let a = 0; a < 360; a += 24) { const r = (a * Math.PI) / 180; m.box(Math.round(Math.cos(r) * 4), 1, Math.round(Math.sin(r) * 4), 1, 1, 1, P.rockLight); }
  m.box(-2, 1, 0, 5, 1, 1, P.woodDark); m.box(0, 1, -2, 1, 1, 5, P.woodDark);
  // String lights from each gate towards the fire (on poles beside the path).
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const pole = (r, side) => { const x = dx * r + dz * side; const z = dz * r + dx * side; m.box(x, 1, z, 1, 10, 1, P.woodDark); };
    pole(R - 9, 4); pole(19, 4);
    for (let r = 19; r <= R - 9; r++) { const sag = Math.round(Math.sin(((r - 19) / (R - 28)) * Math.PI) * 2); const x = dx * r + dz * 4; const z = dz * r + dx * 4; m.set(x, 10 - sag, z, r % 3 ? 0x2a2d31 : 0xffd27a, r % 3 === 0); }
  }
  COLONY_HOUSES.forEach(([x, z], i) => containerHouse(m, x, z, z > 0 ? -1 : 1, i + 2));
  for (const [kind, x, z] of COLONY_PROPS) colonyProp(m, kind, x, z);
  return m.snowCap(P.snow, 1, 2);
}

/** What each colony slot can show. */
export const SLOT_KINDS = ['dorm', 'greenhouse', 'workshop', 'infirmary', 'radio', 'towers', 'garage', 'spare', 'reserved'];

/**
 * MAP-3: one colony slot (16×16 voxels, front = +z). level 0 = a staked-out lot with a sign; 1–3 = a growing
 * building; the garage shows the snow crawler stage by stage (level 0..4).
 */
export function colonySlot(kind, level = 0) {
  const m = new VoxelModel();
  const L = level;
  const pad = L ? 0x9aa3ad : P.snowShade;
  m.box(-8, 0, -8, 16, 1, 16, (x, _y, z) => (L && (x + z) % 5 === 0 ? 0x8d949e : pad));
  const stakes = () => {
    for (const [x, z] of [[-7, -7], [6, -7], [-7, 6], [6, 6]]) m.box(x, 1, z, 1, 3, 1, P.woodDark);
    for (let t = -6; t < 6; t++) { m.set(t, 3, -7, 0xd9cfa8); m.set(t, 3, 6, 0xd9cfa8); m.set(-7, 3, t, 0xd9cfa8); m.set(6, 3, t, 0xd9cfa8); }
    const sign = { dorm: 0x7a5b4a, greenhouse: C.moss, workshop: C.ochre, infirmary: C.red, radio: C.neonBlue, towers: P.wood, garage: 0xd9822b }[kind] ?? 0x8d949e;
    m.box(-1, 1, 7, 1, 4, 1, P.woodDark); m.box(-3, 4, 7, 5, 3, 1, sign);
  };
  if (!L || kind === 'spare' || kind === 'reserved') return new VoxelModel().box(-8, 0, -8, 16, 1, 16, P.snow); // an empty lot: plain snow
  const window = (x, y, z, lit) => m.box(x, y, z, 2, 2, 1, lit ? C.glassLit : C.glass, lit);
  switch (kind) {
    case 'dorm': { // container bunkhouses: one, two side by side, then one stacked on top
      const box = (x0, y0, z0, c, lit) => { containerBox(m, x0, y0, z0, 13, true, c, x0 * 7 + y0 + z0); window(x0 + 3, y0 + 3, z0 + 6, lit); window(x0 + 8, y0 + 3, z0 + 6, !lit); m.box(x0 + 11, y0 + 8, z0 + 2, 1, 3, 1, C.metalDark); };
      box(-6, 1, 0, CONTAINER_TONES[1], true);
      if (L >= 2) box(-6, 1, -7, CONTAINER_TONES[2], false);
      if (L >= 3) box(-5, 9, -4, CONTAINER_TONES[4], true);
      m.box(-1, 1, 6, 3, 5, 1, P.woodDark); // door
      break;
    }
    case 'greenhouse': { // glass houses that grow longer, green glow inside
      const len = 6 + 3 * L;
      for (let x = -len / 2 | 0; x < (len / 2 | 0); x++) for (let z = -4; z <= 4; z++) {
        const h = 5 - Math.floor(Math.abs(z) / 2);
        for (let y = 1; y <= h; y++) {
          const edge = Math.abs(z) === 4 || y === h || x === (-len / 2 | 0) || x === (len / 2 | 0) - 1;
          if (edge) m.set(x, y, z, x % 3 === 0 || y === h ? 0xdfe6ea : 0x9fd6c4);
          else if (y === 1) m.set(x, y, z, (x + z) % 2 ? 0x3e7d3a : 0x5aa04a, (x + z) % 4 === 0);
        }
      }
      break;
    }
    case 'workshop': { // timber shed, open front with a workbench; a crane arm, then a chimney
      m.box(-6, 1, -5, 12, 7, 1, P.wood); m.box(-6, 1, -5, 1, 7, 10, P.wood); m.box(5, 1, -5, 1, 7, 10, P.wood);
      m.box(-7, 8, -6, 14, 1, 12, C.roofDark);
      m.box(-4, 1, -3, 7, 2, 2, P.woodDark); m.box(-3, 3, -3, 2, 1, 1, C.metal); // bench + vice
      if (L >= 2) { m.box(6, 1, 4, 1, 12, 1, C.metalDark); m.box(1, 12, 4, 6, 1, 1, C.ochre); m.box(1, 9, 4, 1, 3, 1, C.metalDark); }
      if (L >= 3) { m.box(-5, 9, -4, 2, 6, 2, P.rock); m.box(-7, 1, 2, 3, 4, 3, 0x8a5a2b); window(-1, 5, -4, true); }
      break;
    }
    case 'infirmary': { // a tent, then a white container, then two storeys; red cross on the front
      if (L === 1) {
        for (let y = 0; y < 6; y++) m.box(-5 + y, 1 + y, -4, 11 - 2 * y, 1, 9, 0xe9e4d8);
      } else {
        m.box(-6, 1, -4, 12, 7, 8, 0xe9e4d8); m.box(-6, 8, -4, 12, 1, 8, C.greyDark);
        if (L >= 3) { m.box(-5, 9, -3, 10, 6, 7, 0xe9e4d8); m.box(-5, 15, -3, 10, 1, 7, C.greyDark); window(-3, 11, 4, true); window(2, 11, 4, false); }
        window(-4, 4, 4, true);
      }
      const cy = L === 1 ? 3 : 4;
      m.box(1, cy, 5, 3, 1, 1, C.red); m.box(2, cy - 1, 5, 1, 3, 1, C.red);
      break;
    }
    case 'radio': { // a lattice mast that grows, a shack, then a dish; red light on top
      const h = 10 + 8 * L;
      for (let y = 1; y <= h; y++) { m.set(2, y, -2, C.metalDark); m.set(4, y, -2, C.metalDark); if (y % 3 === 0) { m.set(3, y, -2, C.metal); } }
      m.set(3, h + 1, -2, C.neonRed, true);
      if (L >= 2) { m.box(-6, 1, 0, 7, 6, 6, 0x5b6f8a); m.box(-6, 7, 0, 7, 1, 6, C.roofDark); window(-4, 3, 6, true); }
      if (L >= 3) { m.box(5, h - 6, -4, 1, 4, 4, C.trim); m.box(6, h - 5, -3, 1, 2, 2, C.metal); }
      for (const [x, z] of [[-6, -7], [7, -7], [3, 6]]) m.set(x, 1, z, C.metalDark); // guy-wire anchors
      break;
    }
    case 'towers': { // a watch tower that grows with the wall
      const h = 8 + 5 * L;
      for (const [dx, dz] of [[-3, -3], [2, -3], [-3, 2], [2, 2]]) m.box(dx, 1, dz, 1, h, 1, P.woodDark);
      for (let y = 4; y < h; y += 4) m.box(-3, y, -3, 6, 1, 1, P.wood);
      m.box(-4, h + 1, -4, 8, 1, 8, P.wood); m.walls(-4, h + 2, -4, 8, 2, 8, P.woodLight);
      m.box(-4, h + 5, -4, 8, 1, 8, C.roofDark); m.set(0, h + 2, 0, P.fire, true);
      break;
    }
    case 'garage': { // an open shed with the snow crawler: frame, engine, cabin, then fuelled with its lights on
      for (const [x, z] of [[-8, -8], [7, -8], [-8, 7], [7, 7]]) m.box(x, 1, z, 1, 10, 1, P.woodDark);
      m.box(-8, 11, -8, 16, 1, 16, C.roofDark);
      m.box(-6, 1, -4, 12, 2, 8, 0x2a2f36); // tracks
      for (let x = -6; x < 6; x += 2) { m.set(x, 1, -4, 0x15171a); m.set(x, 1, 3, 0x15171a); }
      m.box(-5, 3, -3, 10, 1, 6, C.metalDark); // frame
      if (L >= 2) { m.box(-5, 4, -2, 4, 3, 4, 0x4b525a); m.box(-4, 7, -1, 1, 2, 1, C.metalDark); }
      if (L >= 3) { m.box(-1, 4, -3, 6, 5, 6, 0xd9822b); m.box(0, 6, 3, 4, 2, 1, C.glass); m.box(-1, 9, -3, 6, 1, 6, 0xb86a1f); }
      if (L >= 4) { m.box(5, 5, -2, 1, 1, 1, 0xfff1c2, true); m.box(5, 5, 1, 1, 1, 1, 0xfff1c2, true); m.box(-7, 1, 5, 2, 3, 1, C.red); m.box(-4, 1, 5, 2, 3, 1, C.red); }
      break;
    }
    default: stakes();
  }
  return m.snowCap(P.snow, 1, 1);
}

// ---------------------------------------------------------------- MAP-1: places found as the city grows

export function warehouse() {
  const m = new VoxelModel(); const w = 46; const d = 28;
  pad(m, -4, -4, w + 8, d + 14, 31);
  m.walls(0, 1, 0, w, 14, d, C.sageDark);
  m.box(1, 14, 1, w - 2, 1, d - 2, C.roofDark);
  for (let x = 0; x < w; x++) for (let k = 0; k < 4; k++) m.set(x, 15 + k, Math.floor(d / 2) - 8 + k * 4, k % 2 ? C.roof : C.roofDark); // ribbed roof
  m.box(0, 15, 0, w, 1, d, C.roof);
  for (let x = 0; x < w; x += 2) m.box(x, 1, d - 1, 1, 13, 1, C.sageDark); // corrugated ribs
  for (const bx of [4, 18, 32]) { // roller doors, one jammed half open
    m.clearBox(bx, 1, d - 1, 10, 10, 1);
    for (let y = 1; y <= 10; y++) for (let x = bx; x < bx + 10; x++) if (bx !== 18 || y > 5) m.set(x, y, d - 1, y % 2 ? C.metal : C.metalDark);
  }
  neon(m, 'DEPOT', 23, 16, d, C.neonWarm, 1);
  for (const [x, z] of [[2, d + 4], [8, d + 6], [38, d + 5]]) m.box(x, 1, z, 4, 2, 4, 0x8a5a2b); // pallets
  graffiti(m, 34, 3, d, 6);
  return dust(m);
}

export function motel() {
  const m = new VoxelModel(); const w = 40; const d = 18;
  pad(m, -4, -4, w + 8, d + 16, 32);
  block(m, { w, d, floors: 2, wall: C.ochre, trim: C.ochreDark, seed: 33 });
  m.box(0, FH, d, w, 1, 4, C.trim); // walkway on columns, with a railing
  for (let x = 0; x < w; x += 2) { m.set(x, FH + 1, d + 3, C.metal); m.set(x + 1, FH + 2, d + 3, C.metal); }
  for (let x = 0; x < w; x++) m.set(x, FH + 3, d + 3, C.metalDark);
  for (let x = 1; x < w; x += 8) m.box(x, 1, d + 3, 1, FH - 1, 1, C.trim);
  for (let x = 3; x < w - 3; x += 7) m.box(x, FH + 1, d - 1, 3, 7, 1, x % 3 ? 0x7a2f2a : C.board); // upstairs doors
  for (let x = 3; x < w - 3; x += 7) { m.clearBox(x, 1, d - 1, 3, 7, 1); m.box(x, 1, d - 1, 3, 7, 1, x % 3 ? C.board : 0x7a2f2a); }
  neon(m, 'MOTEL', Math.floor(w / 2), 2 * FH + 4, d, C.neonPink, 2); // sign on the roof edge, one dead letter
  return dust(m);
}

export function apartment() {
  const m = new VoxelModel(); const w = 34; const d = 30;
  pad(m, -4, -4, w + 8, d + 14, 34);
  block(m, { w, d, floors: 4, wall: C.brick, trim: C.trim, seed: 35, balconies: true });
  m.clearBox(14, 1, d - 1, 6, 7, 1); m.box(14, 1, d - 1, 6, 7, 1, C.glass);
  m.box(12, 8, d, 10, 1, 3, C.trim);
  for (const [x, z] of [[2, d + 5], [26, d + 6]]) m.box(x, 1, z, 5, 4, 3, 0x3f6a4a); // bins
  graffiti(m, 2, 2, d, 8);
  return dust(m);
}

export function church() {
  const m = new VoxelModel(); const w = 18; const d = 36;
  pad(m, -2, -2, w + 4, d + 10, 36);
  m.walls(0, 1, 0, w, 16, d, C.cream);
  m.box(1, 16, 1, w - 2, 1, d - 2, C.roofDark);
  for (let k = 0; k <= 9; k++) m.box(k, 17 + k, 0, w - 2 * k, 1, d, k % 3 === 0 ? C.roofDark : C.roof); // pitched roof
  for (let z = 6; z < d - 6; z += 8) for (const x of [0, w - 1]) for (let y = 4; y < 13; y++) m.set(x, y, z, y > 10 ? C.neonWarm : C.glass, y > 10);
  // Bell tower over the door.
  m.walls(4, 1, d - 10, 10, 40, 10, C.creamDark);
  for (let k = 0; k < 5; k++) m.box(4 + k, 41 + k * 2, d - 10 + k, 10 - 2 * k, 2, 10 - 2 * k, C.roofDark);
  m.box(8, 51, d - 6, 2, 6, 2, C.trim); m.box(6, 54, d - 6, 6, 1, 2, C.trim); // cross
  m.clearBox(7, 1, d - 1, 4, 9, 1); m.box(7, 1, d - 1, 4, 9, 1, C.board);
  m.box(7, 32, d - 1, 4, 5, 1, 0x15191e);
  moss(m, 0, 0, w, d, 16, 36);
  return dust(m);
}

export function farmhouse() {
  const m = new VoxelModel();
  for (let x = -4; x < 52; x++) for (let z = -4; z < 44; z++) m.set(x, 0, z, hash3(x, 2, z) < 0.12 ? C.mossDark : P.snow);
  // Red barn.
  m.walls(0, 1, 0, 24, 14, 30, C.brick);
  for (let k = 0; k <= 12; k++) m.box(k, 15 + k, 0, 24 - 2 * k, 1, 30, k % 4 === 0 ? C.roofDark : C.roof);
  m.clearBox(7, 1, 29, 10, 11, 1);
  for (let y = 1; y < 12; y++) for (let x = 7; x < 17; x++) if (x === 7 || x === 16 || y === 11 || x - 7 === y - 1 || 16 - x === y - 1) m.set(x, y, 29, C.trim);
  // Farmhouse with a porch.
  block(m, { x0: 30, z0: 8, w: 18, d: 16, floors: 2, wall: C.cream, trim: C.creamDark, seed: 37 });
  m.box(30, 1, 24, 18, 1, 4, 0x7a5a3a);
  for (const x of [30, 47]) m.box(x, 2, 27, 1, 8, 1, 0x7a5a3a);
  for (let x = 30; x < 48; x++) m.set(x, 10, 27, C.creamDark);
  // Fence and hay bales.
  for (let z = 0; z < 40; z += 2) m.box(-3, 1, z, 1, 3, 1, 0x7a5a3a);
  for (const [x, z] of [[26, 34], [30, 36], [40, 35]]) m.box(x, 1, z, 4, 3, 3, 0xd8b03a);
  return dust(m);
}

// ---------------------------------------------------------------- MAP-1: blocks without a place

// ---------------------------------------------------------------- MAP-1b: small buildings that fill a block's free chunks

export const SMALL_VARIANTS = 8;
export const SMALL_SCALE = 0.86; // instance scale: a small building fills its chunk with a little room around it
const SMALL_WALLS = [C.sage, C.cream, C.grey, C.brick, C.ochre, 0x8fa3b8, 0xb9a48a, 0x9b8b9e];

/** A small, closed-up building (not a place you can enter): 2–4 floors, sized to one chunk. */
export function smallBuilding(v = 0) {
  const m = new VoxelModel();
  const w = 16 + (v % 3) * 2; const d = 14 + (v % 2) * 3;
  const floors = 2 + (v % 3); // MAP-3: at least two floors (a one-floor shop read as an empty box)
  const shop = floors <= 3 && v % 2 === 0;
  const x0 = -Math.floor(w / 2); const z0 = -Math.floor(d / 2);
  const H = block(m, { x0, z0, w, d, floors, wall: SMALL_WALLS[v % SMALL_WALLS.length], seed: 50 + v, shop, balconies: v % 3 === 1 });
  if (v % 4 === 1) graffiti(m, x0 + 2, 2, z0 + d, v);
  // MAP-3 variety: houses get a front door with a little canopy and a stoop; some a pitched roof with a chimney.
  if (!shop) {
    const dx = x0 + Math.floor(w / 2) - 1; const fz = z0 + d - 1;
    m.clearBox(dx, 1, fz, 3, 6, 1); m.box(dx, 1, fz - 1, 3, 6, 1, v % 2 ? 0x6b4a30 : 0x2f4f6f); m.set(dx + 2, 3, fz, 0xd8b03a);
    m.box(dx - 1, 7, fz + 1, 5, 1, 2, C.roofDark); m.box(dx - 1, 1, fz + 1, 5, 1, 2, C.greyDark);
  }
  if (v % 4 === 3) {
    m.clearBox(x0, H + 1, z0, w, 3, d); // no parapet: a gable roof instead
    for (let k = 0; k <= Math.floor(d / 2); k++) m.box(x0 - 1, H + 1 + k, z0 - 1 + k, w + 2, 1, d + 2 - 2 * k, k % 2 ? C.roofDark : C.roof);
    m.box(x0 + 3, H + 2, z0 + 3, 2, Math.floor(d / 2) + 2, 2, C.brick);
  }
  // MAP-7: one ground-floor detail per front, and rooftop clutter on flat roofs.
  const fz = z0 + d;
  if (shop) { m.box(x0 + w - 2, FH + 1, fz, 1, 1, 3, C.metalDark); m.box(x0 + w - 2, FH - 4, fz + 2, 1, 5, 4, 0x2a2d31); m.box(x0 + w - 2, FH - 3, fz + 3, 1, 3, 2, 0x4a3a3c); } // a dark bracket sign
  else if (v % 4 === 1) { for (const bx0 of [x0 + 1, x0 + 5]) { m.box(bx0, 1, fz, 3, 1, 1, 0x1c1f24); m.box(bx0, 3, fz, 3, 1, 1, 0x1c1f24); m.box(bx0, 2, fz, 1, 1, 1, 0x1c1f24); m.box(bx0 + 2, 2, fz, 1, 1, 1, 0x1c1f24); } m.box(x0 + 2, 3, fz, 5, 1, 1, 0xa63a2e); m.box(x0 + 3, 4, fz, 1, 1, 1, 0x1c1f24); } // a bicycle against the wall
  else { m.box(x0 + 1, 1, fz, 3, 3, 3, 0xa07a4a); m.box(x0 + 2, 4, fz + 1, 2, 2, 2, 0x8a6a44); } // crates by the door
  if (v % 4 !== 3) {
    if (v % 3 === 0) { for (const [dx, dz] of [[0, 0], [3, 0], [0, 3], [3, 3]]) m.box(x0 + 3 + dx, H + 1, z0 + 3 + dz, 1, 4, 1, C.metalDark); m.box(x0 + 2, H + 5, z0 + 2, 6, 5, 6, 0x7a5a3a); for (let k = 0; k < 3; k++) m.box(x0 + 3 + k, H + 10 + k, z0 + 3 + k, 4 - 2 * k, 1, 4 - 2 * k, C.roofDark); } // a water tank on legs
    else if (v % 3 === 2) { m.box(x0 + w - 3, H + 1, z0 + 3, 1, 10, 1, C.metalDark); m.box(x0 + w - 5, H + 9, z0 + 3, 5, 1, 1, C.metalDark); m.box(x0 + 3, H + 2, z0 + d - 4, 3, 3, 1, 0xd8d2c2); } // an aerial and a dish
  }
  return dust(m);
}

// ---------------------------------------------------------------- MAP-6: the outskirts

export const COTTAGE_VARIANTS = 6; // MAP-7: 4 lived-in, 2 abandoned
const PACKED = 0xccd3db; const RAIL_WOOD = 0x7a5a3a;
/** A post-and-rail fence line (posts every 4, two rails), optionally with a gap. */
function railFence(m, x0, z0, len, alongX, gap = null, lean = -1) {
  for (let u = 0; u < len; u++) {
    if (gap && u >= gap[0] && u < gap[1]) continue;
    const x = alongX ? x0 + u : x0; const z = alongX ? z0 : z0 + u;
    if (u % 4 === 0) m.box(x, 1, z, 1, 5, 1, 0x5a4030);
    if (u === lean) continue; // a broken rail
    m.set(x, 3, z, RAIL_WOOD); m.set(x, 5, z, RAIL_WOOD);
  }
}
/**
 * An outskirts cottage in its garden (one chunk): one floor and an attic under a steep roof, a porch, a chimney, a
 * woodpile, a mailbox, a post-and-rail garden fence, a trodden path to the road, a dog house. v 4–5: abandoned
 * (boarded windows, a sagging roof, a snow-filled porch, a broken fence, no path).
 */
export function cottage(v = 0) {
  const m = new VoxelModel();
  const w = 14; const d = 11; const x0 = -7; const z0 = -7;
  const dead = v >= 4;
  const wall = [0x9b7b5a, C.cream, 0x8fa3b8, C.sage, 0x8a7a66, 0x9a9488][v];
  const roof = [C.roofDark, 0x6a3a2e, C.roof, 0x4b525a, 0x5a5650, 0x6a3a2e][v];
  for (let x = -12; x < 12; x++) for (let z = -12; z < 12; z++) m.set(x, 0, z, !dead && Math.abs(x - (x0 + (v % 2 ? 4 : w - 5))) <= 1 && z > z0 + d + 2 ? PACKED : P.snow); // the garden and the path
  const H = block(m, { x0, z0, w, d, floors: 1, wall, seed: 140 + v });
  m.clearBox(x0, H + 1, z0, w, 3, d);
  for (let k = 0; k <= Math.floor(d / 2) + 1; k++) {
    const sag = dead && k > 1 && k < 5 ? 1 : 0; // the ridge has sagged
    m.box(x0 - 1, H + 1 + k - sag, z0 - 2 + k, w + 2, 1, d + 4 - 2 * k, k % 2 ? roof : C.roofDark);
  }
  if (dead) m.clearBox(x0 + 3, H + 4, z0 + 2, 3, 3, 3); // a hole in the roof
  for (const x of [x0, x0 + w - 1]) for (let k = 0; k < Math.floor(d / 2); k++) m.box(x, H + 1 + k, z0 + k, 1, 1, d - 2 * k, wall); // gable ends
  m.box(x0 + w - 4, H + 2, z0 + 2, 2, Math.floor(d / 2) + 3, 2, C.brick); // chimney
  const dx = x0 + (v % 2 ? 3 : w - 6); const fz = z0 + d - 1;
  m.clearBox(dx, 1, fz, 3, 6, 1); m.box(dx, 1, fz - 1, 3, 6, 1, v % 2 ? 0x6b4a30 : 0x7a2a2a);
  m.box(x0 + 1, 1, z0 + d, w - 2, 1, 3, 0x7a5a3a); // porch
  for (const x of [x0 + 1, x0 + w - 2]) m.box(x, 2, z0 + d + 2, 1, 6, 1, 0x7a5a3a);
  m.box(x0, 8, z0 + d, w, 1, 4, C.roofDark);
  if (dead) {
    m.box(x0 + 2, 2, z0 + d, w - 4, 2, 2, P.snow); // snow drifted onto the porch
    for (let x = x0 + 2; x < x0 + w - 2; x += 5) m.box(x, 3, z0 + d, 3, 4, 1, C.board); // boards over the windows
  } else {
    m.box(x0 - 3, 1, z0 + 1, 2, 3, 7, (x, y, z) => ((z + y) % 2 ? 0x7a5532 : 0xa07a4a)); // woodpile by the wall
    m.box(x0 + w - 1, 1, z0 - 4, 4, 3, 3, 0x7a4a2a); m.box(x0 + w - 1, 4, z0 - 4, 4, 1, 3, C.roofDark); m.set(x0 + w, 2, z0 - 2, 0x1c1f24); // dog house
  }
  m.box(x0 + w + 1, 1, z0 + d + 4, 1, 4, 1, 0x5a4a3a); m.box(x0 + w, 5, z0 + d + 4, 3, 2, 2, v % 2 ? 0x2b4170 : 0x3a3f46); // mailbox
  const gapX = (v % 2 ? 4 : w - 5) + x0 + 10; // the gate opens on the path
  railFence(m, -11, 10, 22, true, dead ? null : [gapX - 1, gapX + 2], dead ? 9 : -1);
  railFence(m, -11, -11, 21, false, null, dead ? 6 : -1); railFence(m, 10, -11, 21, false);
  return fin(m);
}

/** MAP-7 fields (one chunk): v0 fence rows and hay bales; v1 a tractor under a tarp; v2 a lean-to with firewood. */
export function fieldPiece(v = 0) {
  const m = new VoxelModel();
  for (let x = -12; x < 12; x++) for (let z = -12; z < 12; z++) m.set(x, 0, z, (z + 12) % 5 === 0 && hash3(x >> 2, v, z) < 0.5 ? 0xb8b08a : P.snow); // stubble rows
  railFence(m, -11, -11, 22, true, [9, 12], 15); railFence(m, -11, -11, 22, false, null, v === 0 ? 10 : -1);
  if (v === 0) for (const [x, z] of [[-4, -2], [3, 3], [6, -5]]) { m.box(x, 1, z, 4, 3, 3, 0xd8b03a); m.box(x, 2, z, 4, 1, 3, 0xb8902a); }
  if (v === 1) { m.box(-3, 1, -1, 9, 3, 5, 0xa63a2e); m.box(3, 4, -1, 3, 4, 5, 0xa63a2e); for (const x of [-3, 4]) m.box(x, 0, -2, 3, 3, 7, 0x1c1f24); m.box(-4, 4, -2, 11, 2, 7, 0x2f5a6a); } // tractor + tarp
  if (v === 2) { m.box(-6, 1, -6, 1, 9, 1, 0x5a4030); m.box(5, 1, -6, 1, 9, 1, 0x5a4030); m.box(-7, 9, -8, 14, 1, 6, C.roofDark); for (let y = 1; y < 6; y++) m.box(-5, y, -7, 10, 1, 3, (x) => ((x + y) % 2 ? 0x7a5532 : 0xa07a4a)); }
  return fin(m);
}

/** MAP-7: a frozen pond (one chunk): dark ice with lighter cracks, reeds at the edge, a rowing boat frozen in. */
export function pondPiece() {
  const m = new VoxelModel();
  for (let x = -12; x < 12; x++) for (let z = -12; z < 12; z++) {
    const r = (x / 10) ** 2 + (z / 8) ** 2 + (hash3(x >> 1, 3, z >> 1) - 0.5) * 0.25;
    m.set(x, 0, z, r < 1 ? (hash3(x, 5, z) < 0.06 ? 0xd7e4ee : r < 0.5 ? 0x6f8a9c : 0x87a2b4) : P.snow);
    if (r > 0.95 && r < 1.15 && hash3(x, 7, z) < 0.3) m.box(x, 1, z, 1, 3 + Math.floor(hash3(x, 9, z) * 3), 1, 0xb8a46a); // reeds
  }
  m.box(2, 1, 1, 6, 2, 3, 0x7a4a2a); m.box(3, 2, 1, 4, 1, 3, 0x3a2a1a);
  return m.snowCap(P.snow, 0.6, 2);
}

// ---------------------------------------------------------------- MAP-1c: decoration pieces sized to chunks

/** A fenced parking lot (2×2 chunks): painted bays, a booth, a few parked / wrecked cars. Centred. */
export function parkingSmall() {
  const m = new VoxelModel(); const w = 48; const d = 48; const x0 = -24; const z0 = -24;
  for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) {
    let c = C.asphalt;
    if ((x % 8 === 0 && (z < 14 || z > d - 15)) || z === 14 || z === d - 15) c = C.paint;
    if (hash3(x, 3, z) < 0.12) c = P.snow;
    m.set(x0 + x, 0, z0 + z, c);
  }
  for (let x = 0; x < w; x++) for (const z of [0, d - 1]) { m.set(x0 + x, 3, z0 + z, C.metal); if (x % 4 === 0) m.box(x0 + x, 1, z0 + z, 1, 4, 1, C.metalDark); else m.set(x0 + x, 1, z0 + z, C.metalDark); }
  for (let z = 0; z < d; z++) if (z < 18 || z > 30) for (const x of [0, w - 1]) { m.set(x0 + x, 3, z0 + z, C.metal); if (z % 4 === 0) m.box(x0 + x, 1, z0 + z, 1, 4, 1, C.metalDark); }
  const car = (x, z, c) => { m.box(x0 + x, 1, z0 + z, 6, 3, 10, c); m.box(x0 + x, 4, z0 + z + 3, 6, 2, 5, c); m.box(x0 + x, 4, z0 + z + 2, 6, 2, 1, C.glass); };
  car(3, 2, 0xa63a2e); car(19, 2, 0x2b4170); car(27, d - 12, 0xd8b03a); car(35, d - 12, 0xe4e2da);
  m.box(x0 + 2, 1, z0 + 20, 6, 7, 6, C.cream); m.box(x0 + 2, 8, z0 + 20, 6, 1, 6, C.roofDark); m.box(x0 + 7, 3, z0 + 21, 1, 3, 4, C.glassLit, true); // booth
  for (let y = 0; y < 2; y++) m.box(x0 + 32, 1 + y * 7, z0 + 18, 12, 7, 6, C.cont[(y + 1) % 3]);
  return m.snowCap(P.snow, 1, 1);
}

/** A small square (1 chunk): paving ring, a frozen fountain, two benches. Centred. */
export function fountain() {
  const m = new VoxelModel();
  for (let x = -10; x < 10; x++) for (let z = -10; z < 10; z++) {
    const r = Math.hypot(x + 0.5, z + 0.5);
    m.set(x, 0, z, r < 9 ? ((x + z) % 4 === 0 ? C.tileLine : C.tile) : P.snow);
    if (r < 5.5) m.box(x, 1, z, 1, r > 4.5 ? 2 : 1, 1, r > 4.5 ? C.trim : 0xbfe3f5);
  }
  m.box(-1, 1, -1, 2, 5, 2, C.trim); m.box(-2, 6, -2, 4, 1, 4, C.trim); m.set(0, 7, 0, 0xbfe3f5);
  for (const z of [-9, 8]) { m.box(-3, 1, z, 6, 1, 1, 0x7a5a3a); m.box(-3, 2, z + (z < 0 ? 0 : 0), 6, 1, 1, 0x7a5a3a); }
  return m.snowCap(P.snow, 1, 1);
}

/** A small burnt-out building (1 chunk): two broken walls, a fallen slab, rubble. Centred. */
export function ruinSmall(v = 0) {
  const m = new VoxelModel(); const w = 18; const d = 16; const x0 = -9; const z0 = -8;
  pad(m, x0 - 1, z0 - 1, w + 2, d + 2, 70 + v);
  const wall = v ? C.grey : C.cream;
  // Broken walls: each 3-voxel stretch stops at its own height (stepped, not noisy), window holes on the way.
  eachFace(x0, z0, w, d, (x, z, u, _o, side) => {
    const top = 2 + Math.floor(hash3(Math.floor(u / 3), side.length + v, 71) * (side === 'back' || side === 'left' ? 16 : 9));
    for (let y = 1; y <= top; y++) {
      const win = u % 6 >= 2 && u % 6 <= 3 && (y % FH) >= 4 && (y % FH) <= 7;
      if (!win) m.set(x, y, z, y === top ? C.trim : wall);
    }
  });
  m.box(x0 + 1, FH, z0 + 1, Math.floor(w / 2), 1, d - 2, C.roofDark); // what is left of the first floor
  for (let i = 0; i < 18; i++) {
    const x = x0 + 1 + Math.floor(hash3(i, 1, v) * (w - 2)); const z = z0 + 1 + Math.floor(hash3(i, 2, v) * (d - 2));
    m.box(x, 1, z, 2, 1 + Math.floor(hash3(i, 3, v) * 2), 2, hash3(i, 4, v) < 0.5 ? C.greyDark : C.creamDark);
  }
  for (let k = 0; k < 8; k++) m.set(x0 + 4 + k, 1 + k, z0 + 6, C.rust); // bent girder
  moss(m, x0, z0, w, d, 10, 70 + v);
  return m.snowCap(P.snow, 1, 1);
}

// ---------------------------------------------------------------- MAP-2 B: 2× city models

let tagged = false;
const FINE = new Map();
/** The 2× (0.12 world per voxel at the usual scale) version of a city model, built once per key. */
export function fine(key, make) {
  if (!tagged) {
    tagged = true;
    tagMaterial('brick', [C.brick]);
    tagMaterial('metal', [C.metal, C.metalDark]);
    tagMaterial('wood', [C.board, 0x7a5a3a, 0x8a5a2b]);
  }
  if (!FINE.has(key)) FINE.set(key, refineCity(make(), { glass: C.glass, glassLit: C.glassLit, frame: C.trim, mullion: 0x3a3f46 }));
  return FINE.get(key);
}

const COARSE = new Map(); const FAR = new Map();
/** MAP-2 D: level-of-detail versions of a city model: 0 = fine (2×), 1 = as authored, 2 = half resolution. */
export function lod(level, key, make) {
  if (level === 0) return fine(key, make);
  if (level === 1) { if (!COARSE.has(key)) COARSE.set(key, make()); return COARSE.get(key); }
  if (!FAR.has(key)) FAR.set(key, downsample(lod(1, key, make)));
  return FAR.get(key);
}

// ---------------------------------------------------------------- MAP-5: more building kinds and sizes
// One chunk ≈ 24 voxels at the small-building scale (0.86 × 0.3 world); two chunks side by side ≈ 48.

/** A tall downtown block on one chunk: 5–8 floors (v 0..3), balconies on some, a water tank or sign on top. */
export function tallBuilding(v = 0) {
  const m = new VoxelModel();
  const w = 18; const d = 16; const floors = [5, 6, 5, 7][v % 4];
  const walls = [C.grey, 0x8fa3b8, C.cream, 0x9b8b9e];
  block(m, { x0: -9, z0: -8, w, d, floors, wall: walls[v % 4], seed: 80 + v, shop: v % 2 === 0, balconies: v % 2 === 1 });
  if (v === 3) { const y = floors * FH + 3; m.box(-6, y, -4, 12, 6, 1, C.metalDark); neon(m, 'HOTEL', 0, y + 1, -3, C.neonPink, [0, 1, 3, 4]); } // MAP-6: one letter left
  return dust(m);
}

/** Row houses: three narrow two-storey houses side by side on one chunk, each with its own door, stoop and colour. */
export function rowHouses(v = 0) {
  const m = new VoxelModel();
  const tones = [[C.brick, C.cream, 0x8fa3b8], [C.sage, C.ochre, C.grey]][v % 2];
  for (let k = 0; k < 3; k++) {
    const x0 = -9 + k * 6;
    block(m, { x0, z0: -7, w: 6, d: 14, floors: 2, wall: tones[k], seed: 90 + v * 3 + k });
    m.clearBox(x0 + 2, 1, 6, 2, 6, 1); m.box(x0 + 2, 1, 5, 2, 6, 1, [0x6b4a30, 0x2f4f6f, 0x7a2a2a][k]);
    m.box(x0 + 1, 1, 7, 4, 1, 2, C.greyDark);
    for (let j = 0; j <= 3; j++) m.box(x0 - 1 + j, 2 * FH + 1 + j, -8 + j, 1, 1, 16 - 2 * j, C.roofDark); // gable
  }
  return dust(m);
}

/** An office block on two chunks: 6 floors of ribbon windows, a glass lobby, a rooftop sign frame. */
export function officeBlock(v = 0) {
  const m = new VoxelModel();
  const w = 42; const d = 16; const floors = 6;
  const H = block(m, { x0: -21, z0: -8, w, d, floors, wall: v % 2 ? C.greyDark : 0x5b6f8a, seed: 100 + v });
  for (let f = 0; f < floors; f++) for (let x = -19; x < 19; x++) { const y = f * FH + 4; m.set(x, y, 7, C.glass); m.set(x, y + 1, 7, hash3(x, f, v) < 0.02 ? C.glassLit : C.glass, hash3(x, f, v) < 0.02); }
  m.box(-6, 1, 7, 12, 7, 1, C.glass); m.box(-6, 8, 8, 12, 1, 2, C.trim);
  for (const x of [-15, 14]) m.box(x, H + 1, 0, 1, 7, 1, C.metalDark); m.box(-15, H + 6, 0, 30, 4, 1, C.trim);
  return dust(m);
}

/** A cinema on two chunks: a marquee with chaser lights and a title with a dead letter, a tall vertical sign. */
export function cinema() {
  const m = new VoxelModel();
  block(m, { x0: -21, z0: -8, w: 42, d: 16, floors: 2, wall: 0x7a2a2a, trim: C.cream, seed: 111 });
  m.box(-14, 9, 8, 28, 4, 4, C.trim);
  for (let x = -14; x < 14; x += 2) { const on = x % 10 === 0; m.set(x, 9, 12, on ? C.neonWarm : 0x5a4a3a, on); m.set(x, 12, 12, 0x5a4a3a); } // MAP-6: most bulbs gone
  neon(m, 'CINEMA', 0, 10, 12, C.neonRed, [0, 1, 2, 4, 5]);
  m.box(-18, 8, 9, 3, 20, 2, 0x2a2d31); for (let y = 10; y < 26; y += 3) m.box(-18, y, 11, 3, 2, 1, y < 14 ? C.neonBlue : 0x2f3a44, y < 14);
  m.box(-4, 1, 7, 8, 7, 1, C.glass);
  return dust(m);
}

/** A two-deck parking garage on two chunks: open decks on columns, a ramp, a couple of snowed cars. */
export function parkingGarage() {
  const m = new VoxelModel();
  for (let deck = 0; deck < 3; deck++) m.box(-21, deck * 8, -8, 42, 1, 16, C.grey);
  for (let x = -21; x <= 20; x += 7) for (const z of [-8, 7]) m.box(x, 1, z, 1, 16, 1, C.greyDark);
  for (let x = -21; x < 21; x++) { m.set(x, 9, 7, C.trim); m.set(x, 17, 7, C.trim); m.set(x, 9, -8, C.trim); m.set(x, 17, -8, C.trim); }
  for (let k = 0; k < 8; k++) m.box(10 + k, 1 + k, -2, 1, 1, 5, C.grey); // ramp
  for (const [x, y, c] of [[-16, 1, 0xa63a2e], [-6, 9, 0x2b4170], [0, 17, 0xd8b03a]]) { m.box(x, y, -6, 7, 3, 4, c); m.box(x + 2, y + 3, -6, 3, 2, 4, c); }
  m.box(-21, 18, -8, 6, 4, 1, 0x2b4a8c); m.set(-18, 19, -9, 0xf0f0ea);
  return dust(m);
}

/** An industrial shed on two chunks: a wide low hall, ribbed metal, two loading doors, a chimney stack. */
export function shedBuilding(v = 0) {
  const m = new VoxelModel();
  const c = v % 2 ? 0x6c7580 : 0x8a6a4a;
  for (let x = -21; x < 21; x++) for (let y = 1; y < 14; y++) for (const z of [-8, 7]) m.set(x, y, z, x % 2 ? c : (c & 0xfefefe) >> 1 | 0x202020);
  for (let z = -8; z < 8; z++) for (let y = 1; y < 14; y++) { m.set(-21, y, z, c); m.set(20, y, z, c); }
  for (let k = 0; k < 5; k++) m.box(-21, 14 + k, -8 + k, 42, 1, 16 - 2 * k, C.roofDark);
  for (const x of [-14, 4]) { m.clearBox(x, 1, 7, 8, 9, 1); m.box(x, 1, 6, 8, 9, 1, C.metal); for (let y = 2; y < 10; y += 2) m.box(x, y, 7, 8, 1, 1, C.metalDark); }
  m.box(15, 1, -5, 3, 30, 3, C.brick); m.box(15, 30, -5, 3, 1, 3, 0x2a2d31);
  return dust(m);
}

/** A landmark tower on two chunks: 10 floors, a setback crown, a water tank and a blinking aerial. */
export function landmarkTower(v = 0) {
  const m = new VoxelModel();
  const H = block(m, { x0: -18, z0: -8, w: 36, d: 16, floors: 8, wall: v % 2 ? 0x9aa6b2 : C.cream, seed: 120 + v, shop: true, balconies: true });
  block(m, { x0: -12, z0: -5, w: 24, d: 10, floors: 2, wall: v % 2 ? 0x8b97a3 : C.creamDark, seed: 121 + v });
  m.clearBox(-12, 1, -5, 24, H - 1, 10); // (the crown sits on the roof: lift it)
  const crown = new VoxelModel(); block(crown, { x0: -12, z0: -5, w: 24, d: 10, floors: 2, wall: v % 2 ? 0x8b97a3 : C.creamDark, seed: 122 + v });
  m.merge(crown, 0, H, 0);
  m.box(0, H + 2 * FH + 4, 0, 1, 14, 1, C.metalDark); m.set(0, H + 2 * FH + 18, 0, C.neonRed, true);
  return dust(m);
}

// ---------------------------------------------------------------- MAP-6: tiered places and resource areas

const OLIVE = 0x5d6b3a; const OLIVE_DARK = 0x46512b; const RUST = 0x8a4a2e;
/** A snowed car shell (for lots and yards): 7×4 body, 3×2 cab. */
function carShell(m, x, y, z, color, alongX = true) {
  if (alongX) { m.box(x, y, z, 7, 3, 4, color); m.box(x + 2, y + 3, z, 3, 2, 4, color); m.box(x + 2, y + 3, z, 1, 2, 4, C.glass); }
  else { m.box(x, y, z, 4, 3, 7, color); m.box(x, y + 3, z + 2, 4, 2, 3, color); m.box(x, y + 3, z + 2, 4, 2, 1, C.glass); }
}
/** A chain-link fence line (posts every 4, mesh between) along x or z. */
function chainFence(m, x0, z0, len, alongX, h = 7, gap = null) {
  for (let u = 0; u < len; u++) {
    if (gap && u >= gap[0] && u < gap[1]) continue;
    const x = alongX ? x0 + u : x0; const z = alongX ? z0 : z0 + u;
    if (u % 4 === 0) m.box(x, 1, z, 1, h, 1, C.metalDark);
    else for (let y = 1; y < h; y++) if ((u + y) % 2 === 0) m.set(x, y, z, 0x9aa3ad);
    m.set(x, h, z, C.metalDark);
  }
}
/** A simple pine (cone of discs, snow on the tiers). */
function pine(m, x, z, h = 14, seed = 0) {
  m.box(x, 1, z, 1, 3, 1, 0x5a3e28);
  for (let y = 3; y < h; y++) {
    const r = Math.max(0, Math.round((h - y) * 0.38 + (y % 3 === 0 ? 1 : 0)));
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (dx * dx + dz * dz <= r * r + 1) m.set(x + dx, y, z + dz, y % 3 === 0 && hash3(dx, y, seed) < 0.6 ? P.snow : hash3(dx + seed, y, dz) < 0.5 ? 0x2f5a3a : 0x264a30);
  }
  m.set(x, h, z, P.snow);
}

/** Tier 2: a shopping mall on 2×2 chunks: a two-storey box with a glass entrance, a pylon sign, a car park in front. */
export function mall() {
  const m = new VoxelModel();
  for (let x = -21; x < 21; x++) for (let z = 2; z < 21; z++) { // the car park: drifts at its edges, faded bays, oil (VOXEL-2)
    const edge = Math.min(x + 21, 20 - x, 20 - z); let c = edge < 2 + hash3(x >> 1, 3, z >> 1) * 2.5 ? P.snow : C.asphalt;
    if (c === C.asphalt && (x + 21) % 6 === 0 && z > 4 && z < 11 && hash3(x, 4, z) < 0.7) c = 0xa9adb2; else if (c === C.asphalt && hash3(x >> 1, 5, z >> 1) < 0.04) c = 0x1e2024;
    m.set(x, 0, z, c);
  }
  block(m, { x0: -20, z0: -20, w: 40, d: 22, floors: 2, wall: C.cream, trim: C.creamDark, seed: 150, shop: true });
  m.clearBox(-7, 1, 1, 14, 9, 1); m.box(-7, 1, 1, 14, 9, 1, C.glass); m.box(-8, 10, 2, 16, 1, 3, C.trim); // glass entrance + canopy
  neon(m, 'MALL', 0, 22, 2, C.neonBlue, 2, 2);
  m.box(12, 1, 18, 2, 22, 2, C.metalDark); m.box(4, 23, 18, 18, 8, 2, 0x2b4a8c); neon(m, 'SALE', 13, 25, 19, C.neonWarm, [0, 3]); // pylon sign
  for (const [x, z, c] of [[-18, 6, 0xa63a2e], [-10, 12, 0x2b4170], [4, 6, 0x6c7580]]) carShell(m, x, 1, z, c);
  m.box(8, 1, 14, 6, 3, 2, C.metal); for (let x = 8; x < 14; x += 2) m.box(x, 4, 14, 1, 1, 2, C.metalDark); // trolley corral
  return fin(m);
}

/** Tier 2: a hardware store on one chunk: a low shop, a TOOLS sign, a lumber rack and gas cages outside. */
export function hardware() {
  const m = new VoxelModel();
  pad(m, -11, -9, 22, 20, 151);
  block(m, { x0: -9, z0: -8, w: 18, d: 14, floors: 1, wall: 0xb9a48a, seed: 152, shop: true });
  neon(m, 'TOOLS', 0, 12, 6, C.neonRed, 3);
  m.box(-10, 1, 7, 6, 1, 3, C.metalDark); for (let y = 2; y < 7; y++) m.box(-10, y, 7 + (y % 2), 6, 1, 1, y % 2 ? 0xc9a066 : 0xa07a4a); // lumber rack
  m.box(5, 1, 7, 4, 5, 3, C.metal); for (let x = 5; x < 9; x++) m.set(x, 3, 9, 0xd04a3a); // gas cage
  return fin(m);
}

/** Tier 3: an army base on 3×2 chunks: a fence with a gate, two watchtowers, barracks, trucks, a helipad. */
export function military() {
  const m = new VoxelModel();
  for (let x = -31; x < 31; x++) for (let z = -20; z < 21; z++) m.set(x, 0, z, hash3(x >> 3, 5, z >> 3) < 0.3 ? 0x8a8f86 : P.snow);
  chainFence(m, -31, 20, 62, true, 8, [24, 38]); chainFence(m, -31, -20, 62, true, 8); chainFence(m, -31, -20, 40, false, 8); chainFence(m, 30, -20, 40, false, 8);
  for (const x of [-30, 25]) { // watchtowers
    for (const [dx, dz] of [[0, 0], [4, 0], [0, 4], [4, 4]]) m.box(x + dx, 1, 14 + dz, 1, 14, 1, 0x6a4a30);
    m.box(x - 1, 15, 13, 7, 1, 7, 0x6a4a30); m.walls(x - 1, 16, 13, 7, 4, 7, OLIVE); m.clearBox(x, 18, 19, 5, 1, 1);
    for (let k = 0; k < 2; k++) m.box(x - 1 + k, 20 + k, 13 + k, 7 - 2 * k, 1, 7 - 2 * k, OLIVE_DARK);
    m.box(x + 2, 19, 20, 1, 1, 1, 0xfff2c0, true); // a searchlight
  }
  for (const z of [-17, -7]) { // barracks: long huts with a rounded roof
    m.walls(-26, 1, z, 30, 7, 8, OLIVE); for (let k = 0; k < 3; k++) m.box(-27, 8 + k, z + k, 32, 1, 8 - 2 * k, k === 2 ? OLIVE_DARK : OLIVE);
    for (let x = -23; x < 2; x += 5) m.box(x, 3, z + 7, 2, 2, 1, C.glass);
    m.clearBox(-12, 1, z + 7, 3, 5, 1); m.box(-12, 1, z + 6, 3, 5, 1, 0x3a3f2a);
  }
  for (let a = 0; a < 64; a++) { const x = 17 + Math.round(Math.cos(a / 10.2) * 8); const z = -9 + Math.round(Math.sin(a / 10.2) * 8); m.set(x, 1, z, 0xd8d2c2); } // helipad
  for (const [x, z] of [[14, -12], [14, -6], [19, -12]]) m.box(x, 1, z, 1, 1, 7, 0xd8d2c2); m.box(14, 1, -9, 6, 1, 1, 0xd8d2c2);
  for (const [x, z] of [[-24, 4], [-12, 4]]) { m.box(x, 1, z, 10, 5, 5, OLIVE_DARK); m.box(x + 7, 1, z, 3, 7, 5, OLIVE); m.box(x + 9, 4, z, 1, 2, 5, C.glass); for (const dx of [1, 6]) m.box(x + dx, 0, z - 1, 2, 2, 7, 0x1c1f24); } // trucks
  for (let k = 0; k < 8; k++) m.box(-6 + k * 2, 1, 17 + (k % 2), 2, 3, 2, 0x938466); // sandbags by the gate
  return fin(m);
}

/** Tier 3: a factory on 2×2 chunks: a sawtooth-roof hall, two brick chimneys, a yard of drums and pallets. */
export function factory() {
  const m = new VoxelModel();
  pad(m, -21, -21, 42, 42, 153);
  m.walls(-20, 1, -20, 40, 14, 26, 0x8a6a4a);
  for (let x = -20; x < 20; x += 2) m.box(x, 1, 5, 1, 14, 1, 0x7a5a3a);
  for (let z = -20; z < 6; z += 6) for (let k = 0; k < 6; k++) { m.box(-20, 15 + k, z + k, 40, 1, 1, C.roofDark); m.box(-20, 15 + k, z + 5, 40, 1, 1, k === 5 ? C.glass : C.roof); } // sawtooth
  for (let x = -18; x < 18; x += 8) { m.clearBox(x, 1, 5, 5, 8, 1); m.box(x, 1, 4, 5, 8, 1, C.metal); }
  for (const x of [-15, 10]) { m.box(x, 1, -16, 4, 38, 4, C.brick); for (let y = 30; y < 38; y += 3) m.box(x, y, -16, 4, 1, 4, 0x6a3a2e); }
  neon(m, 'WORKS', 0, 22, 6, C.neonWarm, [0, 1, 4]);
  for (const [x, z] of [[-18, 10], [-14, 12], [12, 9], [15, 13]]) m.box(x, 1, z, 3, 4, 3, hash3(x, z, 1) < 0.5 ? 0x2b4170 : RUST); // drums
  for (const [x, z] of [[-4, 12], [2, 14]]) pallet(m, x, z, 2); // pallets
  return fin(m);
}

/** Resource area (wood): pine woods on 2×2 chunks: a logging track, stumps, a long woodpile, a shed with an axe. */
export function forest() {
  const m = new VoxelModel();
  for (let x = -21; x < 21; x++) for (let z = -21; z < 21; z++) m.set(x, 0, z, Math.abs(x - 2) < 3 && z > -6 ? 0xb9c2cc : P.snow); // the track
  let n = 0;
  for (let x = -18; x < 19; x += 8) for (let z = -18; z < 19; z += 8) {
    const jx = x + Math.round((hash3(x, 1, z) - 0.5) * 3); const jz = z + Math.round((hash3(x, 2, z) - 0.5) * 3);
    if (Math.abs(jx - 2) < 6 && jz > -8) { if (hash3(x, 3, z) < 0.6) m.box(jx, 1, jz, 2, 2, 2, 0x8a6a44); continue; } // stumps in the clearing
    pine(m, jx, jz, 13 + Math.floor(hash3(x, 4, z) * 8), n++);
  }
  for (let y = 1; y < 5; y++) for (let x = -14; x < -4; x++) m.box(x, y, 14 + (y % 2), 1, 1, 3, (x + y) % 2 ? 0x7a5532 : 0xb08a5a); // woodpile
  m.walls(8, 1, 10, 9, 7, 7, 0x6a4a30); m.box(7, 8, 9, 11, 1, 9, C.roofDark); m.box(10, 1, 16, 3, 5, 1, 0x3a2a1a); // shed
  m.box(-2, 1, 12, 4, 2, 1, 0x7a5532); m.box(0, 3, 12, 1, 3, 1, 0x7a5532); m.box(0, 6, 12, 2, 1, 1, C.metal); // chopping block + axe
  return fin(m);
}

/** Resource area (metal): a scrapyard on 2×2 chunks: wrecks stacked three high, a crane with a car, an office hut. */
export function scrapyard() {
  const m = new VoxelModel();
  for (let x = -21; x < 21; x++) for (let z = -21; z < 21; z++) m.set(x, 0, z, gravel(x, z, Math.min(x + 21, 20 - x, z + 21, 20 - z)));
  chainFence(m, -21, 20, 42, true, 7, [6, 16]); chainFence(m, -21, -21, 42, true, 7); chainFence(m, -21, -21, 41, false, 7); chainFence(m, 20, -21, 41, false, 7);
  const tones = [RUST, 0x6c7580, 0xa63a2e, 0x2b4170, 0x5d6b3a, 0x8e979f];
  for (let row = 0; row < 3; row++) for (let k = 0; k < 4; k++) {
    const h = 1 + Math.floor(hash3(row, k, 7) * 3);
    for (let y = 0; y < h; y++) m.box(-18 + k * 8, 1 + y * 3, -18 + row * 9 + (y % 2), 7, 3, 5, tones[(row * 4 + k + y) % tones.length]); // crushed wrecks
  }
  m.box(12, 1, -16, 3, 26, 3, 0xd8b03a); m.box(-2, 26, -16, 18, 2, 3, 0xd8b03a); m.box(12, 27, -16, 3, 3, 3, 0x3a3f46); // crane
  m.box(-1, 18, -15, 1, 8, 1, C.metalDark); carShell(m, -4, 13, -16, 0x2b4170, true);
  for (let k = 0; k < 3; k++) m.box(4 + k * 3, 1 + k, 4 - k, 8 - k * 2, 2, 6 - k, k % 2 ? RUST : C.metalDark); // a scrap heap
  m.walls(10, 1, 8, 9, 7, 7, 0x2f6b6b); m.box(9, 8, 7, 11, 1, 9, C.roofDark); m.box(12, 3, 14, 3, 2, 1, C.glassLit, true); // office hut
  return fin(m);
}

// ---------------------------------------------------------------- MAP-6: companions of places (one chunk each, SMALL_SCALE)

/** A playground beside a school: swings, a slide, a climbing frame, under snow. */
export function playground() {
  const m = new VoxelModel(); pad(m, -11, -11, 22, 22, 160);
  for (const x of [-9, -1]) m.box(x, 1, -6, 1, 9, 1, 0xc0392b); m.box(-9, 9, -6, 9, 1, 1, 0xc0392b);
  for (const x of [-7, -3]) { m.box(x, 4, -6, 1, 5, 1, C.metalDark); m.box(x - 1, 3, -7, 3, 1, 3, 0x2b4170); }
  for (let k = 0; k < 7; k++) m.box(3 + k, 8 - k, 2, 1, 1, 3, 0xd8b03a); m.box(2, 1, 2, 1, 8, 3, C.metal);
  for (let y = 1; y < 8; y += 3) m.box(-8, y, 4, 7, 1, 5, 0x2f6b6b); for (const [x, z] of [[-8, 4], [-2, 4], [-8, 8], [-2, 8]]) m.box(x, 1, z, 1, 7, 1, 0x2f6b6b);
  return fin(m);
}
/** A pharmacy beside a hospital: a small shop with a green cross. */
export function pharmacy() {
  const m = new VoxelModel();
  block(m, { x0: -9, z0: -8, w: 18, d: 15, floors: 2, wall: C.trim, seed: 161, shop: true });
  m.box(-2, 13, 7, 4, 2, 1, C.neonGreen, true); m.box(-1, 12, 7, 2, 4, 1, C.neonGreen, true);
  return fin(m);
}
/** An impound lot behind a police station: towed cars inside a chain fence. */
export function impound() {
  const m = new VoxelModel(); pad(m, -11, -11, 22, 22, 162);
  chainFence(m, -11, -11, 22, true); chainFence(m, -11, 10, 22, true, 7, [8, 14]); chainFence(m, -11, -11, 22, false); chainFence(m, 10, -11, 22, false);
  return fin(m);
}
/** A graveyard beside a church: rows of stones and a picket fence. */
export function graveyard() {
  const m = new VoxelModel(); pad(m, -11, -11, 22, 22, 163);
  for (let x = -11; x < 11; x++) for (const z of [-11, 10]) { if (x % 3 === 0) m.box(x, 1, z, 1, 6, 1, 0x2a2d31); m.set(x, 5, z, 0x2a2d31); if (x % 3 === 1) m.set(x, 6, z, 0x2a2d31); } // iron railings
  m.clearBox(-2, 1, 10, 4, 6, 1); m.box(-3, 1, 10, 1, 8, 1, 0x2a2d31); m.box(2, 1, 10, 1, 8, 1, 0x2a2d31); m.box(-2, 7, 10, 4, 1, 1, 0x2a2d31); // the gate
  for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) {
    const x = -8 + k * 5; const z = -7 + r * 6; const kind = Math.floor(hash3(r, k, 5) * 3); const h = 3 + Math.floor(hash3(r, k, 3) * 3);
    const stone = hash3(r, k, 7) < 0.5 ? 0x8a8f86 : 0xa8aaa4; const lean = hash3(r, k, 9) < 0.25 ? 1 : 0;
    if (kind === 0) { m.box(x, 1, z, 1, h + 2, 1, stone); m.box(x - 1, h, z, 3, 1, 1, stone); } // a cross
    else if (kind === 1) { m.box(x - 1, 1, z, 3, h, 1, stone); m.remove(x - 1, h, z); m.remove(x + 1, h, z); } // a rounded top
    else { m.box(x - 1, 1, z, 3, h - 1, 1, stone); m.box(x - 1 + lean, h - 1, z - lean, 3, 1, 1, stone); } // a leaning slab
    m.box(x - 1, 0, z + 1, 3, 1, 3, 0xd8dde2); // the grave under snow
  }
  m.box(8, 1, -9, 1, 12, 1, 0x4a3a2c); for (const [dx, y, dz] of [[1, 8, 0], [-1, 10, 1], [2, 11, -1], [0, 12, 1]]) m.box(8 + Math.min(0, dx), y, -9 + Math.min(0, dz), Math.abs(dx) + 1, 1, Math.abs(dz) + 1, 0x4a3a2c); // a bare tree
  return fin(m);
}
/** A roadside diner beside a gas station or motel: a long low box, a counter window, a DINER sign with dead letters. */
export function diner() {
  const m = new VoxelModel();
  block(m, { x0: -10, z0: -6, w: 20, d: 12, floors: 1, wall: 0xb8c4c8, trim: 0xc0392b, seed: 164, shop: true });
  neon(m, 'DINER', 0, 12, 6, C.neonPink, [1, 2, 4]);
  return fin(m);
}
/** An industrial water tower: a tank on four legs with a ladder. */
export function waterTower() {
  const m = new VoxelModel();
  for (const [x, z] of [[-5, -5], [4, -5], [-5, 4], [4, 4]]) m.box(x, 1, z, 1, 22, 1, C.metalDark);
  for (let y = 22; y < 32; y++) for (let a = 0; a < 40; a++) m.set(Math.round(Math.cos(a / 6.4) * 6), y, Math.round(Math.sin(a / 6.4) * 6), y % 3 ? 0x8fa3b8 : 0x6c7580);
  for (let k = 0; k <= 6; k++) m.box(-6 + k, 32 + Math.floor(k / 2), -6 + k, 13 - 2 * k, 1, 13 - 2 * k, C.roofDark);
  for (let y = 1; y < 22; y += 2) m.set(6, y, 0, C.metal);
  return fin(m);
}
/** A power substation: transformers behind a fence, insulator gantries (the reason the lights are out). */
export function substation() {
  const m = new VoxelModel(); pad(m, -11, -11, 22, 22, 165);
  chainFence(m, -11, -11, 22, true); chainFence(m, -11, 10, 22, true); chainFence(m, -11, -11, 22, false); chainFence(m, 10, -11, 22, false);
  for (const x of [-7, 1]) { m.box(x, 1, -4, 6, 6, 5, 0x6c7580); for (let k = 0; k < 3; k++) m.box(x + 1 + k * 2, 7, -2, 1, 3, 1, 0xd8d2c2); }
  for (const z of [-8, 6]) { m.box(-9, 1, z, 1, 14, 1, C.metalDark); m.box(8, 1, z, 1, 14, 1, C.metalDark); m.box(-9, 14, z, 18, 1, 1, C.metalDark); }
  m.box(-3, 1, 5, 6, 2, 3, 0x1c1f24); // a burnt-out transformer
  return fin(m);
}


// ---------------------------------------------------------------- MAP-8: place grounds and stories (one chunk each, SMALL_SCALE)

/**
 * VOXEL-2 lots: asphalt with snow drifted along the edges (a ragged band), a cleared lane, faded bay lines, oil stains
 * and packed tyre tracks — no checkerboard.
 */
function lotGround(m, seed, lines = true) {
  for (let x = -12; x < 12; x++) for (let z = -12; z < 12; z++) {
    const edge = Math.min(12 + x, 11 - x, 12 + z, 11 - z);
    const drift = 2 + hash3(x >> 1, seed, z >> 1) * 2.5 + (hash3(x, seed + 1, z) < 0.15 ? 1 : 0);
    let c = edge < drift ? P.snow : C.asphalt;
    if (c === C.asphalt) {
      if (lines && (x + 12) % 6 === 0 && z > -7 && z < 3 && hash3(x, seed + 2, z) < 0.7) c = 0xa9adb2; // faded bay lines
      else if (hash3(x >> 1, seed + 3, z >> 1) < 0.04) c = 0x1e2024; // oil
      else if ((Math.abs(z - 6) === 1 || Math.abs(z - 6) === 3) && hash3(x, seed + 4, z) < 0.8) c = 0x8a8f96; // packed tracks along the lane
      else if (hash3(x, seed + 5, z) < 0.05) c = 0x34373d;
    }
    m.set(x, 0, z, c);
  }
}
/** VOXEL-2: a gravel yard: drifts along the edges, mottled stone, a few snow specks (no checkerboard). */
function gravel(x, z, edge) { return edge < 2 + hash3(x >> 1, 181, z >> 1) * 2 ? P.snow : hash3(x, 183, z) < 0.1 ? P.snow : hash3(x >> 1, 185, z >> 1) < 0.35 ? 0x5a5448 : 0x6a6458; }
function snowGround(m) { for (let x = -12; x < 12; x++) for (let z = -12; z < 12; z++) m.set(x, 0, z, P.snow); }
/** A box truck facing +z: a ribbed body, a cab with a windscreen, mirrors, lights, a grille and a plate, wheels with hubs. */
function truck(m, x, z, body, cab, len = 14) {
  m.box(x, 2, z, 7, 8, len, body); for (let k = 1; k < len; k += 3) for (const sx of [x, x + 6]) m.box(sx, 2, z + k, 1, 8, 1, shadeOf(body, 0.88)); // ribs
  m.box(x, 2, z + len, 7, 6, 4, cab); m.box(x + 1, 5, z + len + 3, 5, 2, 1, C.glass); m.box(x, 7, z + len, 7, 1, 4, shadeOf(cab, 0.85));
  m.box(x + 1, 2, z + len + 4, 5, 2, 1, 0x2a2d31); m.set(x, 3, z + len + 4, 0xfff2c0); m.set(x + 6, 3, z + len + 4, 0xfff2c0); m.box(x + 2, 1, z + len + 4, 3, 1, 1, 0xd8d2c2); // grille, lights, plate
  m.set(x - 1, 6, z + len + 2, C.metalDark); m.set(x + 7, 6, z + len + 2, C.metalDark); // mirrors
  for (const dz of [1, len - 3, len + 1]) for (const dx of [-1, 7]) { m.box(x + dx, 0, z + dz, 1, 3, 3, 0x1c1f24); m.set(x + dx, 1, z + dz + 1, 0x8e979f); } // wheels with hubs
}
/** A slatted pallet (4×4), optionally with a load of sacks or boxes. */
function pallet(m, x, z, load = 0) {
  for (let k = 0; k < 4; k += 3) m.box(x, 1, z + k, 4, 1, 1, 0x6a4a2a);
  for (let k = 0; k < 4; k++) m.box(x + k, 2, z, 1, 1, 4, k % 2 ? 0x9a7046 : 0x8a6038);
  if (load === 1) for (let k = 0; k < 2; k++) m.box(x, 3 + k, z, 4, 1, 4, k ? 0xd8c08a : 0xc8b07a);
  if (load === 2) { m.box(x, 3, z, 4, 3, 4, 0xa07a4a); m.box(x, 4, z, 4, 1, 4, 0x8a6a40); }
}
/** A planked crate (s×s×s) with darker corner irons. */
function crate(m, x, y, z, s = 3) {
  m.box(x, y, z, s, s, s, (vx, vy, vz) => ((vx === x || vx === x + s - 1) && (vz === z || vz === z + s - 1) ? 0x4b525a : (vy - y) % 2 ? 0xa07a4a : 0x8a6a40));
}
/** A rounded sandbag 4 long along x (ends trimmed). */
function sack(m, x, y, z) { m.box(x, y, z, 4, 2, 2, (vx, vy) => (vx === x || vx === x + 3) && vy === y + 1 ? null : 0x938466); }
const shadeOf = (hex, k) => { const r = Math.min(255, ((hex >> 16) & 255) * k) | 0; const g = Math.min(255, ((hex >> 8) & 255) * k) | 0; const b = Math.min(255, (hex & 255) * k) | 0; return (r << 16) | (g << 8) | b; };
function tent(m, x, z, w, d, color, cross = false) {
  for (let k = 0; k < 5; k++) m.box(x + k, 1 + k, z, w - 2 * k, 1, d, (vx, vy, vz) => ((vz - z) % 4 === 0 ? shadeOf(color, 0.9) : color)); // canvas, sagging seams
  for (const dz of [-1, d]) { m.box(x + Math.floor(w / 2), 1, z + dz, 1, 6, 1, 0x5a4030); m.set(x - 1, 1, z + dz, 0x5a4030); m.set(x + w, 1, z + dz, 0x5a4030); } // poles and pegs
  for (let k = 1; k < 4; k++) { m.set(x - 1 + Math.floor(k / 2), k, z - 1, 0xc8c0a8); m.set(x + w - Math.floor(k / 2), k, z + d, 0xc8c0a8); } // guy ropes
  if (cross) { m.box(x + Math.floor(w / 2) - 1, 6, z + Math.floor(d / 2) - 2, 2, 1, 5, C.red); m.box(x + Math.floor(w / 2) - 3, 6, z + Math.floor(d / 2) - 1, 6, 1, 2, C.red); }
}

/** One chunk of a place's grounds or of its story. */
export function groundsPiece(kind) {
  const m = new VoxelModel();
  switch (kind) {
    case 'lot': { // a car park: snowed cars, a trolley
      lotGround(m, 171);
      m.box(7, 1, 6, 3, 2, 2, C.metal); m.box(7, 3, 6, 1, 2, 2, C.metalDark);
      break;
    }
    case 'dock': { // a loading dock with a delivery truck backed up to it, pallets
      lotGround(m, 172, false);
      m.box(-12, 1, -12, 24, 4, 5, C.grey); for (let x = -10; x < 12; x += 6) m.box(x, 2, -7, 2, 2, 1, 0x1c1f24);
      truck(m, -9, -6, 0xe8e4d8, 0xa63a2e, 12); m.box(-8, 5, -6, 5, 3, 1, 0x2b4170);
      for (const [x, z, l] of [[4, -4, 1], [5, 2, 2], [8, -2, 0]]) pallet(m, x, z, l);
      break;
    }
    case 'tow': { // a tow truck with a car on its hook
      lotGround(m, 173, false);
      m.box(-4, 1, -11, 7, 6, 5, 0xd8b03a); m.box(-4, 5, -7, 7, 2, 1, C.glass); m.box(-4, 1, -6, 7, 3, 9, C.metal);
      m.box(-1, 4, -1, 1, 5, 1, C.metalDark); m.box(-1, 8, 0, 1, 1, 5, C.metalDark);
      break;
    }
    case 'triage': { // a field clinic in the car park, overrun: one tent standing, one down, gurneys, tape
      lotGround(m, 174, false);
      tent(m, -11, -11, 12, 9, 0xe8e4d8, true);
      m.box(1, 1, -10, 10, 1, 8, 0xd8d2c2); m.box(4, 2, -8, 3, 1, 2, C.red); // a collapsed tent
      for (const [x, z] of [[-9, 3], [-3, 4], [4, 2]]) { m.box(x, 1, z, 2, 2, 5, C.metal); m.box(x, 3, z, 2, 1, 5, 0xf0f0ea); }
      for (let x = -12; x < 12; x += 4) { m.box(x, 1, 10, 1, 3, 1, C.metalDark); m.box(x, 3, 10, 4, 1, 1, 0xd8b03a); }
      break;
    }
    case 'busloop': { // a bus loop with a school bus and a flagpole
      for (let x = -12; x < 12; x++) for (let z = -12; z < 12; z++) m.set(x, 0, z, Math.abs(z) < 5 || Math.abs(x) > 8 ? C.asphalt : P.snow);
      for (const x of [-9, 1]) { m.box(x, 1, -10, 1, 7, 1, C.metalDark); m.box(x + 7, 1, -10, 1, 7, 1, C.metalDark); } m.box(-10, 8, -11, 19, 1, 4, 0x2f6b4a); m.box(-9, 1, -11, 16, 6, 1, 0x9fb8c8); m.box(-8, 2, -9, 14, 1, 2, 0x7a5a3a); // a bus shelter
      for (let x = -11; x < 11; x += 3) m.set(x, 0, 2, 0xd8b03a); // the bus bay
      m.box(9, 1, 9, 1, 18, 1, C.metal); m.box(5, 15, 9, 4, 3, 1, 0x2b4170);
      break;
    }
    case 'schoolyard': { // a school yard: court markings, a hoop, hopscotch
      for (let x = -12; x < 12; x++) for (let z = -12; z < 12; z++) { const line = (Math.abs(x) === 10 || Math.abs(z) === 10 || z === 0) && Math.abs(x) <= 10 && Math.abs(z) <= 10; m.set(x, 0, z, line ? C.paint : hash3(x >> 2, 175, z >> 2) < 0.5 ? P.snow : C.tile); }
      m.box(0, 1, -11, 1, 11, 1, C.metal); m.box(-2, 10, -10, 5, 4, 1, 0xf0f0ea); m.box(0, 9, -9, 1, 1, 2, 0xd04a3a);
      for (let k = 0; k < 4; k++) m.box(-8, 0, 4 + k * 2, 2, 1, 1, 0xd8b03a);
      break;
    }
    case 'garden': { // a reading garden: hedges, a path, benches, a bird bath
      snowGround(m);
      for (let x = -12; x < 12; x++) { m.set(x, 0, 0, 0xccd3db); m.set(0, 0, x, 0xccd3db); }
      for (const [x, z, w, d] of [[-11, -11, 9, 3], [3, -11, 9, 3], [-11, 8, 9, 3], [3, 8, 9, 3]]) for (let u = 0; u < w; u++) { const h = 2 + Math.floor(hash3(x + u, z, 3) * 3); m.box(x + u, 1, z, 1, h, d, hash3(x + u, z, 5) < 0.5 ? 0x3a5a3a : 0x2f4a30); m.box(x + u, 1 + h, z, 1, 1, d, P.snow); }
      for (const [x, z] of [[-8, -4], [4, 2]]) { m.box(x, 2, z, 5, 1, 2, 0x7a5a3a); m.box(x, 3, z - 1, 5, 2, 1, 0x7a5a3a); m.box(x, 1, z, 1, 1, 2, C.metalDark); m.box(x + 4, 1, z, 1, 1, 2, C.metalDark); }
      m.box(-1, 1, -1, 2, 3, 2, C.grey); m.box(-2, 4, -2, 4, 1, 4, C.grey);
      break;
    }
    case 'convoy': { // an army convoy and a floodlight tower
      snowGround(m);
      for (const [x, z] of [[-11, -11], [-2, -11]]) truck(m, x, z, 0x46512b, 0x5d6b3a, 12);
      m.box(5, 1, 4, 6, 4, 9, 0x5d6b3a); m.box(5, 5, 4, 6, 1, 3, C.glass);
      m.box(-9, 1, 6, 1, 20, 1, C.metalDark); m.box(-11, 20, 5, 5, 2, 3, C.metalDark); m.box(-11, 20, 8, 5, 2, 1, 0xfff2c0, true);
      break;
    }
    case 'siding': { // a rail siding: a short track, a box wagon, a buffer stop
      snowGround(m);
      for (let z = -12; z < 12; z += 2) m.box(-6, 0, z, 12, 1, 1, 0x5a4a3a);
      for (const x of [-3, 2]) m.box(x, 1, -12, 1, 1, 24, C.metal);
      m.box(-5, 2, -10, 10, 9, 16, RUST); m.box(-5, 3, -3, 10, 6, 1, 0x7a3a22);
      m.box(-4, 1, 9, 8, 4, 2, C.red);
      break;
    }
    case 'truckyard': { // a semi-trailer, pallets, a forklift
      lotGround(m, 176, false);
      m.box(-11, 2, -10, 7, 8, 20, 0xe0dcd2); for (const z of [-8, 6]) m.box(-12, 0, z, 9, 2, 2, 0x1c1f24);
      for (const [x, z, l] of [[1, -9, 2], [1, -4, 1], [6, -9, 0]]) pallet(m, x, z, l);
      m.box(2, 1, 4, 5, 4, 6, 0xd8b03a); m.box(2, 5, 4, 1, 6, 1, C.metalDark); m.box(6, 5, 4, 1, 6, 1, C.metalDark); m.box(2, 11, 4, 5, 1, 6, C.metalDark); m.box(3, 1, 10, 3, 1, 3, C.metalDark);
      break;
    }
    case 'logs': { // a log trailer and stacked trunks
      snowGround(m);
      m.box(-11, 2, -11, 8, 1, 20, C.metalDark); for (const z of [-9, 5]) m.box(-12, 0, z, 10, 2, 2, 0x1c1f24);
      for (let k = 0; k < 5; k++) m.box(-11 + (k % 3) * 3 - (k > 2 ? -1 : 0), 3 + (k > 2 ? 2 : 0), -11, 2, 2, 20, (x, y, z) => (z === -11 || z === 8 ? 0xb08a5a : 0x6a4a30));
      for (let y = 0; y < 3; y++) for (let k = 0; k < 4 - y; k++) m.box(1 + k * 3 + y, 1 + y * 2, -6, 2, 2, 14, (x, yy, z) => (z === -6 || z === 7 ? 0xb08a5a : 0x5a3e28));
      break;
    }
    case 'wrecks': { // wrecks along the fence, stacked two high
      for (let x = -12; x < 12; x++) for (let z = -12; z < 12; z++) m.set(x, 0, z, gravel(x, z, Math.min(x + 12, 11 - x, z + 12, 11 - z)));
      [RUST, 0x6c7580, 0xa63a2e, 0x2b4170].forEach((c, k) => { m.box(-11 + (k % 2) * 11, 1 + Math.floor(k / 2) * 3, -10 + (k % 2), 10, 3, 5, c); });
      m.box(-6, 1, 2, 8, 3, 5, 0x5d6b3a); m.box(4, 1, 4, 5, 1, 5, 0x1c1f24);
      break;
    }
    case 'foodvan': { // an overturned food van, spilled crates
      lotGround(m, 178);
      m.box(-9, 1, -4, 14, 6, 6, 0xf0f0ea); m.box(-9, 4, -4, 14, 1, 6, 0xc0392b); m.box(-9, 1, -4, 14, 6, 1, 0xdcd6c8); m.box(5, 1, -4, 4, 5, 6, 0xd8d2c2);
      for (const [x, z] of [[-6, 4], [3, 3]]) crate(m, x, 1, z); for (const [x, z, c] of [[-1, 6, 0xd8b03a], [7, 7, 0x86b04a]]) m.box(x, 1, z, 3, 2, 2, c);
      break;
    }
    case 'laststand': { // a last stand: a sandbag arc, a burnt cruiser, spent casings
      lotGround(m, 179, false);
      for (let a = 0; a < 10; a++) { const x = Math.round(Math.cos(a / 3.2) * 6) - 4; const z = Math.round(Math.sin(a / 3.2) * 4) - 5; sack(m, x, 1, z); sack(m, x + (a % 2) * 2 - 1, 3, z); }
      for (let k = 0; k < 9; k++) m.set(-6 + Math.floor(hash3(k, 1, 2) * 8), 1, -2 + Math.floor(hash3(k, 3, 4) * 6), 0xc9a040);
      break;
    }
    case 'shelter': { // a shelter by the door: cots and blankets under a lean-to, a painted SAFE board
      for (let x = -12; x < 12; x++) for (let z = -12; z < 12; z++) m.set(x, 0, z, C.tile);
      m.box(-11, 1, -11, 1, 9, 1, 0x5a4030); m.box(10, 1, -11, 1, 9, 1, 0x5a4030); m.box(-12, 9, -12, 24, 1, 10, C.roofDark);
      for (let k = 0; k < 4; k++) { m.box(-10 + k * 5, 1, -9, 4, 2, 7, C.metalDark); m.box(-10 + k * 5, 3, -9, 4, 1, 7, [0x7a2a2a, 0x2b4170, 0x5d6b3a, 0x8a6a44][k]); }
      m.box(-7, 1, 6, 1, 8, 1, 0x5a4030); m.box(6, 1, 6, 1, 8, 1, 0x5a4030); m.box(-8, 5, 7, 16, 7, 1, 0xf0f0ea); paint(m, 'SAFE', 0, 6, 8, C.red);
      break;
    }
    case 'looted': { // a looted shopfront: a car through the window, glass and goods on the snow
      lotGround(m, 180, false);
      m.box(-12, 1, -12, 24, 12, 2, C.cream); m.clearBox(-6, 1, -11, 12, 8, 1); m.box(-6, 9, -11, 12, 1, 1, C.trim);
      for (let k = 0; k < 14; k++) m.set(-10 + Math.floor(hash3(k, 5, 6) * 20), 1, -5 + Math.floor(hash3(k, 7, 8) * 12), k % 2 ? 0xbcd8e8 : [0xd8b03a, 0xa07a4a, 0x86b04a, 0xc0392b][k % 4]);
      break;
    }
    default: snowGround(m);
  }
  return fin(m);
}

/** MAP-8: a name board at the kerb (0.1 world per voxel): a dark board on two posts, painted (or lit) letters. */
export function nameBoard(text, lit = false) {
  const m = new VoxelModel();
  const w = text.length * 4 + 5; const x0 = -Math.ceil(w / 2);
  for (const x of [x0 + 1, x0 + w - 2]) m.box(x, 0, 0, 1, 12, 1, C.metalDark);
  m.box(x0, 11, 0, w, 9, 1, 0x1e2126);
  for (let x = x0; x < x0 + w; x++) { m.set(x, 11, 1, 0x6c7580); m.set(x, 19, 1, 0x6c7580); } for (const x of [x0, x0 + w - 1]) m.box(x, 11, 1, 1, 9, 1, 0x6c7580); // a border
  for (const [x, y] of [[x0 + 1, 12], [x0 + w - 2, 12], [x0 + 1, 18], [x0 + w - 2, 18]]) m.set(x, y, 1, 0xb0b8c0); // bolts
  if (lit) neon(m, text, 0, 13, 0, C.neonWarm); else paint(m, text, 0, 13, 1, 0xd8d2c2);
  return m.snowCap(P.snow, 1, 2);
}
/** MAP-8: a direction sign (0.1 world per voxel): a pole with a green board, a place name and an arrow (local +x). */
export function placeSign(text) {
  const m = new VoxelModel();
  const w = text.length * 4 + 7;
  m.box(-1, 0, 0, 1, 26, 1, C.metalDark);
  m.box(0, 19, 0, w, 8, 1, 0x2f6b4a); paint(m, `${text}>`, Math.floor(w / 2), 21, 1, 0xf0f0ea);
  for (let x = 0; x < w; x++) { m.set(x, 19, 1, 0xd8e0d8); m.set(x, 26, 1, 0xd8e0d8); } m.box(0, 19, 1, 1, 8, 1, 0xd8e0d8); m.box(w - 1, 19, 1, 1, 8, 1, 0xd8e0d8); // a white border
  m.box(-1, 20, 1, 1, 1, 1, 0xb0b8c0); m.box(-1, 25, 1, 1, 1, 1, 0xb0b8c0); // clamps
  return m.snowCap(P.snow, 1, 2);
}
/** MAP-8: a generator by a place that still has light: a housing, an exhaust, a fuel can. */
export function generatorModel() {
  const m = new VoxelModel();
  m.box(-4, 0, -3, 8, 1, 6, 0x2a2d31); m.box(-4, 1, -3, 8, 4, 6, 0x5d6b3a); m.box(-3, 5, -2, 6, 1, 4, 0x46512b); // skid, housing, lid
  for (let x = -3; x < 3; x += 2) m.box(x, 2, 3, 1, 2, 1, 0x2a2d31); // vents
  m.box(1, 2, -4, 2, 2, 1, 0x1c1f24); m.set(1, 3, -5, 0xff9a3c, true); m.set(2, 3, -5, 0x86ffa2, true); // panel with two lamps
  m.box(2, 5, 0, 1, 4, 1, 0x2a2d31); m.box(2, 9, 0, 2, 1, 1, 0x2a2d31); // exhaust
  m.box(5, 0, -2, 2, 3, 2, C.red); m.set(5, 3, -2, 0x2a2d31); // fuel can
  m.box(-7, 0, -1, 2, 3, 3, 0xd8b03a); m.box(-7, 1, 0, 2, 1, 1, 0x1c1f24); // cable reel
  return m.snowCap(P.snow, 1, 2);
}
