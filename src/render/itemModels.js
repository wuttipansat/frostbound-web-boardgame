// MAP-2 E: small voxel models, one per item type, painted into the item tiles by the art studio
// (cached images) whenever an item has no picture of its own in public/items/.
import { VoxelModel } from './voxel.js';

const M = () => new VoxelModel();
const MODELS = {
  food() { // a dented tin can with a label
    const m = M();
    for (let y = 0; y < 7; y++) for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
      if (x * x + z * z > 5) continue;
      m.set(x, y, z, y === 0 || y === 6 ? 0xb8c0c8 : y >= 2 && y <= 4 ? 0xc0392b : 0xd8dee6);
    }
    m.set(0, 7, 0, 0x8a939c);
    return m;
  },
  medicine() { // a white kit with a red cross
    const m = M(); m.box(-4, 0, -2, 8, 5, 4, 0xeceff2);
    m.box(-1, 1, 2, 2, 3, 1, 0xc0392b); m.box(-2, 2, 2, 4, 1, 1, 0xc0392b); m.box(-1, 5, -1, 2, 1, 2, 0x6c7580);
    return m;
  },
  consumable() { // a bandage roll
    const m = M();
    for (let x = -2; x <= 2; x++) for (let y = 0; y < 5; y++) for (let z = -2; z <= 2; z++) if (x * x + (y - 2) * (y - 2) <= 5) m.set(x, y, z, x === 0 && y === 2 ? 0xd8c8a8 : 0xf4f1ea);
    m.box(2, 0, -1, 2, 1, 2, 0xf4f1ea);
    return m;
  },
  fuel() { // a red jerry can
    const m = M(); m.box(-3, 0, -2, 6, 8, 4, 0xb0392b);
    m.box(-2, 8, -1, 2, 1, 2, 0x2a2f36); m.box(1, 8, -1, 2, 1, 1, 0x8a939c); m.box(-2, 2, 2, 4, 4, 1, 0x962f24);
    return m;
  },
  tools() { // a hammer
    const m = M(); m.box(-1, 0, 0, 1, 8, 1, 0x8a5a2b); m.box(-3, 8, -1, 5, 2, 2, 0x8e979f); m.set(2, 9, -1, 0x6c7580);
    return m;
  },
  material() { // planks and a scrap plate
    const m = M(); m.box(-4, 0, -2, 8, 1, 2, 0xa0703a); m.box(-4, 1, 0, 8, 1, 2, 0x8a5a2b); m.box(-2, 2, -2, 5, 1, 4, 0x8e979f);
    return m;
  },
  weapon() { // a bat with tape
    const m = M();
    for (let i = 0; i < 10; i++) m.box(-4 + i, i, 0, 1, 1, 1 + (i > 5 ? 1 : 0), i < 3 ? 0x2a2f36 : 0xc49a5a);
    return m;
  },
  armor() { // a padded vest
    const m = M(); m.box(-3, 0, -1, 6, 7, 3, 0x4a5a6a); m.clearBox(-1, 5, -1, 2, 2, 3);
    for (let y = 1; y < 7; y += 2) m.box(-3, y, 2, 6, 1, 1, 0x5d6f80);
    return m;
  },
  book() { // a thick book
    const m = M(); m.box(-3, 0, -2, 6, 2, 5, 0xf2ead8); m.box(-3, 2, -2, 6, 1, 5, 0x7a3a2a); m.box(-3, -1, -2, 6, 1, 5, 0x7a3a2a); m.box(-4, -1, -2, 1, 4, 5, 0x6a2f22);
    return m;
  },
  gadget() { // a flashlight
    const m = M(); m.box(-4, 0, 0, 7, 2, 2, 0x2a2f36); m.box(3, -1, -1, 2, 4, 4, 0x3a4048); m.box(5, 0, 0, 1, 2, 2, 0xffe8a0, true);
    return m;
  },
  junk() { // a tangle of wire and a bottle
    const m = M(); m.box(-3, 0, -1, 2, 5, 2, 0x3f7a4a); m.set(-2, 5, 0, 0x3f7a4a);
    for (let i = 0; i < 6; i++) m.set(i - 1, (i % 3), (i % 2) - 1, 0xb87333);
    return m;
  },
  survivor() { // a little figure with a beanie
    const m = M(); m.box(-1, 0, 0, 1, 3, 1, 0x2f3440); m.box(1, 0, 0, 1, 3, 1, 0x2f3440); m.box(-2, 3, -1, 5, 4, 3, 0xd8743a);
    m.box(-1, 7, -1, 3, 3, 3, 0xe8b98f); m.box(-1, 10, -1, 3, 1, 3, 0x2f5fa8); m.set(0, 11, 0, 0xe9e1cf);
    return m;
  },
  map() { // a folded paper map
    const m = M();
    for (let x = -4; x < 4; x++) for (let z = -3; z < 3; z++) m.set(x, Math.floor((x + 4) / 2) % 2, z, (x + 4) % 4 < 2 ? 0xe8dfc4 : 0xd6cba8);
    m.set(-1, 1, 0, 0xc0392b); m.set(1, 1, -1, 0x2f5fa8); m.set(2, 1, 1, 0x3f7a4a);
    return m;
  },
};

/** The voxel model for an item type (unknown types get the junk model). */
export function itemTypeModel(type) { return (MODELS[type] ?? MODELS.junk)(); }
export const ITEM_MODEL_TYPES = Object.keys(MODELS);
