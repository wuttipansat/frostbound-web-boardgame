// Voxel sculptures for every item card (37), built at low resolution (~6–7 voxels) and upscaled 2×.
// Each item type shares a colour language so the type reads at a glance:
//   food = warm yellow/amber, medicine = red & white, fuel = orange, tools = steel blue,
//   weapons = dark steel, junk = rusty brown.
import { VoxelModel, hash3 } from './voxel.js';
import { applyPatterns, shadeHex } from './detail.js';
import { ITEMS } from '../content/items.js';

export const TYPE_COLORS = {
  food: { main: 0xe8b830, dark: 0xb5842a, light: 0xf6dc8a },
  medicine: { main: 0xd23b33, dark: 0x8e1f1b, light: 0xf2f0ea },
  fuel: { main: 0xf07a22, dark: 0xb24f12, light: 0xffc27a },
  tools: { main: 0x6f93bf, dark: 0x3f5f86, light: 0xb9cfe8 },
  weapon: { main: 0x4a5260, dark: 0x2b3038, light: 0x9aa4b2 },
  junk: { main: 0x8a6444, dark: 0x5a3e2a, light: 0xc0a07a },
};

const STEEL = 0x8f99a6;
const STEEL_DARK = 0x4d5560;
const WOOD = 0x8a6444;
const WHITE = 0xf2f0ea;
const BLACK = 0x22252b;

/** Vertical cylinder of radius r (voxels) centred on (cx, cz). color(x, y, z, edge) -> colour. */
function cyl(m, cx, cz, r, y0, h, color) {
  for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) {
    const d = Math.hypot(x, z);
    if (d > r + 0.35) continue;
    for (let y = y0; y < y0 + h; y++) m.set(cx + x, y, cz + z, typeof color === 'function' ? color(x, y, z, d > r - 0.7) : color);
  }
  return m;
}

/** Horizontal rod along x. */
function rodX(m, x0, len, y, z, color, thick = 1) {
  m.box(x0, y, z, len, thick, thick, color);
  return m;
}

const B = {
  // ---------------- food
  'canned-beans': (m, c) => cyl(m, 0, 0, 2, 0, 4, (x, y, z) => (y === 1 || y === 2 ? (x + z > 1 ? c.main : c.dark) : STEEL))
    .remove(2, 3, 0).set(0, 4, 0, STEEL_DARK),
  'frozen-venison': (m, c) => {
    m.box(0, 0, 0, 5, 2, 3, (x, y) => (y === 1 && x % 2 ? 0x9a3b30 : 0x7a2a22));
    m.box(1, 2, 0, 3, 1, 3, 0x9a3b30);
    rodX(m, 5, 2, 1, 1, WHITE);
    m.set(0, 2, 2, 0xcfe6f7).set(3, 2, 0, 0xcfe6f7); // frost
    return m.set(6, 1, 1, c.light);
  },
  'rice-sack': (m, c) => {
    m.box(0, 0, 0, 5, 4, 4, (x, y) => (y === 2 ? c.dark : 0xd9c69a));
    m.box(1, 4, 1, 3, 1, 2, 0xd9c69a);
    return m.box(2, 5, 1, 1, 1, 2, c.main);
  },
  'beef-jerky': (m, c) => {
    for (let i = 0; i < 3; i++) m.box(i, i, 0, 5, 1, 2, i % 2 ? 0x7a3a22 : 0x5e2c1a);
    return m.box(0, 0, 2, 6, 3, 1, c.main);
  },
  'cafeteria-tray': (m, c) => {
    m.box(0, 0, 0, 6, 1, 4, 0xa8b0bb);
    m.box(0, 1, 0, 6, 1, 1, 0xa8b0bb).box(0, 1, 3, 6, 1, 1, 0xa8b0bb);
    m.box(1, 1, 1, 2, 1, 1, c.main).set(4, 1, 1, 0x6f9a4a).set(4, 1, 2, 0x6f9a4a);
    return m.box(1, 1, 2, 2, 1, 1, c.dark);
  },
  // ---------------- medicine
  'first-aid-pouch': (m, c) => {
    m.box(0, 0, 0, 5, 4, 3, c.main);
    m.box(2, 1, 3, 1, 2, 1, WHITE).set(1, 2, 3, WHITE).set(3, 2, 3, WHITE);
    return m.box(0, 4, 1, 5, 1, 1, c.dark);
  },
  antibiotics: (m, c) => cyl(m, 0, 0, 1, 0, 4, (x, y) => (y === 1 || y === 2 ? WHITE : WHITE)).box(-1, 4, -1, 3, 1, 3, c.main)
    .set(1, 2, 1, c.main).set(-1, 2, 1, c.main),
  'cough-syrup': (m, c) => {
    m.box(0, 0, 0, 3, 4, 2, (x, y) => (y < 3 ? 0x8c2440 : 0xb03a55));
    m.box(1, 4, 0, 1, 1, 2, WHITE);
    return m.box(0, 1, 2, 3, 2, 1, c.light);
  },
  'saline-bags': (m, c) => {
    m.box(0, 1, 0, 4, 4, 1, 0xe8f2f8);
    m.box(1, 2, 1, 2, 2, 1, 0xd9ecf6).set(0, 5, 0, c.main).set(3, 5, 0, c.main);
    return m.box(2, 0, 0, 1, 1, 1, c.main);
  },
  'herbal-guide': (m, c) => {
    m.box(0, 0, 0, 5, 1, 4, c.main);
    m.box(0, 1, 0, 5, 1, 4, WHITE);
    m.box(0, 2, 0, 5, 1, 4, c.main);
    return m.set(2, 3, 2, 0x5f9a4a).set(3, 3, 1, 0x5f9a4a);
  },
  // ---------------- fuel
  'jerry-can': (m, c) => {
    m.box(0, 0, 0, 4, 5, 2, (x, y) => (x === 1 && y > 0 && y < 4 ? c.dark : c.main));
    m.box(1, 5, 0, 2, 1, 1, c.dark);
    return m.box(3, 5, 1, 1, 1, 1, STEEL);
  },
  'lamp-oil': (m, c) => cyl(m, 0, 0, 1, 0, 4, (x, y) => (y < 3 ? c.main : c.light)).set(0, 4, 0, BLACK).set(0, 5, 0, BLACK),
  'space-heater-fuel': (m, c) => cyl(m, 0, 0, 2, 0, 3, (x, y) => (y === 1 ? 0x3b6fb5 : c.main)).box(-1, 3, -1, 3, 1, 3, STEEL_DARK),
  'oxygen-tank': (m, c) => cyl(m, 0, 0, 1, 0, 6, (x, y) => (y === 4 ? c.dark : c.main)).set(0, 6, 0, STEEL).set(1, 6, 0, STEEL),
  'candle-box': (m, c) => {
    m.box(0, 0, 0, 5, 2, 3, c.main);
    for (const x of [1, 3]) m.box(x, 2, 1, 1, 2, 1, 0xf3e7c8).set(x, 4, 1, 0xffd04a, true);
    return m;
  },
  flare: (m, c) => {
    rodX(m, 0, 5, 0, 0, c.main);
    m.set(0, 0, 0, c.dark);
    return m.set(5, 0, 0, 0xff5a3a, true).set(6, 0, 0, 0xffd04a, true);
  },
  'road-flare-kit': (m, c) => {
    m.box(0, 0, 0, 6, 2, 3, c.dark);
    for (const z of [0, 1, 2]) rodX(m, 1, 4, 2, z, c.main);
    return m.set(5, 2, 1, 0xffd04a, true);
  },
  // ---------------- tools
  'zip-ties': (m, c) => {
    for (const [x, z] of [[0, 0], [2, 1], [1, 2]]) {
      m.box(x, 0, z, 3, 1, 1, c.main).set(x, 1, z, c.main).set(x + 2, 1, z, c.main).box(x, 2, z, 3, 1, 1, c.main);
    }
    return m.set(1, 3, 1, c.dark);
  },
  'duct-tape': (m, c) => {
    cyl(m, 0, 0, 2, 0, 2, (x, y, z, edge) => (edge ? c.main : null));
    for (const v of [...m.voxels.values()]) if (v.color == null) m.remove(v.x, v.y, v.z);
    return m.set(2, 0, -1, c.light);
  },
  'repair-manual': (m, c) => {
    m.box(0, 0, 0, 5, 1, 4, c.main).box(0, 1, 0, 5, 1, 4, WHITE).box(0, 2, 0, 5, 1, 4, c.main);
    return m.set(1, 3, 2, STEEL).set(2, 3, 2, STEEL).set(3, 3, 1, STEEL);
  },
  'socket-set': (m, c) => {
    m.box(0, 0, 0, 6, 2, 3, c.dark);
    for (let x = 1; x < 6; x += 1) m.set(x, 2, 1, x % 2 ? STEEL : 0xc9d2dc);
    return m.box(0, 2, 0, 6, 1, 1, c.main);
  },
  'surgical-saw': (m, c) => {
    m.box(0, 0, 0, 5, 2, 1, STEEL);
    for (let x = 0; x < 5; x += 2) m.set(x, -1, 0, STEEL_DARK);
    return m.box(5, 0, 0, 2, 2, 1, c.main);
  },
  'old-almanac': (m, c) => {
    m.box(0, 0, 0, 4, 1, 5, c.dark).box(0, 1, 0, 4, 1, 5, 0xe6dcc4).box(0, 2, 0, 4, 1, 5, c.main);
    return m.set(2, 3, 2, 0xe8b830);
  },
  // ---------------- weapons
  'service-pistol': (m, c) => {
    m.box(0, 2, 0, 5, 1, 1, c.main).box(0, 1, 0, 5, 1, 1, c.dark);
    return m.box(0, -1, 0, 2, 2, 1, BLACK).set(2, 0, 0, c.dark);
  },
  'riot-baton': (m, c) => rodX(m, 0, 7, 0, 0, BLACK).set(1, 1, 0, c.main).set(2, 1, 0, c.main),
  'pump-shotgun': (m, c) => {
    rodX(m, 0, 7, 1, 0, c.main);
    rodX(m, 1, 4, 0, 0, c.dark);
    return m.box(-2, 0, 0, 2, 2, 1, WOOD);
  },
  'box-cutter': (m, c) => m.box(0, 0, 0, 4, 1, 1, 0xe8c341).box(4, 0, 0, 2, 1, 1, c.light).set(1, 1, 0, BLACK),
  'hockey-stick': (m) => {
    m.box(0, 0, 0, 1, 7, 1, WOOD);
    m.box(1, 0, 0, 3, 1, 1, 0x2b3038);
    return m.set(0, 6, 0, 0x2b3038);
  },
  'tire-iron': (m, c) => {
    rodX(m, 0, 6, 0, 2, c.main);
    m.box(2, 0, 0, 1, 1, 5, c.main);
    return m.set(0, 0, 2, c.dark).set(2, 0, 0, c.dark);
  },
  'letter-opener': (m) => m.box(0, 0, 0, 5, 1, 1, 0xd9b45a).box(5, 0, 0, 2, 1, 1, 0x8a6a2a).set(5, 1, 0, 0x8a6a2a),
  // ---------------- junk
  'lost-and-found': (m, c) => {
    m.box(0, 0, 0, 5, 3, 4, (x, y) => (y === 2 ? c.light : c.main));
    return m.box(1, 3, 1, 2, 1, 1, 0xd64545).set(3, 3, 2, 0x4fa3e0);
  },
  'shopping-cart': (m, c) => {
    m.walls(0, 1, 0, 5, 3, 3, (x, y) => (y % 2 ? c.main : c.dark));
    m.box(0, 1, 0, 5, 1, 3, c.dark);
    m.set(0, 0, 0, BLACK).set(4, 0, 0, BLACK).set(0, 0, 2, BLACK).set(4, 0, 2, BLACK);
    return m.box(5, 3, 1, 1, 1, 1, c.dark);
  },
  'board-games': (m, c) => {
    const cols = [0xd64545, 0x4fa3e0, 0x7fbf4d];
    cols.forEach((col, i) => m.box(i % 2, i, 0, 5, 1, 4, (x, y, z) => (z === 3 ? col : c.main)));
    return m;
  },
  bedpan: (m, c) => {
    m.box(0, 0, 0, 5, 1, 4, c.main);
    m.walls(0, 1, 0, 5, 1, 4, c.light);
    return m.box(5, 1, 1, 2, 1, 2, c.dark);
  },
  'paperback-pile': (m, c) => {
    const cols = [0xc85a7a, 0x5a7ac8, c.main, 0xe8c341];
    cols.forEach((col, i) => m.box(i % 2, i, i % 2, 4, 1, 3, (x, y, z) => (x === (i % 2) ? 0xf2ead8 : col)));
    return m;
  },
  'motor-junk': (m, c) => {
    cyl(m, 0, 0, 2, 0, 1, (x, y, z, edge) => (edge ? c.main : c.dark));
    m.box(3, 0, -1, 1, 3, 1, c.light).set(3, 3, -1, c.main);
    return m.set(-2, 1, 1, STEEL).set(-1, 1, 2, STEEL);
  },
};

/** Low-resolution model for an item definition id. */
export function itemModel(defId) {
  const def = ITEMS[defId];
  if (!def) throw new Error(`Unknown item ${defId}`);
  const m = B[defId](new VoxelModel(), TYPE_COLORS[def.type]);
  // Builders may leave "null" placeholders; drop them.
  for (const v of [...m.voxels.values()]) if (v.color == null) m.remove(v.x, v.y, v.z);
  return m;
}

/** 2× version with material patterns, a light dither and bevelled edges. */
export function itemModelHD(defId) {
  const m = itemModel(defId).upscale(2);
  applyPatterns(m);
  // A thin top highlight on every exposed upper face edge, for a crisp toy look.
  for (const v of [...m.voxels.values()]) {
    if (!v.glow && !m.get(v.x, v.y + 1, v.z) && hash3(v.x, v.y, v.z) < 0.25) v.color = shadeHex(v.color, 1.12);
  }
  return m.bevel(0.3, { keep: (v) => v.glow });
}

export const ITEM_MODEL_IDS = Object.keys(B);
