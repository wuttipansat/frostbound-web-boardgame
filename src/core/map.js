// MAP-1: the city grows stage by stage. A block is one cell of the city grid (the colony at 0,0);
// streets run on the block edges ("corners" lattice: corner cx,cz is the top-left corner of block cx,cz).
// Stage n has a (2n+1)×(2n+1) outline, irregular: some ring blocks are left out, a few poke one step past it.
import { random } from './rng.js';
import { LOCATIONS, PLACE_TABLE, FILLER_KINDS, PLACE_RULES, TIER_STAGE, yieldsOf } from '../content/locations.js';
import { ITEMS } from '../content/items.js';
import { zoneOf, FILLER_BY_ZONE } from './zones.js';

const key = (x, z) => `${x},${z}`;
const parse = (k) => k.split(',').map(Number);
const ring = (x, z) => Math.max(Math.abs(x), Math.abs(z));

// Stage 1 (MAP-1c): the colony, the grocery and the gas station; the rest of the 3×3 is decoration. Fixed.
const START_BLOCKS = {
  '0,0': { kind: 'colony', placeId: 'colony' },
  '1,-1': { kind: 'place', placeId: 'grocery' }, '-1,-1': { kind: 'place', placeId: 'gas' },
  '0,-1': { kind: 'shops' }, '1,0': { kind: 'parking' }, '0,1': { kind: 'ruins' },
  '-1,0': { kind: 'plaza' }, '1,1': { kind: 'containers' }, '-1,1': { kind: 'park' },
};
// The six-place town of older versions: old saves (no map) and rule tests.
const LEGACY_BLOCKS = {
  '0,0': { kind: 'colony', placeId: 'colony' },
  '0,-1': { kind: 'place', placeId: 'police' }, '1,-1': { kind: 'place', placeId: 'grocery' },
  '1,0': { kind: 'place', placeId: 'school' }, '0,1': { kind: 'place', placeId: 'hospital' },
  '-1,0': { kind: 'place', placeId: 'library' }, '-1,-1': { kind: 'place', placeId: 'gas' },
  '1,1': { kind: 'parking' }, '-1,1': { kind: 'containers' },
};
function startRoads() {
  const r = [];
  for (const c of [0, 1]) for (let i = -1; i <= 1; i++) r.push(`${c},${i},v`, `${i},${c},h`);
  return r;
}
// Fronts of the stage-1 blocks (the first six places keep the sides they always faced).
const OLD_FRONT = { police: 'z', grocery: 'z', school: 'z', hospital: 'x', library: 'x', gas: 'x' };
for (const blocks of [START_BLOCKS, LEGACY_BLOCKS]) {
  const roads = new Set(startRoads());
  for (const [k, b] of Object.entries(blocks)) if (b.kind !== 'colony') b.front = OLD_FRONT[b.placeId] ?? frontOf(roads, ...parse(k));
}
export const START_MAP = Object.freeze({ stage: 1, blocks: START_BLOCKS, roads: startRoads(), searchesSinceMap: 0, pending: false });
export const LEGACY_MAP = Object.freeze({ ...START_MAP, blocks: LEGACY_BLOCKS });
/** The places that come with a map's blocks. */
export const mapPlaces = (m) => Object.values(m.blocks).filter((b) => b.placeId).map((b) => b.placeId);
/** The original places, in the order growth brings back the missing ones (library first: engine + heater parts). */
export const ORIGINALS = ['library', 'hospital', 'police', 'school'];

export const newMap = (legacy = false) => JSON.parse(JSON.stringify(legacy ? LEGACY_MAP : START_MAP));
/** The state's map (old saves: the six-place town). */
export const mapOf = (s) => s.map ?? LEGACY_MAP;

/** Searches it takes to find the map that opens stage n+1: [min, max] (guaranteed at max). */
export const mapRange = (stage) => (stage === 1 ? [3, 4] : [3 * stage * stage + 2, 4 * stage * stage + 4]); // 3–4, 14–20, 29–40, 50–68, …

// ---------------------------------------------------------------- places

/** A place's type (its content id): new places carry `type`, the first six are their own type. */
export const typeOf = (s, id) => s.locations?.[id]?.type ?? id;
export const locDef = (s, id) => LOCATIONS[typeOf(s, id)] ?? LOCATIONS.grocery; // (an unknown type from a save: a plain shop)
/** Every place on the map, colony first. */
export const placesOf = (s) => Object.keys(s.locations);
export const outsideOf = (s) => placesOf(s).filter((l) => l !== 'colony');
/** Block of a place ('bx,bz'). */
export function blockOf(s, id) {
  return cacheOf(mapOf(s)).index.get(id) ?? null;
}
/** Distance ring of a place from the colony (0 = colony). */
export function ringOf(s, id) {
  const k = blockOf(s, id);
  return k ? ring(...parse(k)) : 1;
}

// ---------------------------------------------------------------- roads

const segEnds = (seg) => {
  const [x, z, d] = seg.split(',');
  const a = [+x, +z];
  return [a, d === 'h' ? [a[0] + 1, a[1]] : [a[0], a[1] + 1]];
};
const segKey = (a, b) => (a[0] === b[0] ? `${a[0]},${Math.min(a[1], b[1])},v` : `${Math.min(a[0], b[0])},${a[1]},h`);
const cornersOf = (bx, bz) => [[bx, bz], [bx + 1, bz], [bx, bz + 1], [bx + 1, bz + 1]];
const sidesOf = (bx, bz) => [`${bx},${bz},h`, `${bx},${bz + 1},h`, `${bx},${bz},v`, `${bx + 1},${bz},v`];

// States are cloned on every action, so derived data is cached by the map's content (a few maps at a time).
const caches = new Map();
const byArray = new WeakMap();
function cacheOf(m) {
  let c = byArray.get(m.roads);
  if (c) return c;
  const k = `${m.stage}|${m.roads.join(';')}`;
  c = caches.get(k);
  if (!c) {
    const graph = new Map();
    for (const seg of m.roads) {
      const [a, b] = segEnds(seg).map((p) => key(...p));
      if (!graph.has(a)) graph.set(a, []);
      if (!graph.has(b)) graph.set(b, []);
      graph.get(a).push(b); graph.get(b).push(a);
    }
    const index = new Map(Object.entries(m.blocks).map(([bk, b]) => [b.placeId ?? bk, bk]));
    c = { graph, index, dists: new Map() };
    caches.set(k, c);
    if (caches.size > 8) caches.delete(caches.keys().next().value);
  }
  byArray.set(m.roads, c);
  return c;
}
/** Street distance in segments from any of `from` corners to the nearest of `to` corners (Infinity if cut off). */
function roadSteps(g, from, to) {
  const goal = new Set(to.map((p) => key(...p)));
  let frontier = from.map((p) => key(...p)).filter((k) => g.has(k) || goal.has(k));
  const seen = new Set(frontier);
  for (let d = 0; frontier.length; d++) {
    if (frontier.some((k) => goal.has(k))) return d;
    const next = [];
    for (const k of frontier) for (const n of g.get(k) ?? []) if (!seen.has(n)) { seen.add(n); next.push(n); }
    frontier = next;
  }
  return Infinity;
}

/** Road distance between two places, in blocks (1 = next door). */
export function roadDistance(s, from, to) {
  if (from === to) return 0;
  const m = mapOf(s);
  const a = blockOf(s, from); const b = blockOf(s, to);
  if (!a || !b) return 2;
  const memo = cacheOf(m).dists;
  const mk = a < b ? `${a}|${b}` : `${b}|${a}`;
  let d = memo.get(mk);
  if (d === undefined) memo.set(mk, d = roadSteps(cacheOf(m).graph, cornersOf(...parse(a)), cornersOf(...parse(b))));
  return Number.isFinite(d) ? 1 + d : 2 + ring(...parse(b));
}

/** Is every place on the map connected to the colony by road? */
export function allReachable(s) {
  return outsideOf(s).every((id) => Number.isFinite(roadSteps(cacheOf(mapOf(s)).graph, cornersOf(0, 0), cornersOf(...parse(blockOf(s, id) ?? '0,0')))));
}

// ---------------------------------------------------------------- growth

const pickWeighted = (s, entries) => {
  const total = entries.reduce((n, [, w]) => n + w, 0);
  let r = random(s) * total;
  return (entries.find(([, w]) => (r -= w) < 0) ?? entries[0])[0];
};

/** Grow the map one stage: a new irregular ring of blocks, new places, new streets. Returns the new block keys. */
export function growMap(s, makePlace) {
  if (!s.map) s.map = newMap(true); // old saves: the six-place town
  const m = s.map;
  const n = m.stage + 1;
  const has = (x, z) => !!m.blocks[key(x, z)];
  const added = [];
  // 1. The ring: skip some blocks (corners more often); keep the shape connected.
  const ringBlocks = [];
  for (let x = -n; x <= n; x++) for (let z = -n; z <= n; z++) if (ring(x, z) === n && !has(x, z)) ringBlocks.push([x, z]);
  const keep = new Set();
  for (const [x, z] of ringBlocks) {
    const corner = Math.abs(x) === n && Math.abs(z) === n;
    if (random(s) >= (corner ? 0.45 : 0.18)) keep.add(key(x, z));
  }
  const adj = (x, z) => [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]];
  const placed = new Set(Object.keys(m.blocks));
  for (let changed = true; changed;) {
    changed = false;
    for (const k of [...keep]) {
      if (placed.has(k)) continue;
      if (adj(...parse(k)).some(([ax, az]) => placed.has(key(ax, az)))) { placed.add(k); added.push(k); changed = true; }
    }
  }
  // 2. One to three blocks poke one step past the outline.
  const pokes = 1 + Math.floor(random(s) * 3);
  const ringAdded = added.slice();
  for (let i = 0; i < pokes; i++) {
    const from = ringAdded[Math.floor(random(s) * ringAdded.length)];
    if (!from) break;
    const [x, z] = parse(from);
    const out = Math.abs(x) >= Math.abs(z) ? [x + Math.sign(x), z] : [x, z + Math.sign(z)];
    if (!placed.has(key(...out))) { placed.add(key(...out)); added.push(key(...out)); }
  }
  // 3. Streets first (blocks are placeholders), so places can be put where the walk is shortest.
  for (const k of added) m.blocks[k] = { kind: 'pending' };
  m.stage = n;
  growRoads(s, m, added, n);
  // 4. Kinds (MAP-1d): 2–3 places per growth, the rest decoration; old blocks never change. The missing
  //    originals come first, on the new blocks with the shortest road to the colony; then the weighted table.
  let nPlaces = Math.min(added.length, 2 + (random(s) < 0.5 ? 1 : 0));
  const have = new Set(Object.values(m.blocks).map((b) => b.type ?? b.placeId));
  const missing = ORIGINALS.filter((t) => !have.has(t)).slice(0, 2);
  const graph = cacheOf(m).graph;
  const dist = new Map(added.map((k) => [k, roadSteps(graph, cornersOf(0, 0), cornersOf(...parse(k))) + random(s) * 0.5]));
  const byDist = added.slice().sort((a, b) => dist.get(a) - dist.get(b));
  const placesAt = new Set();
  // MAP-6: a place goes where it fits its zone and tier (the nearest fitting block for a missing original).
  const look = m.look ?? 0;
  const tierOk = (t) => (TIER_STAGE[PLACE_RULES[t]?.tier] ?? 1) <= n;
  const fits = (t, k) => tierOk(t) && (PLACE_RULES[t]?.zones.includes(zoneOf(...parse(k), look)) ?? true);
  while (missing.length && nPlaces) {
    const free = byDist.filter((k) => !placesAt.has(k));
    // (an original keeps the nearest block: the run depends on its parts; a fitting one only on a near tie)
    const k = free.find((b) => fits(missing[0], b) && dist.get(b) <= dist.get(free[0]) + 1) ?? free[0];
    if (!k) break;
    placesAt.add(k); m.blocks[k] = { kind: 'place', placeId: makePlace(missing[0], k), type: missing.shift() }; nPlaces--;
  }
  const rest = added.filter((k) => !placesAt.has(k)).map((k) => [k, random(s)]).sort((a, b) => a[1] - b[1]).map(([k]) => k);
  const table = PLACE_TABLE.map(([t, w0, per]) => [t, w0 + per * (n - 2)]).filter(([, w]) => w > 0);
  rest.forEach((k, i) => {
    if (i < nPlaces) {
      const options = table.filter(([t]) => fits(t, k));
      const type = pickWeighted(s, options.length ? options : table.filter(([t]) => tierOk(t)));
      m.blocks[k] = { kind: 'place', placeId: makePlace(type, k), type };
    } else { const kinds = FILLER_BY_ZONE[zoneOf(...parse(k), m.look ?? 0)] ?? FILLER_KINDS; m.blocks[k] = { kind: kinds[Math.floor(random(s) * kinds.length)] }; } // MAP-6: decoration that fits the zone
  });
  // 4b. MAP-6: the map always holds a food, a wood and a metal source: if one is missing, a decoration block of this
  //     growth becomes one (a place that fits its zone when there is one).
  for (const res of ['food', 'wood', 'metal']) {
    if (Object.values(m.blocks).some((b) => b.kind === 'place' && yieldsOf(b.type ?? b.placeId, ITEMS)[res])) continue;
    const sources = table.filter(([t]) => tierOk(t) && yieldsOf(t, ITEMS)[res]);
    const spots = added.filter((k) => m.blocks[k].kind !== 'place');
    const k = spots.find((b) => sources.some(([t]) => fits(t, b))) ?? spots[0];
    if (!k || !sources.length) continue;
    const fit = sources.filter(([t]) => fits(t, k));
    const type = pickWeighted(s, fit.length ? fit : sources);
    m.blocks[k] = { kind: 'place', placeId: makePlace(type, k), type };
  }
  // 5. Each block keeps the front it gets now (its look never depends on streets added later).
  const roadSet = new Set(m.roads);
  for (const k of added) m.blocks[k].front = m.blocks[k].kind === 'place' ? busiestFront(roadSet, ...parse(k)) : frontOf(roadSet, ...parse(k)); // MAP-8: a place faces its busiest street
  return added;
}

/** The street side a block faces: +z, +x, −z, −x in that order of preference (the camera sees +z and +x). */
export function frontOf(roads, bx, bz) {
  const sides = { z: `${bx},${bz + 1},h`, x: `${bx + 1},${bz},v`, '-z': `${bx},${bz},h`, '-x': `${bx},${bz},v` };
  return ['z', 'x', '-z', '-x'].find((f) => roads.has(sides[f])) ?? 'z';
}

/** MAP-8: the side of a block on the street with the most connections at its two corners (ties: the camera's sides first). */
export function busiestFront(roads, bx, bz) {
  const deg = (x, z) => [`${x},${z},h`, `${x - 1},${z},h`, `${x},${z},v`, `${x},${z - 1},v`].filter((r) => roads.has(r)).length;
  const sides = { z: [`${bx},${bz + 1},h`, [bx, bz + 1], [bx + 1, bz + 1]], x: [`${bx + 1},${bz},v`, [bx + 1, bz], [bx + 1, bz + 1]], '-z': [`${bx},${bz},h`, [bx, bz], [bx + 1, bz]], '-x': [`${bx},${bz},v`, [bx, bz], [bx, bz + 1]] };
  let best = null; let score = -1;
  for (const f of ['z', 'x', '-z', '-x']) { const [seg, a, b] = sides[f]; if (!roads.has(seg)) continue; const sc = deg(...a) + deg(...b); if (sc > score) { score = sc; best = f; } }
  return best ?? 'z';
}

/** New streets: extend dead ends outward, then link every new block to the network, plus a few spurs. */
function growRoads(s, m, added, n) {
  const roads = new Set(m.roads);
  const lim = n + 2; // corners stay within the outline (+1 block)
  const inside = ([x, z]) => x >= -lim + 1 && x <= lim && z >= -lim + 1 && z <= lim && placedNear(m, [x, z]);
  const nodes = () => {
    const out = new Set();
    for (const seg of roads) for (const p of segEnds(seg)) out.add(key(...p));
    return out;
  };
  const step = ([x, z]) => [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]];
  // Main roads keep going: a dead end on the old outline continues 1–2 segments outward (sometimes bending).
  const deg = new Map();
  for (const seg of roads) for (const p of segEnds(seg)) deg.set(key(...p), (deg.get(key(...p)) ?? 0) + 1);
  for (const [k, d] of deg) {
    if (d !== 1 || random(s) < 0.35) continue;
    let p = parse(k);
    const out = Math.abs(p[0] - 0.5) >= Math.abs(p[1] - 0.5) ? [Math.sign(p[0] - 0.5), 0] : [0, Math.sign(p[1] - 0.5)];
    let dir = out;
    const len = 1 + Math.floor(random(s) * 2);
    for (let i = 0; i < len; i++) {
      const q = [p[0] + dir[0], p[1] + dir[1]];
      if (!inside(q)) break;
      roads.add(segKey(p, q)); p = q;
      if (random(s) < 0.3) dir = [dir[1], dir[0]].map((v) => v * (random(s) < 0.5 ? 1 : -1));
    }
  }
  // Every new block touches a street: a shortest path (random tie-breaks, so streets bend) from one of its sides.
  for (const k of added) {
    const [bx, bz] = parse(k);
    if (sidesOf(bx, bz).some((sg) => roads.has(sg))) continue;
    const net = nodes();
    const starts = cornersOf(bx, bz);
    const prev = new Map(starts.map((p) => [key(...p), null]));
    let queue = starts.slice();
    let hit = null;
    while (queue.length && !hit) {
      const next = [];
      for (const p of queue) {
        if (net.has(key(...p))) { hit = p; break; }
        const nb = step(p).filter(inside).sort(() => random(s) - 0.5);
        for (const q of nb) if (!prev.has(key(...q))) { prev.set(key(...q), p); next.push(q); }
      }
      queue = next;
    }
    if (!hit) continue;
    for (let p = hit; prev.get(key(...p));) { const q = prev.get(key(...p)); roads.add(segKey(p, q)); p = q; }
    // Reached from a corner only: add one of the block's sides so it fronts a street.
    if (!sidesOf(bx, bz).some((sg) => roads.has(sg))) {
      const c = starts.find((p) => nodes().has(key(...p))) ?? starts[0];
      const opts = sidesOf(bx, bz).filter((sg) => segEnds(sg).some((e) => e[0] === c[0] && e[1] === c[1]));
      roads.add(opts[Math.floor(random(s) * opts.length)]);
    }
  }
  // A few dead-end spurs.
  const spurs = 1 + Math.floor(random(s) * 3);
  const net = [...nodes()].map(parse);
  for (let i = 0; i < spurs; i++) {
    const p = net[Math.floor(random(s) * net.length)];
    const q = step(p)[Math.floor(random(s) * 4)];
    if (inside(q)) roads.add(segKey(p, q));
  }
  m.roads = [...roads];
}

/** Is a corner on the edge of some block of the map? (keeps spurs on the slab) */
function placedNear(m, [cx, cz]) {
  return [[cx, cz], [cx - 1, cz], [cx, cz - 1], [cx - 1, cz - 1]].some(([x, z]) => m.blocks[key(x, z)]);
}
