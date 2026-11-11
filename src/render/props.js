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
  m.snowCap(P.snow, 0.95);
  return m.upscale(2).bevel(0.3, { topOnly: true, seed: v });
}

/** A street lamp: a dark pole with a warm glowing head. */
export function lampModel() {
  const m = new VoxelModel();
  m.box(0, 0, 0, 1, 9, 1, 0x2a2f36);
  m.box(0, 9, 0, 3, 1, 1, 0x2a2f36);
  m.set(2, 8, 0, 0xffc46b, true);
  m.set(0, 9, 0, P.snow); m.set(1, 10, 0, P.snow);
  return m.upscale(2);
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
  m.snowCap(P.snow, 0.95);
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
  m.snowCap(P.snow, 0.9);
  return m.upscale(2);
}
export const CLUTTER_KINDS = 6;
