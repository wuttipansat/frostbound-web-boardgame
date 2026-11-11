// UI-13: city props for the snowed-in town — wrecked cars, street lamps and shipping containers.
// Small voxel models (built once, instanced). Every one gets a rounded snow cap.
import { VoxelModel, hash3 } from './voxel.js';
import { P } from './palette.js';

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

const CONTAINER_COLORS = [0x8e2f27, 0x24365c, 0x2f5a3f];
/** A shipping container (ribbed sides); `stack` = how many on top of each other. */
export function containerModel(v = 0, stack = 1) {
  const m = new VoxelModel();
  for (let k = 0; k < stack; k++) {
    const c = CONTAINER_COLORS[(v + k) % 3];
    const y = k * 5;
    m.box(-6, y, -2, 13, 5, 5, c);
    for (let x = -6; x <= 6; x += 2) { m.set(x, y + 2, -3, c); m.set(x, y + 2, 3, c); } // ribs
    m.box(7, y + 1, -1, 1, 3, 3, 0x1c1f24); // doors
  }
  m.snowCap(P.snow, 1);
  // Drift against one side.
  for (let x = -6; x <= 6; x++) if (hash3(x, v, 3) < 0.7) m.set(x, 0, -3, P.snow);
  return m.upscale(2);
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
export function wagonModel(kind = 'box', v = 0) {
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
  return m.snowCap(P.snow, 1, 3);
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
