// Voxel designs for the six locations and the colony. Each returns a VoxelModel whose
// front (door side) faces +z; the board rotates it to face the colony.
// Units: voxels (rendered at 0.5 world units each).
import { VoxelModel, hash3 } from './voxel.js';
import { P } from './palette.js';
import * as city from './city.js';

const W = P.window;

/** Row of glowing windows on a wall at z (front) between x0..x1 every `step` voxels. */
function windowsFront(m, x0, x1, y, z, step = 3, h = 2, color = W) {
  for (let x = x0; x <= x1; x += step) {
    const lit = hash3(x, y, z) > 0.25;
    m.box(x, y, z, 1, h, 1, lit ? color : P.glass, lit);
  }
}

function windowsSide(m, z0, z1, y, x, step = 3, h = 2) {
  for (let z = z0; z <= z1; z += step) {
    const lit = hash3(x, y, z) > 0.4;
    m.box(x, y, z, 1, h, 1, lit ? W : P.glass, lit);
  }
}

function door(m, x, z, w = 2, h = 3, color = P.woodDark) {
  m.box(x, 1, z, w, h, 1, color);
}

/** Concrete/stone plinth the building stands on. */
function plinth(m, w, d, color = P.rockLight) {
  m.box(-1, 0, -1, w + 2, 1, d + 2, color);
}

export function policeStation() {
  const m = new VoxelModel();
  const w = 14; const d = 11;
  plinth(m, w, d);
  m.box(0, 1, 0, w, 7, d, (x, y) => (y === 5 ? P.white : 0x34425e));
  m.box(-1, 8, -1, w + 2, 1, d + 2, P.metalDark); // roof edge
  m.box(0, 8, 0, w, 1, d, 0x2b3448);
  windowsFront(m, 1, 12, 2, d, 3, 2);
  windowsFront(m, 1, 12, 6, d, 3, 1);
  windowsSide(m, 1, 9, 2, w, 3);
  windowsSide(m, 1, 9, 2, -1, 4);
  m.clearBox(5, 1, d, 4, 1, 1);
  door(m, 6, d, 2, 3, P.glass);
  m.box(5, 4, d, 4, 1, 1, P.white);
  // Gold badge sign
  m.box(6, 6, d, 2, 2, 1, P.yellow, true);
  // Light bar on the roof: red + blue glow
  m.box(5, 9, 4, 2, 1, 2, 0xff3b3b, true);
  m.box(7, 9, 4, 2, 1, 2, 0x3b7bff, true);
  // Antenna
  m.box(12, 9, 2, 1, 5, 1, P.metal);
  // Parked patrol car out front
  m.box(1, 1, d + 3, 3, 1, 5, P.white);
  m.box(1, 2, d + 4, 3, 1, 3, 0x1d2840);
  m.box(1, 3, d + 5, 3, 1, 1, 0xff3b3b, true);
  for (const [x, z] of [[0, d + 3], [0, d + 7], [4, d + 3], [4, d + 7]]) m.set(x, 1, z, 0x111111);
  return m.snowCap();
}

export function groceryStore() {
  const m = new VoxelModel();
  const w = 16; const d = 10;
  plinth(m, w, d);
  m.box(0, 1, 0, w, 6, d, 0xcfc2a4);
  m.box(0, 7, 0, w, 1, d, 0x8d8473);
  // Big glowing shop windows
  m.box(1, 2, d, 5, 3, 1, W, true);
  m.box(10, 2, d, 5, 3, 1, W, true);
  for (const x of [3, 12]) m.box(x, 2, d, 1, 3, 1, P.metalDark);
  door(m, 7, d, 2, 3, P.glass);
  // Striped awning
  for (let x = -1; x <= w; x++) {
    const c = (x & 1) ? P.white : P.red;
    m.set(x, 5, d + 1, c); m.set(x, 5, d + 2, c);
  }
  // Green sign
  m.box(3, 8, d - 1, 10, 2, 1, P.green);
  for (let x = 4; x < 12; x += 2) m.set(x, 9, d, 0xc6ff9e, true);
  // Shopping carts and a stack of crates
  for (const x of [1, 3]) { m.box(x, 1, d + 4, 1, 1, 2, P.metal); m.set(x, 2, d + 4, P.metal); }
  m.box(13, 1, d + 4, 2, 2, 2, P.woodLight);
  windowsSide(m, 2, 8, 3, w, 4, 1);
  return m.snowCap();
}

export function school() {
  const m = new VoxelModel();
  const w = 18; const d = 10;
  plinth(m, w, d);
  m.box(0, 1, 0, w, 6, d, (x, y) => ((x + y) % 4 === 0 ? 0x86402f : 0x9a4a3a));
  m.box(-1, 7, -1, w + 2, 1, d + 2, P.white);
  windowsFront(m, 1, 6, 2, d, 2, 3);
  windowsFront(m, 12, 17, 2, d, 2, 3);
  // Central bell tower with a peaked roof and a glowing clock
  m.box(7, 1, 3, 4, 11, 4, 0x9a4a3a);
  m.clearBox(8, 1, 6, 2, 3, 1);
  door(m, 8, d, 2, 3, 0x2e5a7a);
  m.box(8, 1, 7, 2, 3, 3, 0x9a4a3a);
  m.clearBox(8, 1, 9, 2, 3, 1);
  m.box(8, 1, 9, 2, 3, 1, 0x2e5a7a);
  m.box(8, 9, 7, 2, 2, 1, 0xfff2c4, true);
  for (let i = 0; i < 3; i++) m.box(7 + i, 12 + i, 3 + i, 4 - 2 * i, 1, 4 - 2 * i, P.red);
  m.box(8, 9, 4, 2, 2, 2, P.yellow); // bell
  // Flag pole
  m.box(w + 1, 1, d + 2, 1, 10, 1, P.metal);
  m.box(w + 2, 8, d + 2, 3, 2, 1, P.blue);
  // School bus
  m.box(-3, 1, d + 4, 9, 3, 3, P.yellow);
  for (let x = -2; x < 5; x += 2) m.set(x, 3, d + 6, W, true);
  for (const x of [-2, 4]) { m.set(x, 0, d + 4, 0x111111); m.set(x, 0, d + 6, 0x111111); }
  return m.snowCap();
}

export function hospital() {
  const m = new VoxelModel();
  const w = 14; const d = 12;
  plinth(m, w, d);
  m.box(0, 1, 0, w, 12, d, (x, y) => (y % 3 === 0 ? 0xc9d3dc : 0xe4eaf0));
  m.box(0, 13, 0, w, 1, d, 0x9aa6b2);
  for (let y = 2; y <= 10; y += 3) windowsFront(m, 1, 12, y, d, 2, 2, hash3(y, 1, 1) > 0.5 ? W : 0xbfe6ff);
  for (let y = 2; y <= 10; y += 3) windowsSide(m, 1, 10, y, w, 3);
  // Red cross sign
  m.box(6, 9, d + 1, 2, 4, 1, 0xff3030, true);
  m.box(5, 10, d + 1, 4, 2, 1, 0xff3030, true);
  // Entrance canopy + doors
  m.box(3, 4, d, 8, 1, 3, P.white);
  m.box(3, 1, d + 2, 1, 3, 1, P.metal); m.box(10, 1, d + 2, 1, 3, 1, P.metal);
  door(m, 5, d, 4, 3, 0xbfe6ff);
  // Helipad
  m.box(3, 14, 3, 8, 1, 6, P.metalDark);
  m.box(6, 15, 5, 1, 1, 2, P.yellow, true); m.box(7, 15, 5, 1, 1, 2, P.yellow, true);
  // Ambulance
  m.box(w + 2, 1, d - 2, 3, 3, 6, P.white);
  m.box(w + 2, 4, d, 3, 1, 1, 0xff3030, true);
  return m.snowCap();
}

export function library() {
  const m = new VoxelModel();
  const w = 16; const d = 11;
  plinth(m, w, d);
  m.box(0, 1, 0, w, 8, d, 0xb3a68d);
  m.box(-1, 9, -1, w + 2, 1, d + 2, 0x988b72);
  // Pediment (triangular)
  for (let i = 0; i < 5; i++) m.box(i, 10 + i, d - 2, w - 2 * i, 1, 3, 0xc7bba2);
  // Steps + columns
  for (let i = 0; i < 3; i++) m.box(1, 0 + i, d + 3 - i, w - 2, 1, 1, 0xa79b84);
  for (let x = 1; x < w; x += 3) m.box(x, 1, d + 1, 1, 8, 1, 0xe2d9c6);
  m.box(-1, 9, d, w + 2, 1, 2, 0xd6ccb7);
  // Tall arched windows (warm reading lamps) and a green door
  windowsFront(m, 2, 13, 3, d, 3, 4);
  m.box(7, 1, d, 2, 4, 1, 0x2f5a3a);
  windowsSide(m, 2, 8, 3, w, 3, 4);
  // Rooftop dome
  m.box(5, 10, 2, 6, 1, 6, 0x5f7f7a);
  m.box(6, 11, 3, 4, 1, 4, 0x5f7f7a);
  m.box(7, 12, 4, 2, 1, 2, 0x5f7f7a);
  // Book cart out front
  m.box(13, 1, d + 4, 2, 1, 1, P.woodDark);
  m.set(13, 2, d + 4, P.red); m.set(14, 2, d + 4, P.blue);
  return m.snowCap();
}

export function gasStation() {
  const m = new VoxelModel();
  // Shop at the back
  m.box(-1, 0, -1, 18, 1, 16, P.rockLight);
  m.box(2, 1, 0, 12, 5, 6, 0xd9d2c3);
  m.box(1, 6, -1, 14, 1, 8, P.red);
  m.box(4, 2, 6, 3, 2, 1, W, true);
  m.box(9, 2, 6, 3, 2, 1, W, true);
  door(m, 7, 6, 2, 3, P.glass);
  // Canopy on pillars, red & white edge with a glowing strip
  for (const [x, z] of [[1, 9], [14, 9], [1, 13], [14, 13]]) m.box(x, 1, z, 1, 6, 1, P.white);
  m.box(-1, 7, 8, 18, 1, 7, P.white);
  m.box(-1, 8, 8, 18, 1, 7, (x, _y, z) => (z === 14 || z === 8 || x === -1 || x === 16 ? P.red : 0xd9d9d9));
  m.box(-1, 7, 15, 18, 1, 1, 0xfff0b0, true);
  // Pumps
  for (const x of [4, 11]) {
    m.box(x, 1, 11, 2, 3, 1, P.red);
    m.set(x, 3, 12, 0xbff0ff, true);
  }
  // Tall price sign
  m.box(17, 1, 2, 1, 11, 1, P.metal);
  m.box(16, 10, 1, 3, 3, 3, P.red);
  m.box(16, 11, 4, 3, 1, 1, P.yellow, true);
  // Oil drums
  m.box(0, 1, 3, 1, 2, 1, 0x2f6f4a); m.box(0, 1, 5, 1, 2, 1, 0x2f6f4a);
  return m.snowCap();
}

/**
 * The colony: a round palisade with 4 gates (N/E/S/W), a central campfire, two cabins,
 * a food storage shed and a watchtower. Radius in voxels.
 */
export function colony(radius = 18) {
  const m = new VoxelModel();
  const gateHalf = 2;
  // Palisade of logs with uneven heights
  for (let a = 0; a < 360; a += 1.2) {
    const rad = (a * Math.PI) / 180;
    const x = Math.round(Math.cos(rad) * radius);
    const z = Math.round(Math.sin(rad) * radius);
    const isGate = (Math.abs(x) <= gateHalf && Math.abs(z) > radius - 3) || (Math.abs(z) <= gateHalf && Math.abs(x) > radius - 3);
    if (isGate) continue;
    const h = 4 + Math.floor(hash3(x, 0, z) * 2);
    m.box(x, 0, z, 1, h, 1, hash3(x, 1, z) > 0.5 ? P.wood : P.woodDark);
    m.set(x, h, z, P.woodLight); // sharpened tip
  }
  // Gate posts with torches
  const gates = [[0, -radius], [0, radius], [-radius, 0], [radius, 0]];
  for (const [gx, gz] of gates) {
    const along = gx === 0 ? [1, 0] : [0, 1];
    for (const s of [-1, 1]) {
      const px = gx + along[0] * s * (gateHalf + 1);
      const pz = gz + along[1] * s * (gateHalf + 1);
      m.box(px, 0, pz, 1, 6, 1, P.woodDark);
      m.set(px, 6, pz, P.fire, true);
    }
    // Lintel
    for (let i = -gateHalf - 1; i <= gateHalf + 1; i++) m.set(gx + along[0] * i, 6, gz + along[1] * i, P.wood);
  }
  // Central campfire: stone ring, logs, flames
  for (let a = 0; a < 360; a += 30) {
    const rad = (a * Math.PI) / 180;
    m.set(Math.round(Math.cos(rad) * 2), 0, Math.round(Math.sin(rad) * 2), P.rockLight);
  }
  m.box(-1, 0, 0, 3, 1, 1, P.woodDark); m.box(0, 0, -1, 1, 1, 3, P.woodDark);
  // Flames: a stepped cone of glowing voxels, hot core inside.
  m.box(-1, 1, -1, 3, 1, 3, (x, _y, z) => (x === 0 && z === 0 ? P.fireCore : P.fire), true);
  m.set(0, 2, 0, P.fireCore, true); m.set(1, 2, 0, P.fire, true); m.set(0, 2, -1, P.fire, true);
  m.set(0, 3, 0, P.fire, true); m.set(0, 4, 0, P.ember, true);
  for (const [x, z] of [[-1, 0], [1, 1], [0, 1]]) m.set(x, 2, z, P.ember, true);
  // Log benches
  m.box(-4, 0, -1, 1, 1, 3, P.wood); m.box(4, 0, -1, 1, 1, 3, P.wood);
  // Cabins
  const cabin = (x0, z0, w, d, doorSide) => {
    m.box(x0, 0, z0, w, 4, d, (x, y) => (y % 2 ? P.wood : P.woodLight));
    for (let i = 0; i < Math.ceil(d / 2); i++) m.box(x0 - 1, 4 + i, z0 + i, w + 2, 1, d - 2 * i, P.woodDark);
    const wz = doorSide > 0 ? z0 + d : z0 - 1;
    m.box(x0 + 1, 1, wz, 1, 1, 1, W, true);
    m.box(x0 + w - 2, 1, wz, 1, 1, 1, W, true);
    m.box(x0 + Math.floor(w / 2), 0, wz, 1, 2, 1, P.woodDark);
    m.set(x0 + w - 2, 6, z0 + 1, P.rock); m.set(x0 + w - 2, 7, z0 + 1, P.rock); // chimney
  };
  cabin(-13, -11, 7, 6, 1);
  cabin(6, -12, 7, 6, 1);
  // Food storage: shed with crates, barrels and sacks
  m.box(-13, 0, 6, 7, 3, 5, P.woodDark);
  m.box(-14, 3, 5, 9, 1, 7, P.metalDark);
  m.clearBox(-11, 0, 10, 3, 3, 1);
  m.box(-11, 0, 10, 1, 1, 1, P.woodLight); m.box(-9, 0, 10, 1, 2, 1, P.woodLight);
  for (const [x, z] of [[-5, 8], [-5, 10], [-4, 9]]) m.box(x, 0, z, 1, 2, 1, 0x8a5a2b);
  m.box(-6, 0, 12, 2, 1, 1, 0xc9b38a);
  // Watchtower: on the far (north-west) side so it never hides the campfire from the default camera.
  for (const [x, z] of [[-15, -5], [-12, -5], [-15, -2], [-12, -2]]) m.box(x, 0, z, 1, 8, 1, P.woodDark);
  m.box(-16, 8, -6, 6, 1, 6, P.wood);
  m.walls(-16, 9, -6, 6, 1, 6, P.woodLight);
  m.box(-15, 12, -5, 4, 1, 4, P.woodDark);
  m.set(-11, 9, -4, P.fire, true); // lantern facing the fire
  // Tents
  for (const [x, z, c] of [[-2, -14, 0x5b6f8a], [2, 12, 0x7a5b4a]]) {
    m.box(x - 2, 0, z, 5, 1, 3, c); m.box(x - 1, 1, z, 3, 1, 3, c); m.box(x, 2, z, 1, 1, 3, c);
  }
  return m.snowCap(P.snow, 0.8);
}

/** A snowy pine. size 0..2 adds height. Built small (rendered at 0.5) and instanced. */
export function pineTree(size = 1) {
  const m = new VoxelModel();
  m.box(0, 0, 0, 1, 2, 1, P.woodDark);
  const layers = 3 + size;
  for (let i = 0; i < layers; i++) {
    const r = layers - i;
    const y = 2 + i * 2;
    m.box(-r + 1, y, -r + 1, 2 * r - 1, 1, 2 * r - 1, (x, _y, z) => (Math.abs(x) + Math.abs(z) > r + 0 ? null : (hash3(x, y, z) > 0.5 ? P.pine : P.pineDark)));
    m.box(-r + 2, y + 1, -r + 2, 2 * r - 3, 1, 2 * r - 3, (x, _y, z) => (Math.abs(x) + Math.abs(z) > r - 1 ? null : P.snow));
  }
  m.set(0, 2 + layers * 2, 0, P.snow);
  return m;
}

export function rock() {
  const m = new VoxelModel();
  m.box(0, 0, 0, 3, 1, 2, P.rock);
  m.box(1, 1, 0, 2, 1, 2, P.rockLight);
  m.set(1, 2, 1, P.snow); m.set(2, 2, 0, P.snow);
  return m;
}

// UI-13 part C: the city-style models (src/render/city.js) replace the earlier cabins.
export const LOCATION_BUILDERS = {
  police: city.policeStation,
  grocery: city.groceryStore,
  school: city.school,
  hospital: city.hospital,
  library: city.library,
  gas: city.gasStation,
  warehouse: city.warehouse,
  motel: city.motel,
  apartment: city.apartment,
  church: city.church,
  farmhouse: city.farmhouse,
};

// ---------------------------------------------------------------- HD (2×) versions

import { detailBuilding, applyPatterns, lumpySnow, shadeHex } from './detail.js';

const SEED = { police: 1, grocery: 2, school: 3, hospital: 4, library: 5, gas: 6, colony: 7 };

/** HD location models: built at 2× resolution with frames, icicles, patterns and bevels. Render at half the voxel size. */
// UI-13: city models are authored at full resolution already (no upscale / detail pass).
export const LOCATION_BUILDERS_HD = Object.fromEntries(Object.entries(LOCATION_BUILDERS).map(([id, build]) => [id, () => build()]));

export function colonyHD(radius = 18, wall = 0) {
  return city.colony(Math.round(radius * 1.67), wall); // full-resolution city colony (wall at the palisade radius)
}

/**
 * Pines in three silhouettes: 0 = classic layered pine, 1 = tall narrow spruce, 2 = round snow-laden fir.
 * size 0..2 adds height.
 */
export function treeModel(shape = 0, size = 1) {
  if (shape === 0) return pineTree(size);
  const m = new VoxelModel();
  if (shape === 1) {
    m.box(0, 0, 0, 1, 3, 1, P.woodDark);
    const layers = 5 + size;
    for (let i = 0; i < layers; i++) {
      const r = Math.max(1, Math.round((layers - i) * 0.6));
      const y = 3 + i * 2;
      m.box(-r + 1, y, -r + 1, 2 * r - 1, 1, 2 * r - 1, (x, _y, z) => (Math.abs(x) + Math.abs(z) > r ? null : (hash3(x, y, z) > 0.5 ? P.pine : P.pineDark)));
      if (hash3(i, 1, size) > 0.3) m.box(-r + 1, y + 1, 0, 2 * r - 1, 1, 1, P.snow);
    }
    m.set(0, 3 + layers * 2, 0, P.snow);
    return m;
  }
  // round fir: a lumpy dome of needles under a thick snow blanket
  m.box(0, 0, 0, 1, 2, 1, P.woodDark);
  const R = 2 + size;
  for (let y = 0; y <= R * 2; y++) {
    const rr = Math.round(Math.sqrt(Math.max(0, R * R - (y - R) * (y - R))));
    for (let x = -rr; x <= rr; x++) for (let z = -rr; z <= rr; z++) {
      if (x * x + z * z > rr * rr + 0.5) continue;
      m.set(x, y + 2, z, hash3(x, y, z) > 0.45 ? P.pine : P.pineDark);
    }
  }
  // A thick blanket: snow on the top and on most upper-hemisphere ledges.
  m.snowCap(P.snow, 0.95, 2);
  for (const v of [...m.voxels.values()]) {
    if ((v.color === P.pine || v.color === P.pineDark) && v.y > R && !m.get(v.x, v.y + 1, v.z) && hash3(v.x, v.y, v.z) < 0.5) v.color = P.snowShade;
  }
  return m;
}

export function treeModelHD(shape = 0, size = 1) {
  // Trees are instanced ~90 times (and drawn again into the shadow map), so keep them merge-friendly:
  // needles keep their per-block colour (2×2×2 blocks merge into big quads), only snow gets detail.
  const m = treeModel(shape, size).upscale(2);
  lumpySnow(m, { p: 0.3 });
  // Snow clumps sitting on branch tips.
  for (const v of [...m.voxels.values()]) {
    if (v.color !== P.pine && v.color !== P.pineDark) continue;
    if (!m.get(v.x, v.y + 1, v.z) && hash3(v.x, v.y, v.z + 9) < 0.06) m.set(v.x, v.y + 1, v.z, P.snow);
  }
  return m.bevel(0.25, { seed: shape * 7 + size, topOnly: true });
}

export function rockModel(shape = 0) {
  if (shape === 0) return rock();
  const m = new VoxelModel();
  if (shape === 1) { // tall split boulder
    m.box(0, 0, 0, 2, 3, 2, P.rock); m.box(2, 0, 0, 1, 2, 2, P.rockLight); m.box(0, 3, 0, 1, 1, 1, P.rockLight);
  } else { // flat slab pile
    m.box(0, 0, 0, 4, 1, 3, P.rockLight); m.box(1, 1, 0, 2, 1, 2, P.rock); m.box(3, 1, 2, 1, 1, 1, P.rock);
  }
  return m.snowCap(P.snow, 0.7, 1);
}

export function rockModelHD(shape = 0) {
  const m = rockModel(shape).upscale(2);
  lumpySnow(m, { p: 0.5 });
  m.recolor((v) => (v.color === P.rock || v.color === P.rockLight ? shadeHex(v.color, 0.85 + hash3(v.x, v.y, v.z) * 0.3) : undefined));
  return m.bevel(0.7, { seed: shape });
}
