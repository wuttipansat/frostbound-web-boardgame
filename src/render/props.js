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
