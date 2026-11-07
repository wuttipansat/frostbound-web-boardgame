// Voxel characters (~8 x 8 x 16): 20 styled survivors, hunched zombies, d6 dice, barricades.
// Front faces +z. Grid: x 0..7, z 0..7, y up.
import { VoxelModel, hash3 } from './voxel.js';
import { P } from './palette.js';

const SKIN = { light: 0xf1c9a5, fair: 0xe8b98f, medium: 0xd9a066, tan: 0xc68642, brown: 0x8d5524, dark: 0x5c3a21 };
const EYE = 0x1a1f2b;
const BOOT = 0x2b2420;

/**
 * Per-survivor look. hat: headwear/hair; extras: gear that changes the silhouette.
 * coat defaults to the survivor's accent colour (src/content/survivors.js).
 */
export const SURVIVOR_STYLES = {
  'maren-holt':   { skin: 'fair', hair: 0x6b3f22, coat: 0xd9822b, pants: 0x34465e, hat: 'cap', hatColor: 0xd9822b, extras: ['longhair', 'scarf'], scarf: 0x7a2e2e },
  'osei-vance':   { skin: 'dark', hair: 0x1b1410, coat: 0xe8eef2, pants: 0x3f8f7a, hat: 'short', extras: ['labcoat', 'glasses'] },
  'pim-arunrat':  { skin: 'tan', hair: 0x1b1410, coat: 0xf2b33d, pants: 0x3a3a46, hat: 'headband', hatColor: 0xd64545, extras: ['apron'], apron: 0xf4f1ea },
  'ilse-brandt':  { skin: 'light', hair: 0xb8bcc4, coat: 0x6b7f4a, pants: 0x4a4f3a, hat: 'ushanka', hatColor: 0x5a4a38, extras: ['rifle'] },
  'teodor-rusu':  { skin: 'fair', hair: 0x2a2420, coat: 0x2a2e38, pants: 0x1f2229, hat: 'bald', extras: ['wide', 'beard'], beard: 0x3a2a20 },
  'nia-calloway': { skin: 'brown', hair: 0x1b1410, coat: 0x8f98a4, pants: 0x2f3440, hat: 'beanie', hatColor: 0xb0b7c0, extras: ['goggles'] },
  'wren-okafor':  { skin: 'dark', hair: 0x1b1410, coat: 0x2f8f83, pants: 0x2f8f83, hat: 'beanie', hatColor: 0x2a3a40, extras: ['broom'] },
  'lio-fontaine': { skin: 'light', hair: 0xd9a35a, coat: 0xd64545, pants: 0x3c5a8a, hat: 'cowboy', hatColor: 0xc9a46a, extras: ['scarf'], scarf: 0xf4f1ea },
  'hattie-moss':  { skin: 'light', hair: 0xc0612b, coat: 0xe0d6c0, pants: 0x4a4a52, hat: 'bun', extras: ['apron'], apron: 0x7fbf4d },
  'rafael-quist': { skin: 'medium', hair: 0x1b1410, coat: 0x5aa9e6, pants: 0x5aa9e6, hat: 'short', extras: ['mask'] },
  'agnes-pell':   { skin: 'light', hair: 0xd8d8de, coat: 0x8a5a9e, pants: 0x3a3346, hat: 'bun', extras: ['glasses', 'short'] },
  'corwin-daly':  { skin: 'medium', hair: 0x2a2018, coat: 0x2b4c8c, pants: 0x1f2a44, hat: 'policecap', hatColor: 0x1f2a44 },
  'juno-barrera': { skin: 'tan', hair: 0x1b1410, coat: 0xe0c341, pants: 0xe0c341, hat: 'cap', hatColor: 0x2a2e38, extras: ['goggles', 'backwards'] },
  'kanya-srisuk': { skin: 'medium', hair: 0x14100c, coat: 0xf28fb1, pants: 0x3a4a6a, hat: 'longhair', extras: ['scarf'], scarf: 0xf4e3a0 },
  'bo-lindqvist': { skin: 'light', hair: 0xe8d39a, coat: 0x1f6f9f, pants: 0x1a2a3a, hat: 'beanie', hatColor: 0xe8742b, extras: ['tank'] },
  'ezra-kade':    { skin: 'fair', hair: 0x2a2018, coat: 0xa83279, pants: 0x22222a, hat: 'fedora', hatColor: 0x22222a },
  'greta-vos':    { skin: 'fair', hair: 0xe0c070, coat: 0xc0392b, pants: 0x2a2e38, hat: 'hood', hatColor: 0xc0392b, extras: ['gloves'], gloves: 0xe03a2a },
  'silas-thorn':  { skin: 'tan', hair: 0x5a3a22, coat: 0x7a5c3a, pants: 0x4a4030, hat: 'furhat', hatColor: 0x8a6a4a, extras: ['backpack', 'beard'], beard: 0x5a3a22, pack: 0x4a5a3a },
  'dot-ferreira': { skin: 'brown', hair: 0x1b1410, coat: 0x39c16c, pants: 0x2a2e38, hat: 'helmet', hatColor: 0xf2f2f2, extras: ['bag', 'short'], pack: 0xe0c341 },
  'ambrose-lark': { skin: 'medium', hair: 0x8a8a8a, coat: 0x9c8f7a, pants: 0x4a4440, hat: 'short', extras: ['goggles', 'backpack', 'beard'], beard: 0x8a8a8a, pack: 0x6b5a48 },
};

const shade = (hex, k) => {
  const r = Math.min(255, ((hex >> 16) & 255) * k);
  const g = Math.min(255, ((hex >> 8) & 255) * k);
  const b = Math.min(255, (hex & 255) * k);
  return (r << 16) | (g << 8) | b;
};

/** Build a survivor's VoxelModel. `def` is the content entry, style overrides by id. */
export function survivorModel(def) {
  const st = { ...SURVIVOR_STYLES[def.id] };
  const has = (e) => (st.extras ?? []).includes(e);
  const skin = SKIN[st.skin] ?? SKIN.medium;
  const coat = st.coat ?? Number.parseInt(def.accent.slice(1), 16);
  const coatDark = shade(coat, 0.75);
  const m = new VoxelModel();
  const W = has('wide') ? 1 : 0;
  const lo = has('short') ? -1 : 0; // shorter survivors lose a row of torso

  // Boots + legs
  for (const x of [2, 4]) {
    m.box(x, 0, 3, 2, 1, 3, BOOT);
    m.box(x, 1, 3, 2, 3, 2, st.pants);
  }
  // Torso (y 4..9) with a darker belt line
  const top = 9 + lo;
  m.box(1 - W, 4, 2, 6 + 2 * W, top - 3, 4, (x, y) => (y === 4 ? coatDark : coat));
  if (has('labcoat')) m.box(1, 2, 2, 6, 2, 4, (x, _y, z) => (z === 5 && (x === 3 || x === 4) ? null : coat));
  // Arms + hands
  for (const x of [0 - W, 7 + W]) {
    m.box(x, 5, 3, 1, top - 4, 2, coatDark);
    m.box(x, 4, 3, 1, 1, 2, has('gloves') ? st.gloves : skin);
  }
  // Head (6 tall)
  const hy = top + 1;
  m.box(1, hy, 1, 6, 6, 6, skin);
  // Eyes + a hint of mouth
  m.set(2, hy + 2, 6, EYE); m.set(5, hy + 2, 6, EYE);
  m.set(3, hy, 6, shade(skin, 0.8)); m.set(4, hy, 6, shade(skin, 0.8));
  // Default short hair: top + back
  const hair = st.hair;
  const paintHair = () => {
    m.box(1, hy + 5, 1, 6, 1, 6, hair);
    m.box(1, hy + 2, 1, 6, 3, 1, hair);
    m.box(1, hy + 4, 1, 1, 1, 6, hair); m.box(6, hy + 4, 1, 1, 1, 6, hair);
  };
  const hc = st.hatColor;
  switch (st.hat) {
    case 'bald':
      m.box(1, hy + 1, 1, 6, 1, 1, hair); // a little stubble at the back
      break;
    case 'short':
      paintHair();
      break;
    case 'longhair':
      paintHair();
      m.box(0, hy - 1, 1, 1, 6, 5, hair); m.box(7, hy - 1, 1, 1, 6, 5, hair);
      m.box(1, hy - 2, 0, 6, 7, 1, hair);
      m.box(2, hy + 5, 6, 4, 1, 1, hair); // fringe
      break;
    case 'bun':
      paintHair();
      m.box(3, hy + 5, 1, 2, 2, 2, hair);
      break;
    case 'cap':
      paintHair();
      m.box(1, hy + 5, 1, 6, 2, 6, hc);
      if (has('backwards')) m.box(2, hy + 5, -1, 4, 1, 2, hc); else m.box(2, hy + 5, 7, 4, 1, 2, shade(hc, 0.8));
      break;
    case 'beanie':
      paintHair();
      m.box(1, hy + 4, 1, 6, 2, 6, hc);
      m.box(2, hy + 6, 2, 4, 1, 4, hc);
      m.box(3, hy + 7, 3, 2, 1, 2, P.white);
      m.box(1, hy + 4, 1, 6, 1, 6, shade(hc, 0.8));
      break;
    case 'ushanka':
      m.box(0, hy + 4, 0, 8, 3, 8, hc);
      m.box(0, hy + 1, 1, 1, 3, 5, hc); m.box(7, hy + 1, 1, 1, 3, 5, hc);
      m.box(1, hy + 4, 7, 6, 1, 1, shade(hc, 1.2));
      m.set(3, hy + 5, 7, P.yellow); m.set(4, hy + 5, 7, P.yellow);
      break;
    case 'furhat':
      m.box(0, hy + 4, 0, 8, 2, 8, hc);
      m.box(1, hy + 6, 1, 6, 1, 6, shade(hc, 0.85));
      m.box(0, hy + 2, 2, 1, 2, 4, hc); m.box(7, hy + 2, 2, 1, 2, 4, hc);
      break;
    case 'cowboy':
      paintHair();
      m.box(-1, hy + 5, -1, 10, 1, 10, hc);
      m.box(2, hy + 6, 2, 4, 2, 4, hc);
      m.box(2, hy + 6, 2, 4, 1, 4, shade(hc, 0.7));
      break;
    case 'fedora':
      paintHair();
      m.box(0, hy + 5, 0, 8, 1, 8, hc);
      m.box(1, hy + 6, 1, 6, 2, 6, hc);
      m.box(1, hy + 6, 1, 6, 1, 6, 0xa83279);
      break;
    case 'policecap':
      paintHair();
      m.box(1, hy + 5, 1, 6, 1, 6, hc);
      m.box(0, hy + 6, 0, 8, 1, 8, hc);
      m.box(2, hy + 5, 7, 4, 1, 1, 0x111111);
      m.set(3, hy + 6, 8, P.yellow); m.set(4, hy + 6, 8, P.yellow);
      break;
    case 'helmet':
      paintHair();
      m.box(1, hy + 5, 0, 6, 2, 7, hc);
      m.box(3, hy + 5, 0, 2, 3, 7, P.red);
      m.box(1, hy + 5, 7, 6, 1, 1, shade(hc, 0.6));
      break;
    case 'hood':
      m.box(0, hy - 1, 0, 8, 7, 1, hc);
      m.box(0, hy - 1, 0, 1, 7, 6, hc); m.box(7, hy - 1, 0, 1, 7, 6, hc);
      m.box(0, hy + 6, 0, 8, 1, 7, hc);
      m.box(2, hy + 5, 6, 4, 1, 1, hair);
      break;
    case 'headband':
      paintHair();
      m.box(1, hy + 4, 1, 6, 1, 6, hc);
      m.box(1, hy + 4, 0, 1, 1, 1, hc); m.box(1, hy + 3, -1, 1, 1, 1, hc); // tails
      break;
    default:
      paintHair();
  }

  // Extras
  if (has('glasses')) { m.box(1, hy + 2, 7, 6, 1, 1, 0x222831); m.set(2, hy + 2, 7, 0x9fd4ff); m.set(5, hy + 2, 7, 0x9fd4ff); }
  if (has('goggles')) { m.box(1, hy + 4, 7, 6, 1, 1, 0x3a3a3a); m.set(2, hy + 4, 7, 0xffb347, true); m.set(5, hy + 4, 7, 0xffb347, true); }
  if (has('mask')) m.box(2, hy, 7, 4, 2, 1, 0xd8f0ff);
  if (has('beard')) { m.box(2, hy, 7, 4, 2, 1, st.beard); m.box(1, hy, 6, 1, 2, 1, st.beard); m.box(6, hy, 6, 1, 2, 1, st.beard); }
  if (has('scarf')) { m.box(1 - W, top, 1, 6 + 2 * W, 1, 6, st.scarf); m.box(5, top - 3, 6, 1, 3, 1, st.scarf); }
  if (has('apron')) m.box(2, 4, 6, 4, top - 4, 1, st.apron);
  if (has('backpack')) { m.box(2, 5, 0, 4, 5 + lo, 2, st.pack); m.box(2, 9 + lo, 0, 4, 1, 2, shade(st.pack, 0.75)); }
  if (has('tank')) { m.box(2, 4, 0, 1, 6, 2, 0xe8742b); m.box(5, 4, 0, 1, 6, 2, 0xe8742b); }
  if (has('bag')) { m.box(7 + W, 3, 2, 1, 3, 4, st.pack); for (let i = 0; i < 5; i++) m.set(2 + i, 4 + i, 6, 0x3a3a3a); }
  if (has('rifle')) for (let i = 0; i < 11; i++) m.set(1 + Math.floor(i / 2), 3 + i, 1, i > 8 ? 0x2a2a2a : 0x5a3a22);
  if (has('broom')) { m.box(6, 1, 1, 1, 14, 1, P.woodLight); m.box(5, 13, 0, 3, 3, 1, 0xd9c27a); }
  return m;
}

/** A hunched, greenish zombie. variant 0..2 changes the rags. */
export function zombieModel(variant = 0) {
  const rags = [0x5a3f4a, 0x3f4f5f, 0x6b5a3a][variant % 3];
  const pants = [0x2f3440, 0x4a3a2a, 0x2a3a2f][variant % 3];
  const skins = [0x6f8a4e, 0x7a9a5a, 0x5f7a44];
  const skin = (x, y, z) => skins[Math.floor(hash3(x + variant * 11, y, z) * skins.length)];
  const m = new VoxelModel();
  // Legs (one dragging slightly behind)
  m.box(2, 0, 3, 2, 4, 2, pants);
  m.box(4, 0, 2, 2, 4, 2, pants);
  m.box(2, 0, 4, 2, 1, 2, BOOT);
  // Torso leaning forward: each pair of rows shifts one voxel towards +z.
  for (let y = 4; y <= 9; y++) {
    const dz = Math.floor((y - 4) / 2);
    m.box(1, y, 2 + dz, 6, 1, 4, (x, yy, z) => {
      const torn = hash3(x, yy, z + variant) > 0.78;
      return torn ? skin(x, yy, z) : rags;
    });
  }
  // Arms reaching forward at chest height.
  for (const x of [0, 7]) {
    m.box(x, 8, 4, 1, 2, 5, rags);
    m.box(x, 8, 9, 1, 2, 2, skin);
  }
  // Head, dropped low and thrust forward
  m.box(1, 9, 4, 6, 5, 6, skin);
  m.box(1, 13, 4, 6, 1, 6, (x, y, z) => (hash3(x, y, z + variant) > 0.5 ? 0x3a3428 : skin(x, y, z))); // patchy hair
  m.set(2, 11, 10, 0xff5a3a, true); m.set(5, 11, 10, 0xff5a3a, true); // dim glowing eyes
  m.box(3, 9, 10, 2, 1, 1, 0x2a1414); // open mouth
  return m;
}

// ---------------------------------------------------------------- dice

const PIPS = {
  1: [[2, 2]],
  2: [[1, 1], [3, 3]],
  3: [[1, 1], [2, 2], [3, 3]],
  4: [[1, 1], [1, 3], [3, 1], [3, 3]],
  5: [[1, 1], [1, 3], [3, 1], [3, 3], [2, 2]],
  6: [[1, 1], [1, 2], [1, 3], [3, 1], [3, 2], [3, 3]],
};

/** Which face shows each value: outward normal in model space. Opposite faces sum to 7. */
export const DIE_FACES = {
  1: [0, 1, 0], 6: [0, -1, 0],
  2: [0, 0, 1], 5: [0, 0, -1],
  3: [1, 0, 0], 4: [-1, 0, 0],
};

/** 7x7x7 voxel d6 with rounded corners; pips sit on a 3x3 grid with one-voxel gaps. */
export const DIE_VOXELS = 7;
export function dieModel(body = 0xf4f1ea, pip = 0x1d2433, one = 0xc0392b) {
  const N = DIE_VOXELS - 1;
  const m = new VoxelModel();
  m.box(0, 0, 0, DIE_VOXELS, DIE_VOXELS, DIE_VOXELS, (x, y, z) => {
    const edges = [x, y, z].filter((v) => v === 0 || v === N).length;
    return edges >= 2 ? null : body; // bevel every edge for a rounded look
  });
  m.box(1, 1, 1, N - 1, N - 1, N - 1, body); // solid core
  for (const [value, n] of Object.entries(DIE_FACES)) {
    for (const [pu, pv] of PIPS[value]) {
      const u = 2 * pu - 1; const v = 2 * pv - 1; // 1..3 -> 1, 3, 5
      let p;
      if (n[1] !== 0) p = [u, n[1] > 0 ? N : 0, v];
      else if (n[2] !== 0) p = [u, v, n[2] > 0 ? N : 0];
      else p = [n[0] > 0 ? N : 0, u, v];
      m.set(p[0], p[1], p[2], Number(value) === 1 ? one : pip);
    }
  }
  return m;
}

/** Two posts and crossed planks. */
export function barricadeModel() {
  const m = new VoxelModel();
  m.box(0, 0, 1, 1, 5, 1, P.woodDark);
  m.box(6, 0, 1, 1, 5, 1, P.woodDark);
  m.box(-1, 1, 2, 9, 1, 1, P.woodLight);
  m.box(-1, 3, 2, 9, 1, 1, P.wood);
  for (let i = 0; i < 7; i++) m.set(i, 1 + Math.floor(i * 0.6), 3, P.woodLight);
  m.set(0, 5, 1, P.snow); m.set(6, 5, 1, P.snow);
  return m;
}
