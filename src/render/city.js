// UI-13 part C (take 2): the town's buildings as a city diorama — our own models, built at full voxel
// resolution (1 voxel = 0.3 world units): hollow concrete shells with floor ledges, framed windows (lit, dark,
// boarded), shopfronts with awnings and shutters, balconies, drainpipes, wall and roof AC units, a stair hut,
// a water tank, moss, graffiti, neon signs with a dead letter, and a light dusting of snow on top.
// Front (door side) faces +z; the board turns each model so its front faces a side the camera sees.
import { VoxelModel, hash3 } from './voxel.js';
import { P } from './palette.js';
import { refineCity, tagMaterial } from './detail.js';

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

// 3×5 pixel font, drawn at scale 2 (6×10 voxels a letter).
const GLYPH = {
  A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'], C: ['011', '100', '100', '100', '011'],
  E: ['111', '100', '110', '100', '111'], G: ['011', '100', '101', '101', '011'], H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'], K: ['101', '110', '100', '110', '101'], L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'], O: ['010', '101', '101', '101', '010'], P: ['110', '101', '110', '100', '100'],
  R: ['110', '101', '110', '101', '101'], S: ['011', '100', '010', '001', '110'], T: ['111', '010', '010', '010', '010'],
};

/** Neon letters on a dark board on the front plane z, centred on cx, bottom at y. Letter `dead` is unlit. */
export function neon(m, text, cx, y, z, color, dead = -1, k = 1) {
  const w = text.length * 4 * k - k;
  const x0 = Math.round(cx - w / 2);
  m.box(x0 - 2, y - 2, z, w + 4, 5 * k + 4, 1, 0x1e2126);
  [...text].forEach((ch, i) => {
    const g = GLYPH[ch]; if (!g) return;
    g.forEach((row, r) => [...row].forEach((bit, c) => {
      if (bit !== '1') return;
      m.box(x0 + (i * 4 + c) * k, y + (4 - r) * k, z + 1, k, k, 1, i === dead ? 0x4a3a3c : color, i !== dead);
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
      const lit = r < 0.28; const boarded = r > 0.9; const broken = r > 0.8 && !boarded;
      for (let y = yb; y < yb + 5; y++) m.set(x, y, z, boarded ? C.board : broken ? 0x15191e : lit ? C.glassLit : C.glass, lit);
      m.set(x + ox, yb - 1, z + oz, trim); // sill
      if (slot === 1) m.set(x + ox, yb + 5, z + oz, trim); // lintel
      if (boarded && slot === 1) m.set(x + ox, yb + 2, z + oz, C.board);
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
  for (let x = x0 + 2; x < x0 + w - 2; x++) {
    const bay = Math.floor((x - x0 - 2) / 7);
    const shutter = hash3(bay, 1, seed) < 0.35;
    for (let y = 2; y < 7; y++) m.set(x, y, z, shutter ? (y % 2 ? C.metal : C.metalDark) : (hash3(x, y, seed) < 0.08 ? 0x15191e : C.glass));
    if ((x - x0 - 2) % 7 === 0) for (let y = 1; y < 8; y++) m.set(x, y, z + 1, C.trim);
  }
  m.box(x0 + 1, 7, z + 1, w - 2, 1, 1, C.trim);
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
    let c = (x - x0) % 5 === 0 || (z - z0) % 5 === 0 ? C.tileLine : C.tile;
    if (edge) c = C.trim;
    if (hash3(Math.floor(x / 4), seed, Math.floor(z / 4)) > 0.93) c = C.moss;
    if (hash3(x, 7, z) < 0.18) c = P.snow;
    m.set(x, 0, z, c);
  }
}

function graffiti(m, x, y, z, seed) {
  const cols = [C.neonPink, C.neonGreen, C.neonBlue, 0xf0f0f0];
  for (let i = 0; i < 9; i++) for (let j = 0; j < 3; j++) if (hash3(i, j, seed) < 0.55) m.set(x + i, y + j, z, cols[(i + seed) % 4]);
}

function dust(m) { return m.snowCap(P.snow, 0.7, 2); }

// ---------------------------------------------------------------- the six places

export function policeStation() {
  const m = new VoxelModel(); const w = 40; const d = 26;
  pad(m, -4, -4, w + 8, d + 14, 1);
  block(m, { w, d, floors: 2, wall: C.grey, seed: 11 });
  m.clearBox(16, 1, d - 1, 8, 7, 1); m.box(16, 1, d - 1, 8, 7, 1, C.glass); // glass doors
  m.box(14, 8, d, 12, 1, 3, C.trim); // entrance canopy
  neon(m, 'POLICE', 20, 12, d, C.neonBlue, 3);
  m.box(6, 21, 10, 3, 2, 3, 0xff3b3b, true); m.box(9, 21, 10, 3, 2, 3, 0x3b7bff, true); // light bar on the roof
  // Cruiser at the kerb.
  m.box(26, 1, d + 4, 12, 3, 6, P.white); m.box(29, 4, d + 4, 6, 2, 6, 0x1d2840);
  m.box(31, 6, d + 6, 2, 1, 2, 0xff3b3b, true);
  for (const [x, z] of [[27, d + 3], [35, d + 3], [27, d + 9], [35, d + 9]]) m.box(x, 0, z, 2, 2, 1, 0x15171a);
  for (let x = 2; x < 12; x += 3) m.box(x, 1, d + 6, 2, 3, 1, (x / 3) % 2 ? 0xe8b830 : C.trim); // barriers
  return dust(m);
}

export function groceryStore() {
  const m = new VoxelModel(); const w = 42; const d = 24;
  pad(m, -4, -4, w + 8, d + 14, 2);
  block(m, { w, d, floors: 2, wall: C.cream, trim: C.creamDark, seed: 22, shop: true });
  m.clearBox(18, 1, d - 1, 5, 6, 1); // open door
  // Striped awnings over the shop bays.
  for (let x = 1; x < w - 1; x++) for (let k = 0; k < 3; k++) m.set(x, 9 - k, d + k, Math.floor(x / 3) % 2 ? C.red : C.trim);
  neon(m, 'MART', 21, 12, d, C.neonGreen, 2);
  for (const [x, z] of [[3, d + 5], [6, d + 6], [34, d + 5]]) m.box(x, 1, z, 3, 3, 3, 0x8a5a2b); // crates
  for (const [x, z] of [[10, d + 6], [12, d + 7]]) m.box(x, 1, z, 2, 4, 2, 0x2f5fa8); // barrels
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
  return dust(m);
}

export function hospital() {
  const m = new VoxelModel(); const w = 34; const d = 28;
  pad(m, -16, -4, w + 20, d + 14, 4);
  block(m, { w, d, floors: 5, wall: C.sage, trim: C.trim, seed: 44, balconies: true });
  // ER wing on the left, one floor.
  block(m, { x0: -12, z0: 8, w: 12, d: 20, floors: 1, wall: C.sageDark, seed: 45 });
  m.box(-11, 1, 27, 8, 6, 1, C.glass);
  neon(m, 'ER', -6, 12, 27, C.neonRed, -1);
  // Red cross on the façade.
  m.box(15, 34, d, 4, 12, 1, C.neonRed, true); m.box(11, 38, d, 12, 4, 1, C.neonRed, true);
  // Ambulance in the bay.
  m.box(-12, 1, d + 4, 12, 7, 6, P.white); m.box(-12, 8, d + 4, 3, 1, 6, 0xff3b3b, true);
  m.box(-8, 3, d + 4, 7, 2, 1, C.red); m.box(-8, 3, d + 9, 7, 2, 1, C.red);
  return dust(m);
}

export function library() {
  const m = new VoxelModel(); const w = 40; const d = 26;
  pad(m, -4, -4, w + 8, d + 14, 5);
  block(m, { w, d, floors: 3, wall: C.cream, trim: C.creamDark, seed: 55 });
  // Columns and steps across the front.
  for (let x = 3; x < w - 2; x += 7) m.box(x, 1, d, 3, 19, 3, C.trim);
  m.box(0, 20, d, w, 2, 4, C.creamDark);
  m.box(2, 1, d + 3, w - 4, 1, 3, C.greyDark);
  neon(m, 'BOOKS', 20, 23, d + 3, C.neonWarm, 4);
  // Collapsed back corner: floors open to the sky, rubble spilling out.
  m.clearBox(22, 12, 0, 18, 22, 13);
  m.box(22, FH, 0, 18, 1, 13, C.roofDark);
  for (let i = 0; i < 70; i++) {
    const x = 20 + Math.floor(hash3(i, 1, 5) * 22); const z = -6 + Math.floor(hash3(i, 3, 5) * 10);
    const h = 1 + Math.floor(hash3(i, 2, 5) * 3);
    m.box(x, 1, z, 2, h, 2, hash3(i, 4, 5) < 0.5 ? C.cream : C.greyDark);
  }
  for (let x = 22; x < 40; x += 3) m.box(x, FH + 1, 12, 1, 4 + Math.floor(hash3(x, 1, 1) * 6), 1, C.creamDark); // broken wall stubs
  return dust(m);
}

export function gasStation() {
  const m = new VoxelModel(); const w = 44; const d = 30;
  for (let x = -2; x < w + 2; x++) for (let z = -2; z < d + 4; z++) m.set(x, 0, z, (x + z) % 9 === 0 ? 0x3a3e44 : C.asphalt);
  // Kiosk at the back.
  block(m, { x0: 1, z0: 0, w: 18, d: 12, floors: 1, wall: C.ochre, trim: C.trim, seed: 66, shop: true });
  // Canopy on four posts, two pump islands.
  for (const [x, z] of [[24, 6], [41, 6], [24, 24], [41, 24]]) m.box(x, 1, z, 2, 12, 2, C.trim);
  m.box(22, 13, 4, 22, 2, 23, C.trim); m.box(22, 12, 4, 22, 1, 1, C.red); m.box(22, 12, 26, 22, 1, 1, C.red);
  m.box(22, 12, 4, 1, 1, 23, C.red); m.box(43, 12, 4, 1, 1, 23, C.red);
  for (const x of [29, 36]) {
    m.box(x - 1, 1, 13, 4, 1, 5, C.trim);
    m.box(x, 2, 14, 2, 6, 3, C.red); m.box(x, 6, 17, 2, 1, 1, C.glassLit, true);
  }
  // Tall price sign with a flickering letter.
  m.box(8, 1, d, 2, 18, 2, C.metalDark);
  neon(m, 'GAS', 9, 19, d, C.neonRed, 1, 2);
  m.box(26, 1, d - 2, 10, 3, 5, 0xd8b03a); // abandoned taxi
  m.box(28, 4, d - 2, 5, 2, 5, 0xd8b03a); m.box(28, 4, d + 2, 5, 2, 1, C.glass);
  return dust(m);
}

// ---------------------------------------------------------------- the colony and the filler blocks

/** The colony: a square wall of stacked shipping containers, barricaded gates, the bonfire, huts, tents and a watch post. */
export function colony(R = 30) {
  const m = new VoxelModel();
  const gate = 6;
  const container = (x0, y0, z0, len, alongX, color) => {
    for (let t = 0; t < len; t++) for (let y = 0; y < 8; y++) for (let k = 0; k < 7; k++) {
      const x = alongX ? x0 + t : x0 + k; const z = alongX ? z0 + k : z0 + t;
      const rib = t % 2 === 0 && (k === 0 || k === 6);
      m.set(x, y0 + y, z, t === 0 || t === len - 1 ? 0x1c1f24 : rib ? color : (color & 0xfefefe) >> 1 | (color & 0x808080));
    }
  };
  for (const s of [-1, 1]) {
    for (const [a, b] of [[-R, -gate - 1], [gate + 1, R]]) {
      let t = a; let i = 0;
      while (t < b) {
        const len = Math.min(16, b - t);
        const col = C.cont[(i + (s > 0 ? 1 : 0)) % 3];
        container(t, 1, s > 0 ? R - 6 : -R, len, true, col);
        container(s > 0 ? R - 6 : -R, 1, t, len, false, C.cont[(i + 2) % 3]);
        if (hash3(i, s, 3) > 0.45) container(t + 2, 9, s > 0 ? R - 6 : -R, Math.max(4, len - 4), true, C.cont[(i + 1) % 3]);
        t += len; i++;
      }
    }
    // Gates: crossed planks between two posts with torches.
    for (const [gx, gz, alongX] of [[0, s * (R - 3), true], [s * (R - 3), 0, false]]) {
      for (const k of [-gate, gate]) {
        const x = alongX ? gx + k : gx; const z = alongX ? gz : gz + k;
        m.box(x, 1, z, 1, 12, 1, P.woodDark); m.set(x, 13, z, P.fire, true);
      }
      for (let k = -gate + 1; k < gate; k++) {
        const x = alongX ? gx + k : gx; const z = alongX ? gz : gz + k;
        if ((k + gate) % 3 !== 0) { m.set(x, 3, z, P.wood); m.set(x, 6, z, P.wood); }
      }
    }
  }
  // Packed-snow yard with a melted ring around the fire.
  for (let x = -R + 7; x < R - 6; x++) for (let z = -R + 7; z < R - 6; z++) {
    const r2 = x * x + z * z;
    m.set(x, 0, z, r2 <= 20 ? P.dirt : r2 <= 49 ? 0x9aa6b6 : hash3(x, 1, z) < 0.1 ? P.snowShade : P.snow);
  }
  for (let a = 0; a < 360; a += 24) { const r = (a * Math.PI) / 180; m.box(Math.round(Math.cos(r) * 4), 1, Math.round(Math.sin(r) * 4), 1, 1, 1, P.rockLight); }
  m.box(-2, 1, 0, 5, 1, 1, P.woodDark); m.box(0, 1, -2, 1, 1, 5, P.woodDark);
  // Huts from half containers, lit windows, stovepipes.
  const hut = (x0, z0, c) => {
    container(x0, 1, z0, 12, true, c);
    m.box(x0 + 3, 4, z0 + 7, 2, 2, 1, P.window, true); m.box(x0 + 7, 1, z0 + 7, 2, 6, 1, P.woodDark);
    m.box(x0 + 9, 9, z0 + 2, 1, 4, 1, P.rock);
  };
  hut(-20, -21, C.cont[0]); hut(8, -21, C.cont[1]); hut(-20, 12, C.cont[2]);
  for (const [x, z, c] of [[12, 13, 0x5b6f8a], [-4, -22, 0x7a5b4a]]) {
    for (let k = 0; k < 4; k++) m.box(x - 4 + k, 1 + k, z, 9 - 2 * k, 1, 6, c);
  }
  // Watch post in the far corner.
  const wx = R - 14; const wz = -R + 8;
  for (const [dx, dz] of [[0, 0], [5, 0], [0, 5], [5, 5]]) m.box(wx + dx, 1, wz + dz, 1, 16, 1, P.woodDark);
  m.box(wx - 1, 17, wz - 1, 8, 1, 8, P.wood); m.walls(wx - 1, 18, wz - 1, 8, 2, 8, P.woodLight); m.set(wx + 2, 20, wz + 2, P.fire, true);
  for (const [x, z] of [[8, -6], [10, -6], [8, -4]]) m.box(x, 1, z, 2, 2, 2, 0x8a5a2b);
  return m.snowCap(P.snow, 0.8, 2);
}

/** Filler block: a fenced parking lot with painted bays and a couple of wrecks. */
export function parkingLot() {
  const m = new VoxelModel(); const w = 56; const d = 48;
  for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) {
    let c = C.asphalt;
    if ((x % 9 === 0 && (z < 14 || z > d - 15)) || (z === 14 || z === d - 15)) c = C.paint;
    if (hash3(x, 3, z) < 0.15) c = P.snow;
    m.set(x, 0, z, c);
  }
  for (let x = 0; x < w; x++) { m.set(x, 1, 0, C.metalDark); m.set(x, 1, d - 1, C.metalDark); if (x % 4 === 0) { m.box(x, 1, 0, 1, 5, 1, C.metal); m.box(x, 1, d - 1, 1, 5, 1, C.metal); } m.set(x, 4, 0, C.metal); m.set(x, 4, d - 1, C.metal); }
  for (let z = 0; z < d; z++) if (z < 18 || z > 30) { m.set(0, 1, z, C.metalDark); if (z % 4 === 0) m.box(0, 1, z, 1, 5, 1, C.metal); m.set(0, 4, z, C.metal); }
  const car = (x, z, c) => { m.box(x, 1, z, 6, 3, 11, c); m.box(x, 4, z + 3, 6, 2, 5, c); m.box(x, 4, z + 2, 6, 2, 1, C.glass); for (const [dx, dz] of [[-1, 1], [6, 1], [-1, 8], [6, 8]]) m.box(x + dx, 0, z + dz, 1, 2, 2, 0x15171a); };
  car(10, 2, 0xa63a2e); car(28, 2, 0x2b4170); car(19, d - 13, 0xd8b03a); car(37, d - 13, 0xe4e2da);
  // A container stack in the corner.
  for (let y = 0; y < 2; y++) m.box(42, 1 + y * 8, 18, 12, 8, 7, C.cont[y]);
  return m.snowCap(P.snow, 0.75, 1);
}

/** Filler block: stacked shipping containers, crates and barrels. */
export function containerYard() {
  const m = new VoxelModel();
  pad(m, 0, 0, 56, 48, 9);
  let i = 0;
  for (let gx = 4; gx < 50; gx += 16) for (let gz = 4; gz < 44; gz += 11) {
    if (hash3(gx, gz, 1) < 0.25) continue;
    const h = 1 + Math.floor(hash3(gx, gz, 2) * 3);
    for (let k = 0; k < h; k++) {
      const c = C.cont[(i + k) % 3];
      for (let t = 0; t < 14; t++) for (let y = 0; y < 8; y++) for (let z = 0; z < 7; z++) {
        const rib = t % 2 === 0 && (z === 0 || z === 6);
        m.set(gx + t, 1 + k * 8 + y, gz + z, t === 0 || t === 13 ? 0x1c1f24 : rib ? c : (c & 0xfefefe) >> 1 | (c & 0x808080));
      }
    }
    i++;
  }
  for (const [x, z] of [[2, 40], [5, 42], [50, 2]]) m.box(x, 1, z, 3, 3, 3, 0x8a5a2b);
  for (const [x, z] of [[30, 40], [33, 41]]) m.box(x, 1, z, 2, 4, 2, 0x2f5fa8);
  return m.snowCap(P.snow, 0.75, 1);
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

/** A town square: paving, a frozen fountain, benches and bare trees. */
export function plaza() {
  const m = new VoxelModel();
  pad(m, 0, 0, 56, 48, 41);
  for (let x = 0; x < 12; x++) for (let z = 0; z < 12; z++) {
    const r = Math.hypot(x - 5.5, z - 5.5);
    if (r < 6) m.box(22 + x, 1, 18 + z, 1, r > 4.6 ? 2 : 1, 1, r > 4.6 ? C.trim : 0xbfe3f5);
  }
  m.box(27, 1, 23, 2, 6, 2, C.trim); m.box(26, 7, 22, 4, 1, 4, C.trim);
  for (const [x, z, r] of [[8, 10, 0], [44, 10, 0], [8, 36, 1], [44, 36, 1]]) {
    m.box(x, 1, z, 7, 1, 2, 0x7a5a3a); m.box(x, 2, z + (r ? 0 : 1), 7, 2, 1, 0x7a5a3a);
  }
  for (const [x, z] of [[4, 4], [50, 4], [4, 42], [50, 42]]) { m.box(x, 1, z, 1, 9, 1, 0x4b3a2c); m.box(x - 2, 7, z, 5, 1, 1, 0x4b3a2c); m.box(x, 8, z - 2, 1, 1, 5, 0x4b3a2c); }
  return m.snowCap(P.snow, 0.8, 1);
}

/** A snowed-in park: pines, a frozen pond, a playground frame. */
export function park() {
  const m = new VoxelModel();
  for (let x = 0; x < 56; x++) for (let z = 0; z < 48; z++) {
    const pond = Math.hypot((x - 36) / 1.3, z - 30) < 8;
    m.set(x, 0, z, pond ? (hash3(x, 1, z) < 0.1 ? 0xe9f6ff : 0xa9cdea) : hash3(x, 3, z) < 0.05 ? C.mossDark : P.snow);
  }
  for (const [x, z, h] of [[6, 6, 14], [14, 30, 18], [46, 8, 16], [6, 40, 12], [26, 12, 15]]) {
    m.box(x, 1, z, 1, 3, 1, 0x4b3a2c);
    for (let k = 0; k < h - 3; k++) { const r = Math.max(0, Math.floor((h - 3 - k) / 3)); m.box(x - r, 4 + k, z - r, 2 * r + 1, 1, 2 * r + 1, k % 3 === 0 ? P.snow : 0x2f5a3c); }
  }
  for (const x of [16, 26]) m.box(x, 1, 40, 1, 8, 1, C.metal);
  m.box(16, 8, 40, 11, 1, 1, C.metal);
  m.box(19, 2, 40, 1, 6, 1, C.metalDark); m.box(23, 2, 40, 1, 6, 1, C.metalDark);
  return m.snowCap(P.snow, 0.8, 1);
}

/** A collapsed building: broken walls, rubble, a bent girder. */
export function ruins() {
  const m = new VoxelModel();
  pad(m, 0, 0, 56, 48, 43);
  m.walls(8, 1, 8, 30, 10, 26, C.grey);
  for (let x = 8; x < 38; x++) for (let z = 8; z < 34; z++) for (let y = 1; y < 11; y++) {
    if (hash3(Math.floor(x / 3), y, Math.floor(z / 3)) < 0.35 + y * 0.05) m.remove?.(x, y, z);
  }
  for (let i = 0; i < 70; i++) {
    const x = 6 + Math.floor(hash3(i, 1, 9) * 40); const z = 6 + Math.floor(hash3(i, 2, 9) * 34);
    m.box(x, 1, z, 2, 1 + Math.floor(hash3(i, 3, 9) * 3), 2, hash3(i, 4, 9) < 0.5 ? C.greyDark : C.grey);
  }
  for (let k = 0; k < 14; k++) m.set(40 + Math.floor(k / 3), 1 + k, 20, C.rust);
  return m.snowCap(P.snow, 0.75, 1);
}

/** A rail yard: two tracks, a boxcar, a signal. */
export function railYard() {
  const m = new VoxelModel();
  for (let x = 0; x < 56; x++) for (let z = 0; z < 48; z++) m.set(x, 0, z, hash3(x, 5, z) < 0.3 ? 0x6c665e : P.snow);
  for (const tz of [14, 32]) for (let x = 0; x < 56; x++) {
    if (x % 3 === 0) m.box(x, 1, tz - 3, 1, 1, 8, 0x5a4232);
    m.set(x, 2, tz - 2, C.metal); m.set(x, 2, tz + 3, C.metal);
  }
  m.box(10, 3, 29, 24, 9, 7, C.cont[0]); m.box(10, 12, 29, 24, 1, 7, C.roofDark);
  m.clearBox(20, 4, 35, 4, 7, 1);
  m.box(44, 1, 22, 1, 14, 1, C.metalDark); m.box(43, 13, 22, 3, 3, 1, 0x15191e); m.set(44, 14, 23, C.neonRed, true);
  return m.snowCap(P.snow, 0.75, 1);
}

// ---------------------------------------------------------------- MAP-1b: small buildings that fill a block's free chunks

export const SMALL_VARIANTS = 8;
export const SMALL_SCALE = 0.8; // instance scale (× 0.3 world units per voxel): matches the places shrunk into their chunks
const SMALL_WALLS = [C.sage, C.cream, C.grey, C.brick, C.ochre, 0x8fa3b8, 0xb9a48a, 0x9b8b9e];

/** A small, closed-up building (not a place you can enter): 1–4 floors, sized to one chunk. */
export function smallBuilding(v = 0) {
  const m = new VoxelModel();
  const w = 16 + (v % 3) * 2; const d = 14 + (v % 2) * 3;
  const floors = 1 + ((v * 3) % 4);
  block(m, { x0: -Math.floor(w / 2), z0: -Math.floor(d / 2), w, d, floors, wall: SMALL_WALLS[v % SMALL_WALLS.length], seed: 50 + v, shop: floors <= 2 && v % 2 === 0 });
  if (v % 4 === 1) graffiti(m, -Math.floor(w / 2) + 2, 2, Math.ceil(d / 2), v);
  return dust(m);
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
  return m.snowCap(P.snow, 0.75, 1);
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
  return m.snowCap(P.snow, 0.8, 1);
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
  return m.snowCap(P.snow, 0.75, 1);
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
