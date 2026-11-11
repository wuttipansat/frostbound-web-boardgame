// MAP-6: the town plan. A seeded direction (from map.look) points to the town centre; the colony sits at the edge
// of town. Blocks that way are urban (a suburban band, then downtown with an industrial side), blocks the other
// way are outskirts (houses with gardens, farms, woodland). Shared by the rules (what places go where) and the
// board (what a block looks like).

/** A small integer hash → [0, 1). */
export function hashZ(a, b, c) {
  let x = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1440662683)) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** The town direction (unit vector in block space) and which side of it the industrial zone lies on. */
export function townOf(look = 0) {
  const a = hashZ(look, 13, 7) * Math.PI * 2;
  return { dx: Math.cos(a), dz: Math.sin(a), side: hashZ(look, 17, 3) < 0.5 ? 1 : -1 };
}

/** How far a block lies toward the town centre (in blocks; < 0.35 = outskirts, ≥ 2.4 = the downtown core). */
export function townDepth(bx, bz, look = 0) {
  const { dx, dz } = townOf(look);
  return bx * dx + bz * dz + (hashZ(bx, bz, look + 5) - 0.5) * 0.5;
}

export const ZONES = ['outskirts', 'residential', 'commercial', 'industrial'];

/** The zone of a block: 'colony' | 'outskirts' | 'residential' | 'commercial' | 'industrial'. */
export function zoneOf(bx, bz, look = 0) {
  if (!bx && !bz) return 'colony';
  const { dx, dz, side } = townOf(look);
  const t = townDepth(bx, bz, look);
  const p = (-bx * dz + bz * dx) * side; // across the town axis: the industrial side
  if (t < 0.35) return 'outskirts';
  if (t < 2) return p > 2 ? 'industrial' : 'residential';
  return p > 1.2 ? 'industrial' : 'commercial';
}

/** Decoration block kinds that fit a zone (picked with one random draw, as before). */
export const FILLER_BY_ZONE = {
  outskirts: ['park', 'park', 'ruins', 'parking'],          // woodland, burnt-out houses, an old car lot
  residential: ['park', 'shops', 'plaza', 'parking', 'ruins'],
  commercial: ['plaza', 'shops', 'shops', 'parking', 'park'],
  industrial: ['containers', 'rail', 'parking', 'ruins'],
};
