// UI-13: city props for the snowed-in town — wrecked cars, street lamps and shipping containers.
// Small voxel models (built once, instanced). Every one gets a rounded snow cap.
import { VoxelModel, hash3 } from './voxel.js';
import { P } from './palette.js';
import { containerBox, CONTAINER_TONES } from './city.js';

const CAR_COLORS = [0x8e2b2b, 0x2f5fa8, 0xd8b03a, 0xe4e2da];
/** A car under snow (variant 0..3: red sedan, blue hatch with headlights on, yellow taxi, white van with headlights on). */
export function carModel(v = 0) {
  const m = new VoxelModel();
  const body = CAR_COLORS[v % 4];
  m.box(-5, 1, -2, 11, 2, 5, body);                 // lower body
  if (v === 3) m.box(-5, 3, -2, 9, 3, 5, body); else m.box(-2, 3, -2, 6, 2, 5, body); // van box / cabin
  m.box(-1, 3, -2, 4, 2, 1, P.glass); m.box(-1, 3, 2, 4, 2, 1, P.glass); // side windows
  m.box(4, 3, -1, 1, 1, 3, P.glass);                // windscreen
  for (const [x, z] of [[-4, -2], [3, -2], [-4, 2], [3, 2]]) m.box(x, 0, z, 2, 1, 1, 0x1c1f24); // tyres
  m.set(6, 2, -2, 0xfff1c2, v % 2 === 1); m.set(6, 2, 2, 0xfff1c2, v % 2 === 1); // headlights (one car still has them on)
  m.set(-5, 2, -2, P.red); m.set(-5, 2, 2, P.red);
  if (v === 2) m.box(0, 5, 0, 2, 1, 1, 0x1c1f24);  // taxi sign
  m.snowCap(P.snow, 1);
  return m.upscale(2).bevel(0.3, { topOnly: true, seed: v });
}

/** MAP-3 street lamp, authored at the fine grid (use at 0.1 world per voxel): base, thin pole, arm over the road (+x),
 *  hooded head with a warm lens underneath, snow on the hood and arm. `dead` = a broken lamp (no light). */
export function lampModel(dead = false) {
  const m = new VoxelModel();
  const iron = 0x2a2f36; const dark = 0x1d2127;
  m.box(-1, 0, -1, 3, 1, 3, dark);            // base plate
  m.box(0, 1, 0, 1, 2, 1, iron); m.box(-1, 1, 0, 3, 1, 1, iron); m.box(0, 1, -1, 1, 1, 3, iron); // collar
  m.box(0, 3, 0, 1, 28, 1, iron);             // pole
  m.box(1, 29, 0, 7, 1, 1, iron);             // arm
  m.set(1, 28, 0, iron); m.set(2, 27, 0, iron); // brace
  m.box(6, 27, -1, 4, 2, 3, dark);            // hood
  m.box(7, 26, 0, 2, 1, 1, dead ? 0x3a3f46 : 0xffc46b, !dead); // lens
  m.box(6, 29, -1, 4, 1, 3, P.snow); m.box(1, 30, 0, 5, 1, 1, P.snow); m.set(0, 31, 0, P.snow);
  return m;
}

/** A shipping container (ribbed sides); `stack` = how many on top of each other. */
export function containerModel(v = 0, stack = 1) {
  // MAP-3: the same detailed container as the colony walls (corrugation, castings, door bars, stencil, rust), stacked
  // a little untidily, with snow flat on top and a drift along one side.
  const m = new VoxelModel();
  for (let k = 0; k < stack; k++) {
    const off = k ? 1 + Math.floor(hash3(v, k, 5) * 3) : 0;
    containerBox(m, -13 + off, 1 + k * 8, -4 + (k ? (v % 2 ? 1 : -1) : 0), 26, true, CONTAINER_TONES[(v * 2 + k) % 5], v * 11 + k, { skew: k && v % 2 ? 1 : 0, door: v % 2 ? 1 : -1 });
  }
  for (let x = -13; x < 13; x++) if (hash3(x, v, 3) < 0.8) { m.set(x, 0, -5, P.snow); if (hash3(x, v, 4) < 0.5) m.set(x, 1, -5, P.snow); }
  m.box(-13, 0, -4, 26, 1, 7, P.snowShade);
  return m.snowCap(P.snow, 1, 1);
}

// ---------------------------------------------------------------- MAP-1c: street clutter (instanced)

/** Small street props: 0 traffic cone, 1 wooden crate pile, 2 oil barrels, 3 trash bags, 4 concrete barrier, 5 bench. */
export function clutterModel(k = 0) {
  const m = new VoxelModel();
  if (k === 0) { m.box(-1, 0, -1, 3, 1, 3, 0x2a2f36); m.box(0, 1, 0, 1, 3, 1, 0xff7a2a); m.set(0, 2, 0, P.white); }
  else if (k === 1) { m.box(-2, 0, -1, 3, 3, 3, 0x8a5a2b); m.box(1, 0, -1, 2, 2, 2, 0x9a6a38); m.box(-1, 3, 0, 2, 2, 2, 0x8a5a2b); }
  else if (k === 2) { for (const [x, z, c] of [[-1, 0, 0x2f5fa8], [1, 0, 0x2f5fa8], [0, 2, 0x3f7a4a]]) { m.box(x, 0, z, 2, 4, 2, c); m.set(x, 2, z, 0x1c1f24); } }
  else if (k === 3) { for (const [x, z, h] of [[-1, 0, 2], [1, 0, 3], [0, 1, 2]]) m.box(x, 0, z, 2, h, 2, 0x22262c); }
  else if (k === 4) { m.box(-3, 0, 0, 7, 1, 2, 0xa3adb8); m.box(-3, 1, 0, 7, 2, 1, 0xa3adb8); m.box(-2, 2, 0, 2, 1, 1, 0xe6e6e0); m.box(1, 2, 0, 2, 1, 1, 0xc0392b); }
  else { m.box(-3, 1, 0, 7, 1, 2, 0x7a5a3a); m.box(-3, 2, 1, 7, 2, 1, 0x7a5a3a); m.set(-3, 0, 0, 0x2a2f36); m.set(3, 0, 0, 0x2a2f36); }
  m.snowCap(P.snow, 1);
  return m.upscale(2);
}
export const CLUTTER_KINDS = 6;

// ---------------------------------------------------------------- MAP-3 E: railway pieces

/** A level-crossing post (fine grid, 0.1 world per voxel): crossbuck, two red lamps (one dead), a striped arm.
 *  The arm lies along +x over the road when down; up = raised. */
export function crossingModel(up = false) {
  const m = new VoxelModel();
  m.box(-1, 0, -1, 3, 1, 3, 0x2a2d31); m.box(0, 1, 0, 1, 30, 1, 0xe8e8e2);
  for (let k = -5; k <= 5; k++) { m.set(k, 26 + k, 0, Math.abs(k) % 3 ? 0xe8e8e2 : 0xc0392b); m.set(k, 26 - k, 0, Math.abs(k) % 3 ? 0xe8e8e2 : 0xc0392b); }
  m.box(-3, 18, 1, 2, 2, 1, 0xff3a2a, true); m.box(2, 18, 1, 2, 2, 1, 0x3a1a18);
  m.box(-1, 6, 1, 3, 4, 2, 0x2a2d31);
  for (let k = 0; k < 28; k++) { const c = Math.floor(k / 4) % 2 ? 0xc0392b : 0xf0f0ea; if (up) m.set(0, 10 + k, 2, c); else m.set(1 + k, 8, 2, c); }
  return m.snowCap(P.snow, 1, 2);
}

/** A goods wagon (0.3 world per voxel, length 40 along x): 'box' = a container on a flatcar, 'tank', 'hopper'. */
export function wagonModel(kind = 'box', v = 0, lying = false) {
  const m = new VoxelModel();
  const L = 40; const x0 = -20;
  m.box(x0, 2, -4, L, 2, 9, 0x2a2d31);                         // underframe
  for (const bx of [x0 + 4, x0 + L - 10]) { m.box(bx, 0, -4, 6, 3, 1, 0x1c1f24); m.box(bx, 0, 4, 6, 3, 1, 0x1c1f24); } // bogies
  for (const ex of [x0 - 1, x0 + L]) m.box(ex, 2, -1, 1, 1, 3, 0x3a3f46); // couplers
  const tones = [0x8e3a2c, 0x2b3a5c, 0x5d6b3a, 0x2f6b6b, 0xb8682f];
  if (kind === 'tank') {
    for (let x = x0 + 1; x < x0 + L - 1; x++) for (let y = 0; y < 8; y++) for (let z = -4; z <= 4; z++) if ((y - 3.5) ** 2 + z * z <= 17) m.set(x, 4 + y, z, x % 9 === 0 ? 0x1c1f24 : 0x3a3f46);
    m.box(-1, 12, -1, 3, 1, 3, 0x2a2d31);
  } else if (kind === 'hopper') {
    for (let y = 0; y < 8; y++) m.walls(x0 + 2 + Math.floor(y / 3), 4 + y, -4, L - 4 - 2 * Math.floor(y / 3), 1, 9, y % 3 ? tones[(v + 2) % 5] : 0x4a3a2c);
    m.box(x0 + 5, 11, -3, L - 10, 1, 7, 0x2a2622); // coal under the snow
  } else {
    // A container on the flatcar (same detailed container as the colony walls, rotated along x).
    for (let t = 0; t < L - 2; t++) for (let k = 0; k < 9; k++) for (let y = 0; y < 9; y++) {
      const side = k === 0 || k === 8; const end = t === 0 || t === L - 3; const cap = y === 0 || y === 8;
      const c = tones[v % 5];
      m.set(x0 + 1 + t, 4 + y, -4 + k, end && side && cap ? 0x1c1f24 : cap ? 0x3a3a3a : side ? (t % 2 ? c : (c & 0xfefefe) >> 1) : c);
    }
    for (let t = 6; t < L - 8; t++) if (hash3(t, v, 3) < 0.5) m.set(x0 + 1 + t, 9, 5, 0xd9d2bf); // faded stencil
  }
  if (!lying) return m.snowCap(P.snow, 1, 3);
  // Overturned: rolled onto its side in voxel space (y → −z), so its side wall is the new top and snow lies on it;
  // the wheels face the track, half sunk in the snow.
  const out = new VoxelModel();
  for (const p of m.voxels.values()) { if (p.y < 2) continue; out.set(p.x, p.z + 5, -(p.y - 2), p.color, p.glow); }
  out.box(x0 - 1, 0, -14, L + 2, 1, 16, P.snow); // a drift around it
  return out.snowCap(P.snow, 1, 1);
}

/** A small station shelter (0.1 world per voxel): platform slab, posts, a roof, a bench and a name board. */
export function shelterModel() {
  const m = new VoxelModel();
  m.box(-40, 0, -6, 80, 3, 13, 0x9aa0a6);                                   // platform
  for (let x = -40; x < 40; x++) m.set(x, 3, 6, x % 2 ? 0xd8b03a : 0x2a2d31);   // yellow edge line
  for (const x of [-20, 20]) for (const z of [-5, 4]) m.box(x, 3, z, 1, 22, 1, 0x2a2f36);
  m.box(-24, 25, -6, 49, 2, 12, 0x3a4652);
  m.box(-8, 3, -4, 16, 4, 3, P.wood); m.box(-8, 7, -5, 16, 4, 1, P.wood);       // bench
  m.box(-6, 14, -6, 12, 6, 1, 0x1d3557); m.box(-5, 16, -5, 10, 2, 1, 0xe8e8e2); // name board
  return m.snowCap(P.snow, 1, 3);
}

// ---------------------------------------------------------------- MAP-3 E2: street furniture (fine grid, 0.1 world per voxel)

/** Kinds of small sidewalk furniture. */
export const FURNITURE = ['hydrant', 'bin', 'postbox', 'newsbox', 'phone', 'busstop'];

/** One piece of street furniture; front (+z) faces the road. */
export function furnitureModel(kind) {
  const m = new VoxelModel();
  switch (kind) {
    case 'hydrant': m.box(-1, 0, -1, 3, 1, 3, 0x8e2a22); m.box(-1, 1, -1, 3, 5, 3, 0xc0392b); m.box(-2, 3, 0, 5, 1, 1, 0xc0392b); m.box(0, 6, 0, 1, 1, 1, 0xe0c060); break;
    case 'bin': m.box(-2, 0, -2, 4, 6, 4, 0x2f5a3f); m.box(-2, 6, -2, 4, 1, 4, 0x24452f); m.box(-1, 4, 2, 2, 1, 1, 0x1c1f24); break;
    case 'postbox': m.box(-2, 0, -2, 4, 1, 4, 0x1d2f55); m.box(-2, 1, -1, 4, 8, 3, 0x2b4a8c); m.box(-1, 6, 2, 2, 1, 1, 0x1c1f24); m.box(-2, 9, -1, 4, 1, 3, 0x1d2f55); break;
    case 'newsbox': m.box(-2, 0, -1, 4, 6, 3, 0xd8b03a); m.box(-1, 3, 2, 2, 2, 1, 0x9fb4c8); break;
    case 'phone':
      for (const [x, z] of [[-3, -3], [2, -3], [-3, 2], [2, 2]]) m.box(x, 0, z, 1, 20, 1, 0xa83228);
      m.box(-3, 20, -3, 6, 2, 6, 0xa83228); m.box(-2, 17, 2, 4, 2, 1, 0xf0e6c8, true);
      for (let y = 2; y < 16; y++) for (let k = -2; k < 2; k++) { if (y % 4) { m.set(k, y, -3, 0x9fb4c8); m.set(-3, y, k, 0x9fb4c8); m.set(2, y, k, 0x9fb4c8); } }
      m.box(-1, 8, -2, 2, 3, 1, 0x1c1f24); break;
    case 'busstop':
      for (const x of [-10, 9]) m.box(x, 0, -2, 1, 17, 1, 0x2a2f36);
      m.box(-11, 17, -3, 22, 1, 6, 0x3a4652);
      for (let x = -9; x < 9; x++) for (let y = 3; y < 16; y++) if (x % 6) m.set(x, y, -2, 0xa9c4d8);
      m.box(-6, 3, -1, 12, 1, 3, 0x6b5a48); m.box(-6, 0, 0, 1, 3, 1, 0x2a2f36); m.box(5, 0, 0, 1, 3, 1, 0x2a2f36);
      m.box(12, 0, 1, 1, 22, 1, 0x2a2f36); m.box(11, 18, 1, 4, 4, 1, 0x2b6cb0); m.set(12, 19, 2, 0xf0f0ea); break;
    default:
  }
  return m.snowCap(P.snow, 1, 2);
}

/** A traffic light on a pole with an arm over the road (+x): state 'red' | 'amber' | 'dead'. */
export function trafficLightModel(state = 'red') {
  const m = new VoxelModel();
  m.box(-1, 0, -1, 3, 1, 3, 0x2a2f36); m.box(0, 1, 0, 1, 34, 1, 0x3a4048); m.box(1, 33, 0, 16, 1, 1, 0x3a4048);
  m.box(14, 25, -1, 3, 8, 3, 0x1c1f24);
  const lamp = (y, on, c) => m.box(15, y, 2, 1, 2, 1, on ? c : 0x2a2a2a, on);
  lamp(30, state === 'red', 0xff3a2a); lamp(28, state === 'amber', 0xffb02a); lamp(26, false, 0x3aff7a);
  m.box(-1, 14, 1, 3, 4, 1, 0xe8e8e2); // push-button box
  return m.snowCap(P.snow, 1, 2);
}

/** A street name sign: pole with two crossed green plates. */
export function streetSignModel() {
  const m = new VoxelModel();
  m.box(0, 0, 0, 1, 26, 1, 0x3a4048);
  m.box(-6, 24, 1, 13, 2, 1, 0x1f6b45); m.box(1, 21, -6, 1, 2, 13, 0x1f6b45);
  for (let k = -5; k < 6; k += 2) m.set(k, 25, 2, 0xf0f0ea);
  return m.snowCap(P.snow, 1, 2);
}

/** A wooden power pole (7 world high) with a cross arm and insulators along x. */
export function powerPoleModel() {
  const m = new VoxelModel();
  m.box(0, 0, 0, 1, 70, 1, 0x5e4129);
  m.box(-10, 64, 0, 21, 1, 1, 0x4a3420);
  for (const x of [-9, 0, 9]) m.set(x, 65, 0, 0x8fb4c8);
  m.box(-1, 52, -1, 3, 3, 3, 0x6c7580); // transformer
  return m.snowCap(P.snow, 1, 2);
}

/** Evacuation-route vehicles (0.15 world per voxel, length along x): a bus, a truck cab and its trailer. */
export function vehicleModel(kind = 'bus', v = 0) {
  const m = new VoxelModel();
  const wheels = (x0, x1, z) => { for (const x of [x0, x1]) { m.box(x, 0, -z, 3, 3, 1, 0x15171a); m.box(x, 0, z - 1, 3, 3, 1, 0x15171a); } };
  if (kind === 'bus') {
    const c = v % 2 ? 0xd8b03a : 0x2f6b8f;
    m.box(-28, 2, -8, 56, 14, 16, c); m.box(-28, 16, -8, 56, 1, 16, 0xdde3e8);
    for (let x = -25; x < 24; x += 6) { m.box(x, 9, 8, 4, 5, 1, 0x2c3b4c); m.box(x, 9, -9, 4, 5, 1, 0x2c3b4c); }
    m.box(27, 7, -6, 1, 8, 12, 0x2c3b4c); m.box(27, 4, -6, 1, 2, 2, 0xfff1c2); m.box(27, 4, 4, 1, 2, 2, 0xfff1c2);
    wheels(-20, 16, 8);
  } else if (kind === 'ambulance' || kind === 'police') {
    const amb = kind === 'ambulance';
    const len = amb ? 30 : 24;
    m.box(-len / 2, 2, -6, len, amb ? 12 : 6, 12, amb ? 0xeceae4 : 0x1c1f24);
    if (!amb) { m.box(-6, 8, -5, 12, 4, 10, 0x1c1f24); m.box(-6, 2, -6, 12, 4, 1, 0xeceae4); m.box(-6, 2, 5, 12, 4, 1, 0xeceae4); m.box(-5, 9, -6, 10, 2, 1, 0x2c3b4c); m.box(-5, 9, 5, 10, 2, 1, 0x2c3b4c); }
    else { m.box(-len / 2, 6, -7, len, 2, 1, 0xc0392b); m.box(-len / 2, 6, 6, len, 2, 1, 0xc0392b); m.box(6, 8, -6, 8, 4, 1, 0x2c3b4c); m.box(-4, 9, 6, 3, 1, 1, 0xc0392b); m.box(-3, 8, 6, 1, 3, 1, 0xc0392b); }
    const top = amb ? 14 : 12;
    m.box(-3, top, -3, 6, 1, 6, 0x3a3f46); m.box(-3, top + 1, -3, 3, 1, 6, 0x5a2222); m.box(0, top + 1, -3, 3, 1, 6, 0x22305a); // dead light bar
    wheels(-len / 2 + 3, len / 2 - 6, 6);
  } else if (kind === 'cab') {
    m.box(-8, 2, -7, 16, 12, 14, 0x9a2f28); m.box(5, 8, -6, 3, 4, 12, 0x2c3b4c); m.box(-8, 14, -6, 4, 4, 12, 0x9a2f28);
    m.box(8, 3, -6, 1, 4, 12, 0x8e979f); wheels(-6, 3, 7);
  } else { // trailer
    m.box(-30, 3, -8, 60, 16, 16, 0xd9d6cc); m.box(-30, 3, -8, 60, 1, 16, 0x6c7580);
    for (let x = -26; x < 26; x += 9) m.box(x, 8, 8, 6, 4, 1, 0xa83228);
    wheels(-26, -18, 8); m.box(20, 0, -6, 1, 3, 12, 0x6c7580);
  }
  return m.snowCap(P.snow, 1, 3);
}

/** An abandoned army checkpoint (0.1 world per voxel, along x): sandbag walls, a striped barrier, a tent. */
export function checkpointModel() {
  const m = new VoxelModel();
  const bags = (x0, z0, len, alongX) => { for (let t = 0; t < len; t++) for (let y = 0; y < 5; y++) { const x = alongX ? x0 + t : x0; const z = alongX ? z0 : z0 + t; m.set(x, y, z, (t + y) % 3 ? 0xb8a47a : 0xa8946a); m.set(x + (alongX ? 0 : 1), y, z + (alongX ? 1 : 0), 0xb8a47a); } };
  bags(-30, -12, 14, true); bags(-30, -12, 10, false); bags(16, 10, 14, true); bags(29, 2, 10, false);
  m.box(-2, 0, -12, 2, 10, 2, 0x2a2f36);
  for (let k = 0; k < 24; k++) m.set(0 + k, 9, -11, Math.floor(k / 3) % 2 ? 0xc0392b : 0xf0f0ea);
  for (let y = 0; y < 12; y++) m.box(-12 + Math.floor(y / 2), y, 2, 22 - y, 1, 14, y % 4 ? 0x5d6b3a : 0x4b5730); // tent
  m.box(-1, 0, 15, 4, 8, 1, 0x2a2622);
  return m.snowCap(P.snow, 1, 2);
}

/** A burnt-out car: a car model scorched black and rust, no glass or lights. */
export function burntCarModel(v = 0) {
  const tones = [0x1c1a19, 0x2a2420, 0x4a2a1e, 0x332c28];
  return carModel(v).recolor((p) => (p.color === P.snow ? undefined : tones[(p.x * 7 + p.y * 3 + p.z) & 3])).recolor((p) => { p.glow = false; return undefined; });
}

/** A ragged tent (0.1 world per voxel) and a cold fire pit beside it. */
export function tentModel(v = 0) {
  const m = new VoxelModel();
  const c = [0x3f6f8f, 0x8f5a3f, 0x5d6b3a][v % 3];
  for (let y = 0; y < 9; y++) m.box(-9 + y, y, -6, 18 - 2 * y, 1, 12, y % 3 ? c : (c & 0xfefefe) >> 1);
  m.box(-1, 0, 6, 3, 6, 1, 0x1c1f24);
  for (let a = 0; a < 8; a++) m.set(Math.round(Math.cos(a) * 3) + 14, 0, Math.round(Math.sin(a) * 3), 0x6c7580);
  m.box(13, 0, -1, 3, 1, 3, 0x2a2622);
  return m.snowCap(P.snow, 1, 2);
}

/** A statue on a plinth (0.1 world per voxel). */
export function statueModel() {
  const m = new VoxelModel();
  m.box(-5, 0, -5, 11, 2, 11, 0x9aa0a6); m.box(-3, 2, -3, 7, 9, 7, 0xb6bcc2);
  m.box(-1, 11, -1, 3, 8, 3, 0x5f7f6a); m.box(-3, 16, -1, 7, 2, 2, 0x5f7f6a); m.box(0, 19, 0, 2, 3, 2, 0x5f7f6a); m.box(3, 18, 0, 1, 5, 1, 0x5f7f6a);
  return m.snowCap(P.snow, 1, 2);
}

/** A buffer stop at the end of the line (0.1 world per voxel, facing +x): a steel frame, a red-white board, a lamp. */
export function bufferStopModel() {
  const m = new VoxelModel();
  for (const z of [-8, 7]) { m.box(-4, 0, z, 1, 10, 1, 0x3a3f46); for (let k = 0; k < 8; k++) m.set(-4 + k, k, z, 0x3a3f46); }
  m.box(-5, 6, -9, 2, 4, 18, 0x2a2d31);
  for (let z = -9; z < 9; z++) for (let y = 7; y < 10; y++) m.set(-3, y, z, Math.floor((z + 9) / 3) % 2 ? 0xc0392b : 0xf0f0ea);
  m.box(-4, 10, -1, 1, 6, 1, 0x3a3f46); m.box(-4, 16, -2, 1, 3, 3, 0xff3a2a, true);
  return m.snowCap(P.snow, 1, 2);
}

// ---------------------------------------------------------------- MAP-4: signs and fences (0.1 world per voxel)

/** A stop sign on a post (octagon-ish red plate, white band), facing +z. */
export function stopSignModel() {
  const m = new VoxelModel();
  m.box(0, 0, 0, 1, 20, 1, 0x8e979f);
  for (let y = 0; y < 7; y++) for (let x = -3; x <= 3; x++) if (Math.abs(x) + Math.abs(y - 3) <= 4) m.set(x, 19 + y, 1, y === 3 && Math.abs(x) < 3 ? 0xf0f0ea : 0xc0392b);
  return m.snowCap(P.snow, 1, 2);
}

/** A direction sign: post with three arrow plates (hospital red, police blue, station green), facing +z. */
export function directionSignModel() {
  const m = new VoxelModel();
  m.box(0, 0, 0, 1, 30, 1, 0x3a4048);
  [[27, 0xc0392b, 1], [23, 0x2b4a8c, -1], [19, 0x1f6b45, 1]].forEach(([y, c, s]) => {
    for (let x = 0; x < 9; x++) m.box(s > 0 ? 1 + x : -1 - x, y, 1, 1, 3 - (x === 8 ? 2 : 0), 1, c);
    m.set(s > 0 ? 9 : -9, y + 1, 1, c); m.set(s > 0 ? 4 : -4, y + 1, 2, 0xf0f0ea);
  });
  return m.snowCap(P.snow, 1, 2);
}

/** A hand-painted board on legs: "SAFE ZONE →" (the arrow points along +x). */
export function safeZoneModel() {
  const m = new VoxelModel();
  for (const x of [-6, 6]) m.box(x, 0, 0, 1, 9, 1, 0x5e4129);
  m.box(-8, 9, 0, 17, 7, 1, 0xd9cfa8);
  for (let x = -6; x < 2; x++) if (x % 3) m.set(x, 13, 1, 0x1c1f24);
  for (let x = -6; x < 4; x++) m.set(x, 11, 1, 0x2f6b4a);
  for (let k = 0; k < 3; k++) { m.set(4 + k, 11 + k, 1, 0x2f6b4a); m.set(4 + k, 11 - k, 1, 0x2f6b4a); }
  return m.snowCap(P.snow, 1, 2);
}

/** A fence 6 world long along x: 'picket' (white wooden, residential) or 'chain' (chain-link with posts, industrial). */
export function fenceModel(kind = 'picket') {
  const m = new VoxelModel();
  for (let x = -30; x < 30; x++) {
    if (kind === 'picket') { if (x % 2 === 0) m.box(x, 0, 0, 1, 7, 1, 0xe8e4d8); m.set(x, 2, -1, 0xd8d2c2); m.set(x, 5, -1, 0xd8d2c2); }
    else if (kind === 'rail') { if (x % 8 === 0) m.box(x, 0, 0, 1, 8, 1, 0x5a4030); if (x % 23 !== 5) { m.set(x, 3, 0, 0x7a5a3a); m.set(x, 6, 0, 0x7a5a3a); } } // MAP-7: post-and-rail, a broken rail
    else { if (x % 6 === 0) m.box(x, 0, 0, 1, 12, 1, 0x6c7580); for (let y = 1; y < 11; y++) if ((x + y) % 2 === 0) m.set(x, y, 0, 0x9aa3ad); m.set(x, 11, 0, 0x6c7580); if (x % 3 === 0) m.set(x, 12, 0, 0x8e979f); }
  }
  return m.snowCap(P.snow, 1, 2);
}

// ---------------------------------------------------------------- MAP-5: courtyard life (0.1 world per voxel)

/** A courtyard camp: a ring of stones with a fire, logs to sit on, a tent and a pot. */
export function campModel() {
  const m = new VoxelModel();
  for (let a = 0; a < 10; a++) m.set(Math.round(Math.cos(a * 0.63) * 4), 0, Math.round(Math.sin(a * 0.63) * 4), 0x8d949e);
  m.box(-1, 0, -1, 3, 1, 3, 0x2a2622); m.box(0, 1, 0, 1, 2, 1, P.fire, true); m.set(-1, 1, 0, P.ember ?? 0xff7a2a, true); m.set(1, 1, 0, P.fire, true);
  m.box(-2, 4, 0, 5, 1, 1, 0x3a3f46); m.box(0, 3, 0, 1, 1, 1, 0x3a3f46); // pot on a bar
  for (const x of [-3, 3]) m.box(x, 0, -2, 1, 5, 1, 0x3a3f46);
  m.box(-7, 0, 6, 6, 2, 2, 0x6b4a2e); m.box(3, 0, -8, 2, 2, 6, 0x6b4a2e);
  for (let y = 0; y < 8; y++) m.box(8 + Math.floor(y / 2), y, 2, 14 - y, 1, 10, y % 3 ? 0x5d6b3a : 0x4b5730);
  return m.snowCap(P.snow, 1, 2);
}

/** A washing line between two poles with clothes still on it, and a snowman. */
export function laundryModel() {
  const m = new VoxelModel();
  for (const x of [-20, 20]) m.box(x, 0, 0, 1, 18, 1, 0x5e4129);
  for (let x = -19; x < 20; x++) m.set(x, 17 - (Math.abs(x) < 12 ? 1 : 0), 0, 0x2a2d31);
  [[-14, 0xc0392b], [-8, 0xe6e2d6], [-2, 0x3f6f8f], [5, 0xd8b03a], [11, 0x5d6b3a]].forEach(([x, c]) => m.box(x, 10, 0, 4, 6, 1, c));
  for (const [y, r] of [[0, 4], [7, 3], [12, 2]]) for (let dy = 0; dy < r * 2 - 1; dy++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (dx * dx + dz * dz + (dy - r + 1) ** 2 <= r * r) m.set(dx + 8, y + dy, dz + 12, 0xf2f5f8);
  m.set(8, 13, 14, 0xd9822b); m.set(7, 14, 14, 0x1c1f24); m.set(9, 14, 14, 0x1c1f24);
  return m;
}

/** A crow (0.1 world per voxel): perched pose; the board animates flight by moving the instance. */
export function crowModel() {
  const m = new VoxelModel();
  m.box(-1, 1, 0, 3, 2, 1, 0x15171a); m.box(1, 3, 0, 1, 1, 1, 0x15171a); m.set(2, 3, 0, 0x3a3f46); m.set(-2, 2, 0, 0x15171a);
  m.box(-1, 2, -1, 2, 1, 1, 0x1c1f24); m.box(-1, 2, 1, 2, 1, 1, 0x1c1f24); m.set(0, 0, 0, 0x3a3f46);
  return m;
}

/** One warm bulb of a string of lights. */
export function bulbModel() { return new VoxelModel().set(0, 0, 0, 0xffd27a, true); }

// ---------------------------------------------------------------- MAP-6: damage and snow gradients (0.1 world per voxel)

/** A ploughed snow heap against the kerb (downtown): a long lumpy mound, grey with grime at the foot. */
export function snowHeapModel(v = 0) {
  const m = new VoxelModel();
  for (let x = -18; x < 18; x++) for (let z = -6; z < 6; z++) {
    const h = Math.round((1 - (x / 18) ** 2) * (1 - (z / 6) ** 2) * (9 + hash3(x >> 2, v, z >> 2) * 5));
    for (let y = 0; y < h; y++) m.set(x, y, z, y < 2 ? 0x9a9c9e : hash3(x, y, z) < 0.1 ? 0xd9dde2 : P.snow);
  }
  return m;
}

/** A sandbag wall (downtown barricade): three courses, staggered, with a sheet of plywood. */
export function sandbagModel() {
  const m = new VoxelModel();
  for (let c = 0; c < 3; c++) for (let k = -3; k < 3; k++) m.box(k * 6 + (c % 2) * 3 - 1, c * 3, -2, 5, 3, 4, (x, y, z) => (hash3(x, y + c, z) < 0.3 ? 0x7d6f52 : 0x938466));
  m.box(-8, 9, -1, 12, 8, 1, 0x8a6a44);
  return m.snowCap(P.snow, 1, 2);
}

/** A wind-blown drift (outskirts): a low, flat-topped dune with a ragged edge (two or three steps, no stair lines). */
export function driftModel(v = 0) {
  const m = new VoxelModel();
  for (let x = -12; x < 12; x++) for (let z = -7; z < 7; z++) {
    const r = (x / 12) ** 2 + (z / 7) ** 2 + (hash3(x >> 1, v, z >> 1) - 0.5) * 0.35;
    const h = r < 0.25 ? 3 + v : r < 0.6 ? 2 : r < 0.95 ? 1 : 0;
    for (let y = 0; y < h; y++) m.set(x, y, z, P.snow);
  }
  return m;
}

// ---------------------------------------------------------------- MAP-6: what a place has, shown outside its door

/** A woodpile: split logs stacked between two stakes. */
export function woodpileModel() {
  const m = new VoxelModel();
  for (let y = 0; y < 5; y++) for (let x = -7; x < 7; x++) m.box(x, y, -2 + (y % 2), 1, 1, 4, (x + y) % 3 ? 0x7a5532 : 0xb08a5a);
  for (const x of [-8, 7]) m.box(x, 0, -1, 1, 7, 1, 0x5a3e28);
  return m.snowCap(P.snow, 1, 2);
}
/** A scrap heap: sheets, a wheel, pipes. */
export function scrapHeapModel() {
  const m = new VoxelModel();
  for (let k = 0; k < 4; k++) m.box(-6 + k, k, -4 + k, 12 - 2 * k, 1, 8 - 2 * k, (x, y, z) => (hash3(x, y, z) < 0.4 ? 0x9a4b2f : hash3(x, z, y) < 0.5 ? 0x6c7580 : 0x4b525a));
  m.box(-7, 0, 3, 3, 3, 1, 0x1c1f24); m.box(2, 3, -5, 1, 1, 8, 0x8e979f);
  return m.snowCap(P.snow, 0.8, 2);
}
/** Food crates: a stack of wooden crates and sacks under a tarp. */
export function cratesModel() {
  const m = new VoxelModel();
  for (const [x, y, z] of [[-6, 0, -3], [-1, 0, -3], [-4, 4, -3], [3, 0, -2]]) { m.box(x, y, z, 5, 4, 5, 0xa07a4a); m.box(x, y + 1, z + 5, 5, 1, 1, 0x7a5532); }
  m.box(4, 4, -2, 4, 2, 4, 0xd8c08a);
  return m.snowCap(P.snow, 1, 2);
}

/** A bridge parapet (MAP-6 river): a low concrete wall with posts, 5.6 long, standing at a kerb over the ice. */
export function bridgeParapetModel() {
  const m = new VoxelModel();
  m.box(-28, 0, -1, 56, 3, 3, 0x8d949e);
  for (let x = -28; x < 28; x += 7) m.box(x, 3, -1, 2, 6, 3, 0x9aa3ad);
  m.box(-28, 9, -1, 56, 2, 3, 0xb0b8c0);
  return m.snowCap(P.snow, 1, 2);
}

// ---------------------------------------------------------------- MAP-7: outskirts, river and rim details

/** A bare birch (0.25 world per voxel): a white trunk with dark marks, thin bare branches, snow on the forks. */
export function birchModel(v = 0) {
  const m = new VoxelModel(); const h = 14 + v * 3;
  for (let y = 0; y < h; y++) m.set(0, y, 0, hash3(y, v, 1) < 0.25 ? 0x2a2a2a : 0xe8e6e0);
  for (let k = 0; k < 6; k++) {
    const y = 6 + k * 2 + (k % 2); const dx = [1, -1, 0, 0, 1, -1][k]; const dz = [0, 0, 1, -1, 1, -1][k];
    for (let s = 1; s <= 3 - (k >> 2); s++) m.set(dx * s, y + s, dz * s, 0x8a8278);
    m.set(dx * 3, y + 4, dz * 3, P.snow);
  }
  m.set(0, h, 0, P.snow);
  return m;
}
/** A stump (0.25 world per voxel), snow on top. */
export function stumpModel() { const m = new VoxelModel(); m.box(-1, 0, -1, 3, 2, 3, 0x6a4a30); m.box(0, 2, 0, 1, 1, 1, 0xb08a5a); return m.snowCap(P.snow, 1, 1); }
/** A striped road barrier where a road ends at the edge of the world (0.1 world per voxel). */
export function barrierModel() {
  const m = new VoxelModel();
  for (const x of [-22, 21]) m.box(x, 0, -1, 2, 10, 2, 0x4b525a);
  for (let x = -24; x < 24; x++) m.box(x, 8, -1, 1, 3, 1, Math.floor((x + 24) / 6) % 2 ? 0xe8e8e0 : 0xc0392b);
  m.box(-6, 11, -1, 12, 4, 1, 0xd8b03a); for (let x = -4; x < 4; x += 2) m.set(x, 13, -2, 0x1c1f24);
  return m.snowCap(P.snow, 1, 2);
}
/** A fishing hole on the river ice: a dark round hole, a stool, a bucket and a rod (0.1 world per voxel). */
export function fishingModel() {
  const m = new VoxelModel();
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) if (x * x + z * z <= 9) m.set(x, 0, z, x * x + z * z <= 4 ? 0x1c2a36 : 0xd7e4ee);
  m.box(5, 0, -1, 3, 4, 3, 0x6a4a30); m.box(4, 4, -2, 5, 1, 5, 0x6a4a30); m.box(-8, 0, 2, 3, 4, 3, 0x2b4170);
  for (let k = 0; k < 8; k++) m.set(4 - k, 5 + Math.floor(k / 2), 0, 0x3a3f46);
  return m;
}
/** A rowing boat frozen into the river ice, tilted (0.1 world per voxel). */
export function boatModel() {
  const m = new VoxelModel();
  for (let x = -12; x < 12; x++) { const w = Math.round(4 * Math.sqrt(1 - (x / 12) ** 2)); m.box(x, 0, -w, 1, 4, 2 * w + 1, 0x7a4a2a); if (w > 1) m.clearBox(x, 1, -w + 1, 1, 3, 2 * w - 1); }
  for (const x of [-4, 3]) m.box(x, 2, -3, 1, 1, 7, 0x5a3a24);
  return m.snowCap(P.snow, 0.8, 1);
}
