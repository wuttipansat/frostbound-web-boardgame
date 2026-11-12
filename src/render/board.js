// The diorama board: a snowed-in city built block by block from the game map (MAP-1). The colony sits in
// the middle block; places, filler blocks (parking, plaza, park, ruins, rail yard, containers), streets on
// the block edges, instanced trees / rocks / cars / lamps, and pick targets for each place.
import * as THREE from 'three';
import { VoxelModel, hash3, MATERIALS, geometriesFor, groupOf, packedBounds } from './voxel.js';
import { P } from './palette.js';
import { LOCATION_BUILDERS_HD, colonyHD, treeModelHD, rockModelHD } from './buildings.js';
import { buildTerrainHD, ROAD } from './terrain.js';
import { birchModel, stumpModel, barrierModel, fishingModel, boatModel, bridgeParapetModel, snowHeapModel, sandbagModel, driftModel, woodpileModel, scrapHeapModel, cratesModel, carModel, lampModel, containerModel, clutterModel, CLUTTER_KINDS, crossingModel, wagonModel, bufferStopModel, shelterModel, stopSignModel, directionSignModel, safeZoneModel, fenceModel, campModel, laundryModel, crowModel, bulbModel, FURNITURE, furnitureModel, trafficLightModel, streetSignModel, powerPoleModel, vehicleModel, checkpointModel, burntCarModel, tentModel, statueModel } from './props.js';
import { markingQuads, lampSpots, railQuads, streetRuns, rampQuads } from './streets.js';
import { blockSlab, GROUND } from './ground.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as city from './city.js';
import { downsample } from './detail.js';
import { LOCATIONS, yieldsOf } from '../content/locations.js';
import { ITEMS } from '../content/items.js';
import { START_MAP, LEGACY_MAP } from '../core/map.js';
import { zoneOf, townDepth, townOf } from '../core/zones.js';

export const BOARD = {
  block: 30,          // MAP-3: block pitch (world): a 3-chunk block + one street (two lanes + sidewalks)
  radius: 46,         // stage-1 slab half size (world units)
  locationRadius: 27,
  colonyRadius: 15,   // MAP-3: colony wall radius (world units): the wall fills the 5×5-chunk plot
  ringRoad: 12.5,
  buildingScale: 0.6, // world units per building voxel
};
// MAP-3 E: the old rail-yard block (a short stretch of track) is gone: the railway now runs across the city, and
// a 'rail' block is an industrial yard built from chunks like the other decoration blocks.
const FILLER_MODELS = {};
// MAP-6: places whose close-up level reuses the authored model (big yards and woods: the refine pass adds little; keeps the pack small).
const COARSE_PLACES = new Set(['farmhouse', 'mall', 'military', 'factory', 'forest', 'scrapyard', 'hardware']);
const PLACE_SCALE = 1; // MAP-3: places and small buildings fill their chunks (0.3 world units per authored voxel)
// What fills a free chunk, by block kind: [content, weight].
const RECIPES = {
  place: [['house', 55], ['trees', 18], ['car', 10], ['yard', 10], ['clutter', 7]],
  shops: [['shop', 80], ['trees', 10], ['clutter', 10]],
  parking: [['car', 35], ['house', 35], ['yard', 30]],
  containers: [['yard', 75], ['house', 15], ['clutter', 10]],
  plaza: [['trees', 35], ['shop', 45], ['clutter', 20]],
  park: [['trees', 80], ['clutter', 20]],
  ruins: [['ruin', 55], ['house', 20], ['rocks', 25]],
  rail: [['yard', 60], ['car', 15], ['clutter', 25]],
};
// A big piece some decoration blocks put on their street side: [model key, wide, deep].
/** MAP-6: place companions (one chunk): a school's playground, a hospital's pharmacy, … */
const PLACE_EXTRAS = { school: 'playground', hospital: 'pharmacy', police: 'impound', church: 'graveyard', gas: 'diner', motel: 'diner' };
const EXTRA_MODELS = { playground: city.playground, pharmacy: city.pharmacy, impound: city.impound, graveyard: city.graveyard, diner: city.diner, watertower: city.waterTower, substation: city.substation };
const CENTERPIECE = { parking: ['parking', 2, 2], plaza: ['fountain', 1, 1], park: ['fountain', 1, 1], ruins: ['ruinBig', 1, 1] };
/** MAP-6: fountains only stand in town parks and squares (an outskirts "park" is woodland, an industrial one a lot). */
export const centerpieceOf = (kind, district) => (CENTERPIECE[kind]?.[0] === 'fountain' && district !== 'downtown' && district !== 'residential' ? null : CENTERPIECE[kind] ?? null);
// MAP-3: colony slots (world x, z from the fire; front faces the fire). Fixed for every game; two reserved lots.
export const COLONY_SLOTS = {
  dorm: [10.5, 4.5], infirmary: [4.5, 10.5], greenhouse: [-10.5, 4.5], workshop: [-4.5, 10.5],
  radio: [10.5, -4.5], towers: [4.5, -10.5], garage: [-10.5, -4.5], spare: [-4.5, -10.5],
  'reserved-1': [10.2, 10.2], 'reserved-2': [-10.2, -10.2],
};
/** What a slot shows for the base levels ({ dorm: 2, wall: 1, crawler: 3, … }). */
export const slotView = (id, levels = {}) => {
  if (id === 'towers') return ['towers', levels.wall ?? 0];
  if (id === 'garage') return ['garage', levels.crawler ?? 0];
  if (id === 'spare' || id.startsWith('reserved')) return [id.startsWith('reserved') ? 'reserved' : 'spare', 0];
  return [id, levels[id] ?? 0];
};
// The six starting places keep their old fronts; new ones face a street (+z / +x first: the sides the camera sees).
const START_FRONT = { police: 'z', grocery: 'z', school: 'z', hospital: 'x', library: 'x', gas: 'x' };

const parse = (k) => k.split(',').map(Number);

// MAP-1b / MAP-3: a block is 3×3 chunks inside its sidewalks; a place takes some of them at the street side, the
// rest hold small buildings and props. Chunk size = (pitch − one street with its sidewalks) / 3.
export { GROUND };
export const CHUNK = (BOARD.block - 2 * ROAD.walk) / 3;
// MAP-3: the colony's row and column are 5 chunks wide (the colony plot is 5×5), every other one 3; street lines
// stay straight, so a block in the colony's row is 5×3. Grid → world: x = sign(bx)·(|bx|·pitch + CHUNK).
/** Chunks along one axis of grid row / column b. */
export const chunksOf = (b) => (b === 0 ? 5 : 3);
/** World centre of grid row / column b. */
export const blockPos = (b) => (b === 0 ? 0 : Math.sign(b) * (Math.abs(b) * BOARD.block + CHUNK));
/** Half the block size (street centre line to street centre line) along one axis. */
export const blockHalf = (b) => chunksOf(b) * CHUNK / 2 + ROAD.walk;
/** Grid row / column of a world coordinate. */
export const gridOf = (x) => (Math.abs(x) <= blockHalf(0) ? 0 : Math.sign(x) * Math.round((Math.abs(x) - CHUNK) / BOARD.block));
/** World position of a street line (the low edge of grid row / column c). */
const lineOf = (c) => blockPos(c) - blockHalf(c);
/** World position of a street corner (cx,cz = top-left corner of block cx,cz). */
const cornerPos = (cx, cz) => [lineOf(cx), lineOf(cz)];
/** From a block centre to the inner edge of its sidewalk, along x and z. */
const edgesOf = (bx, bz) => [chunksOf(bx) * CHUNK / 2, chunksOf(bz) * CHUNK / 2];
// Chunks a place covers: [wide, deep] (default 2×2); narrow, tall buildings take one column.
const FOOT = { church: [1, 2], hardware: [1, 1], military: [3, 2] }; // MAP-6: a hardware store is a corner shop; the army base fills its block

/**
 * MAP-3 E: the railway runs through the middle chunk row of one block row (or column) next to the colony's, across
 * the whole city: { axis: 'x' | 'z' (direction of the track), r (that row / column), c (world line) }.
 */
export function railLine(m) {
  const look = m?.look ?? 0;
  const axis = hash3(look, 3, 1) < 0.5 ? 'x' : 'z';
  const r = hash3(look, 5, 2) < 0.5 ? 1 : -1;
  return { axis, r, c: blockPos(r), look };
}
const RAIL_CLEAR = 2.2; // half the corridor kept clear of buildings and props
/** MAP-6: a frozen river across the town direction, two blocks out toward the town (bridges where streets cross). */
export function riverLine(m) {
  const look = m?.look ?? 0; const { dx, dz } = townOf(look);
  const axis = Math.abs(dx) > Math.abs(dz) ? 'z' : 'x';
  const r = (axis === 'z' ? dx : dz) > 0 ? 2 : -2;
  return { axis, r, c: blockPos(r), look, river: true };
}
/** The corridors that cut through block rows: the railway and the river. */
export const cutLines = (m) => [railLine(m), riverLine(m)];

/** Where a place sits in its block: front direction, footprint (in chunks), centre and the chunks it covers. */
export function placePlan(id, type, bx, bz, roads, foot = null, front = null, rail = null) {
  const c = new THREE.Vector3(blockPos(bx), GROUND, blockPos(bz)); // MAP-3 D: blocks are raised slabs
  const fronts = { z: `${bx},${bz + 1},h`, x: `${bx + 1},${bz},v`, '-z': `${bx},${bz},h`, '-x': `${bx},${bz},v` };
  // MAP-1d: the block's stored front (older maps: work it out from the streets).
  const pick = front ?? START_FRONT[id] ?? ['z', 'x', '-z', '-x'].find((f) => roads.has(fronts[f])) ?? 'z';
  const toFront = { z: [0, 1], x: [1, 0], '-z': [0, -1], '-x': [-1, 0] }[pick];
  const fwd = new THREE.Vector3(toFront[0], 0, toFront[1]);
  const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
  let [fw, fd] = foot ?? FOOT[type] ?? [2, 2];
  // (MAP audit: repeats used to be squeezed into one chunk row and read as tiny copies; now full size.)
  // Rows run back from the front street, columns along it (3 each, 5 in the colony's row / column).
  const alongX = toFront[0] !== 0;
  const rows = chunksOf(alongX ? bx : bz); const cols = chunksOf(alongX ? bz : bx);
  const edge = rows * CHUNK / 2; // block centre → front sidewalk
  // MAP-3 E: in the rail row the middle chunk row (across the track) stays free: places shrink to one row / column.
  // MAP-6: the same for the river (a block where both cross keeps a free row and a free column).
  let railCut = null;
  for (const line of [].concat(rail ?? [])) {
    if ((line.axis === 'x' ? bz : bx) !== line.r) continue;
    railCut ??= {};
    const trackAlongRows = (line.axis === 'x') === alongX; // track runs along the plan's rows (cuts a column)
    if (trackAlongRows) { railCut.col = Math.floor(cols / 2); fw = Math.min(fw, Math.floor(cols / 2)); }
    else { railCut.row = 1; fd = 1; }
  }
  // MAP-3 E: a gas station takes a corner of its block (the canopy meets two streets); others any column.
  let col = type === 'gas' ? (hash3(bx, 43, bz) < 0.5 ? 0 : cols - fw) : Math.floor(hash3(bx, 43, bz) * (cols + 1 - fw)); // first lateral column
  if (railCut?.col !== undefined && col <= railCut.col && col + fw > railCut.col) col = hash3(bx, 45, bz) < 0.5 ? 0 : railCut.col + 1;
  const lat = (col + fw / 2 - cols / 2) * CHUNK;
  const fwdC = edge - fd * CHUNK / 2;
  const covered = [];
  for (let i = 0; i < fd; i++) for (let j = col; j < col + fw; j++) covered.push(`${i},${j}`); // i: row from the front
  const at = (forward, lateral) => c.clone().addScaledVector(fwd, forward).addScaledVector(side, lateral);
  return { c, fwd, side, fw, fd, lat, rows, cols, edge, center: at(fwdC, lat), covered, at, railCut };
}

/** World centre of chunk (row i from the front, column j) of a block. */
export const chunkCenter = (plan, i, j) => plan.at(plan.edge - (i + 0.5) * CHUNK, (j + 0.5 - plan.cols / 2) * CHUNK);

function placeLayout(id, type, bx, bz, roads, front, rail) {
  const plan = placePlan(id, type, bx, bz, roads, null, front, rail);
  const { at, lat, edge: EDGE } = plan;
  const nSurv = LOCATIONS[type]?.survivorSlots ?? 3;
  return {
    id,
    theta: Math.atan2(bz, bx),
    center: plan.center,
    facing: Math.atan2(plan.fwd.x, plan.fwd.z),
    plan,
    label: plan.center.clone().setY(8),
    // Zombies crowd the entrance on the forecourt; survivors stand on the sidewalk in front.
    zombieSlots: [[EDGE - 0.6, -1.6], [EDGE - 0.6, 0], [EDGE - 0.6, 1.6], [EDGE - 1.7, -0.8], [EDGE - 1.7, 0.8], [EDGE - 1.7, 2.4]].map(([f, l]) => at(f, lat + l)),
    survivorSlots: Array.from({ length: nSurv }, (_, k) => at(EDGE + 1.6, lat + (k - (nSurv - 1) / 2) * 1.9)),
    hitRadius: Math.max(plan.fw, plan.fd) * CHUNK / 2 + 1,
  };
}

function colonyLayout() {
  // Colony: 4 gates (N/E/S/W) with 3 zombie slots each, a ring of survivor spots by the fire.
  const gateDirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  return {
    id: 'colony',
    theta: 0,
    center: new THREE.Vector3(0, GROUND, 0),
    facing: 0,
    label: new THREE.Vector3(0, 9, 0),
    zombieSlots: gateDirs.flatMap(([dx, dz]) => [-1.4, 0, 1.4].map((l) => new THREE.Vector3(
      dx * (BOARD.colonyRadius + 1.6) + (dz !== 0 ? l : 0), GROUND, dz * (BOARD.colonyRadius + 1.6) + (dx !== 0 ? l : 0),
    ))),
    survivorSlots: Array.from({ length: 10 }, (_, k) => {
      const a = (k / 10) * Math.PI * 2 + 0.3;
      return new THREE.Vector3(Math.cos(a) * 4.2, GROUND, Math.sin(a) * 4.2);
    }),
    gates: gateDirs.map(([dx, dz]) => new THREE.Vector3(dx * BOARD.colonyRadius, GROUND, dz * BOARD.colonyRadius)),
    hitRadius: BOARD.colonyRadius + 1,
  };
}

/** Board-space layout for every place on a map (positions, facing, slot anchors). */
export function computeLayout(map = LEGACY_MAP, into = {}) {
  const roads = new Set(map.roads);
  const rail = cutLines(map);
  for (const [k, b] of Object.entries(map.blocks)) {
    if (b.kind !== 'place' || into[b.placeId]) continue;
    into[b.placeId] = placeLayout(b.placeId, b.type ?? b.placeId, ...parse(k), roads, b.front, rail);
  }
  into.colony ??= colonyLayout();
  return into;
}

// ---------------------------------------------------------------- streets

function distToSegment(px, pz, a, b) {
  const abx = b.x - a.x; const abz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((px - a.x) * abx + (pz - a.z) * abz) / (abx * abx + abz * abz)));
  return Math.hypot(px - (a.x + abx * t), pz - (a.z + abz * t));
}

/** Street segments (world) of a map, plus a short road from each colony gate to the streets. */
function streetSegments(roadKeys, layout) {
  const out = [];
  for (const seg of roadKeys) {
    const [cx, cz, d] = seg.split(',');
    const [x0, z0] = cornerPos(+cx, +cz);
    const [x1, z1] = d === 'h' ? cornerPos(+cx + 1, +cz) : cornerPos(+cx, +cz + 1);
    out.push([new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, 0, z1), seg]);
  }
  for (const g of layout.colony.gates) { const f = g.clone().setY(0); out.push([f.clone(), f.clone().normalize().multiplyScalar(blockHalf(0)), 'gate']); } // at road level
  return out;
}

// MAP-6: districts follow the town plan (core/zones.js): the colony sits at the edge of town; toward the town a
// suburban band, then downtown with an industrial side; the other way the outskirts.
const ZONE_DISTRICT = { colony: 'colony', outskirts: 'outskirts', residential: 'residential', commercial: 'downtown', industrial: 'industrial' };
export function districtOf(bx, bz, look = 0) { return ZONE_DISTRICT[zoneOf(bx, bz, look)]; }
/** MAP-6: the downtown core (tall buildings, landmark towers): deep toward the town centre. */
export const coreOf = (bx, bz, look = 0) => townDepth(bx, bz, look) >= 2.2;
/** MAP-4: the main avenue: the colony-row edge line across the railway (seeded side): { axis, c }. */
export function avenueLine(m) {
  const rail = railLine(m);
  const li = hash3(m?.look ?? 0, 19, 4) < 0.5 ? 0 : 1;
  return { axis: rail.axis === 'x' ? 'z' : 'x', c: blockPos(li) - blockHalf(li) };
}
const DISTRICT_RECIPES = {
  downtown: [['shop', 55], ['house', 30], ['car', 8], ['clutter', 7]],
  residential: [['house', 55], ['trees', 22], ['car', 15], ['clutter', 8]],
  industrial: [['yard', 50], ['ruin', 15], ['car', 15], ['house', 10], ['clutter', 10]],
  outskirts: [['house', 50], ['trees', 38], ['car', 6], ['rocks', 6]], // MAP-6: cottages, woodland, a car in a drive
};
// Small building variants by district (city.smallBuilding: floors = 2 + v mod 3; even v with ≤ 3 floors have shopfronts).
const DISTRICT_SMALL = { downtown: [2, 4, 5, 7, 1], residential: [0, 3, 6, 1], industrial: [3, 6, 0] };

/** MAP-3: a decoration block with nothing built on it (a square, a lawn, an empty lot): about a quarter of them. */
export const openBlock = (b, bx, bz, district = null) => RECIPES[b.kind] && b.kind !== 'place' && hash3(bx, 71, bz) < (district === 'outskirts' ? 0.3 : 0.125); // ~1 in 8 (outskirts: open snow, 1 in 3)

/**
 * MAP-3 calmer blocks: the chunks of a block that get something, as [row, column, what]. Built things (the place or
 * centrepiece and 1–2 pieces) stay inside one 3×2 window at the front; other chunks are open, now and then with one
 * bench or one tree. Seeded by the block, so a block never changes.
 */
export const recipeOf = (kind, district) => (kind === 'park' ? RECIPES.park : DISTRICT_RECIPES[district] ?? RECIPES[kind] ?? RECIPES.place);
export function blockPieces(b, bx, bz, plan, recipe = null, district = null) {
  recipe ??= recipeOf(b.kind, district);
  // MAP-5 density: downtown and residential blocks build their front AND back rows (a street wall on both sides);
  // the rows between are a courtyard / alley. Industrial blocks fill a front window with yards and sheds. About one
  // block in eight stays open. Entries: [row, col, what, span] (span 2 = a building over two columns).
  const out = [];
  const h = (k) => hash3(bx * 7 + k, 73, bz * 7 - k);
  const onRail = (i, j) => plan.railCut && (plan.railCut.row === i || plan.railCut.col === j);
  const free = (i, j) => i >= 0 && j >= 0 && i < plan.rows && j < plan.cols && !plan.covered.includes(`${i},${j}`) && !onRail(i, j);
  const used = new Set();
  const take = (i, j, what, span = 1) => { out.push([i, j, what, span]); for (let k = 0; k < span; k++) used.add(`${i},${j + k}`); };
  const open = openBlock(b, bx, bz, district);
  // MAP-6 clusters: a place brings its companion into a free chunk of its block (front row first, beside it).
  const extra = b.kind === 'place' && PLACE_EXTRAS[b.type ?? b.placeId];
  if (extra) {
    const cols = plan.covered.map((c) => +c.split(',')[1]);
    const order = [];
    for (let i = 0; i < plan.rows; i++) for (let j = 0; j < plan.cols; j++) if (free(i, j)) order.push([i, j, i * 10 + Math.min(...cols.map((c) => Math.abs(c - j)))]);
    order.sort((a, c) => a[2] - c[2]);
    if (order.length) take(order[0][0], order[0][1], extra);
  }
  const dense = !open && (district === 'downtown' || district === 'residential') && b.kind !== 'park';
  if (dense) {
    const back = plan.rows - 1;
    for (const i of [0, back]) {
      for (let j = 0; j < plan.cols; j++) {
        if (!free(i, j) || used.has(`${i},${j}`)) continue;
        // Back rows are partly built (downtown 3 in 4, residential 1 in 2): gaps keep it light and let the yards breathe.
        if (i === back && hash3(bx * 9 + j, 95, bz * 9) > (district === 'downtown' ? 0.6 : 0.4)) continue;
        // Downtown: some pairs of chunks become one wide building (office, cinema, garage, landmark tower).
        if (district === 'downtown' && free(i, j + 1) && !used.has(`${i},${j + 1}`) && hash3(bx * 5 + j, 81 + i, bz * 5) < 0.45) {
          const r = hash3(bx * 3 + j, 83 + i, bz * 3);
          take(i, j, district === 'downtown' && plan.core && r < 0.15 ? 'tower' : r < 0.55 ? 'office' : r < 0.78 ? 'cinema' : 'garage', 2);
          continue;
        }
        if (district === 'downtown' && plan.core && hash3(bx + j, 99 + i, bz) < 0.12) { take(i, j, 'ruin'); continue; } // MAP-6: the centre took the worst of it
        take(i, j, district === 'residential' && hash3(bx + j, 85 + i, bz) < 0.5 ? 'rows' : 'shop');
      }
    }
    // The courtyard rows: one lived-in spot (campfire + tent, or laundry + snowman), the rest an alley.
    let court = false;
    for (let i = 1; i < back; i++) for (let j = 0; j < plan.cols; j++) {
      if (!free(i, j) || used.has(`${i},${j}`)) continue;
      // MAP-6: washing lines hang behind houses (residential); downtown courtyards hold a camp.
      if (!court && hash3(bx + j, 87, bz + i) < 0.5) { take(i, j, district === 'residential' ? 'laundry' : 'camp'); court = true; } else take(i, j, 'alley');
    }
  } else if (!open) {
    // Industrial / other decoration blocks: a 3×2 window at the street side, yards with a shed now and then.
    const cols = plan.covered.map((c) => +c.split(',')[1]);
    const first = cols.length ? Math.max(0, Math.max(...cols) - 2) : 0;
    const last = cols.length ? Math.min(Math.min(...cols), plan.cols - 3) : plan.cols - 3;
    const w0 = first + Math.floor(h(1) * (last - first + 1));
    const win = [];
    for (let i = 0; i < 2; i++) for (let j = w0; j < w0 + 3; j++) if (free(i, j)) win.push([i, j]);
    win.sort((a, c) => a[0] - c[0] || hash3(bx + a[1], 75, bz) - hash3(bx + c[1], 75, bz));
    const n = Math.min(b.kind === 'place' || district === 'outskirts' ? 2 : 3, 6 - plan.covered.length, win.length);
    for (let k = 0; k < n; k++) {
      const [i, j] = win[k];
      if (used.has(`${i},${j}`)) continue;
      // MAP-6: an industrial yard now and then has a water tower or a power substation.
      if (district === 'industrial' && b.kind !== 'place' && k === 0 && h(5) < 0.35) { take(i, j, h(6) < 0.5 ? 'watertower' : 'substation'); continue; }
      if (district === 'industrial' && free(i, j + 1) && !used.has(`${i},${j + 1}`) && win.some(([a, c]) => a === i && c === j + 1) && hash3(bx + j, 91, bz + i) < 0.4) { take(i, j, 'shed', 2); continue; }
      take(i, j, pickBy(recipe, hash3(bx * 3 + j, 61 + i, bz * 3 + i)));
    }
  }
  // Open chunks: one bench or one tree in some of them.
  for (let i = 0; i < plan.rows; i++) for (let j = 0; j < plan.cols; j++) {
    const k = `${i},${j}`;
    if (used.has(k) || plan.covered.includes(k) || onRail(i, j)) continue;
    const r = hash3(bx * 11 + j, 79 + i, bz * 11 + i);
    // MAP-7: the outskirts are land: woods in clumps, small fields, a frozen pond, drifts.
    if (district === 'outskirts') {
      if (r < 0.3) out.push([i, j, 'clump', 1]);
      else if (r < 0.48) out.push([i, j, 'field', 1]);
      else if (r < 0.56 && !out.some((o) => o[2] === 'pond')) out.push([i, j, 'pond', 1]);
      else if (r < 0.8) out.push([i, j, 'drift', 1]);
      continue;
    }
    // MAP-6: benches only in parks and squares; the outskirts are wooded.
    const square = (b.kind === 'park' || b.kind === 'plaza') && district !== 'outskirts';
    if (square && r < 0.14) out.push([i, j, 'bench', 1]);
    else if (r < (b.kind === 'park' || district === 'outskirts' ? 0.6 : 0.3)) out.push([i, j, 'tree', 1]);
    else if (district === 'outskirts' && r < 0.8) out.push([i, j, 'drift', 1]); // MAP-6: deep drifts out of town
  }
  return out;
}

// ---------------------------------------------------------------- decorations

/** make: () => VoxelModel, only called when the geometry is neither cached nor baked. */
function instanced(make, scale, transforms, { castShadow = true, cacheKey = null, jitter = 0.05, ao = true } = {}) {
  const { lit, glow } = cacheKey ? geometriesFor(cacheKey, { size: scale, jitter, ao }, make) : make().buildGeometries({ size: scale, jitter, ao });
  const group = new THREE.Group();
  for (const [geo, mat] of [[lit, MATERIALS.lit], [glow, MATERIALS.glow]]) {
    if (!geo) continue;
    const im = new THREE.InstancedMesh(geo, mat, transforms.length);
    transforms.forEach((t, i) => im.setMatrixAt(i, t));
    if (transforms.tints && mat === MATERIALS.lit) transforms.forEach((_, i) => im.setColorAt(i, transforms.tints[i] ?? WHITE)); // MAP-7: district colours
    im.userData.base = transforms; // MAP-2 C: pop-in animates from these
    im.userData.kind = cacheKey ?? 'prop'; // MAP audit: what this is
    im.castShadow = castShadow && mat === MATERIALS.lit;
    im.receiveShadow = true;
    group.add(im);
  }
  return group;
}

/** Pick from [[value, weight], …] with r in 0..1. */
function pickBy(list, r) {
  let t = r * list.reduce((n, [, w]) => n + w, 0);
  return (list.find(([, w]) => (t -= w) < 0) ?? list[0])[0];
}

/** A soft glowing ring texture for hover/selection halos. */
const POOL_GEO = new THREE.PlaneGeometry(1, 1);
const WHITE = new THREE.Color(1, 1, 1);
// MAP-7: walls take a district tone (instance colour), each building a little different from its neighbours.
const DISTRICT_TINT = { downtown: [0.94, 0.96, 1.0], residential: [1.04, 0.99, 0.93], industrial: [1.04, 0.94, 0.87], outskirts: [1.02, 0.99, 0.95] };
export function tintOf(district, x, z) {
  const t = DISTRICT_TINT[district]; if (!t) return null;
  const j = (k) => 1 + (hash3(Math.round(x * 3), k, Math.round(z * 3)) - 0.5) * 0.12;
  return new THREE.Color(t[0] * j(1), t[1] * j(2), t[2] * j(3));
}
/** MAP-7: smooth snow drifts (a flattened, wobbly half dome): no voxel stair lines. */
const DRIFT_GEOS = [0, 1].map((v) => {
  const g = new THREE.SphereGeometry(1, 18, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = g.attributes.position; const col = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
    const n = 1 + (hash3(Math.round(Math.atan2(z, x) * 3), v, 7) - 0.5) * 0.3 * (1 - y);
    p.setXYZ(i, x * n, y, z * n);
    const c = new THREE.Color(P.snow).lerp(new THREE.Color(0xc9d6e6), (1 - y) * 0.35); col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.scale(2.4, 0.32 + v * 0.16, 1.4); g.computeVertexNormals(); // low and wide: a drift, not a dome
  return g;
});
const WIRE_MAT = new THREE.LineBasicMaterial({ color: 0x1c1f24 });
const AMBER_MAT = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false }); // blinking amber signals
/** A soft warm spot of lamp light on the ground. */
function poolTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function haloTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 34, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// ---------------------------------------------------------------- public API

export function createBoard({ progressive = false } = {}) {
  const root = new THREE.Group();
  root.name = 'board';
  const layout = computeLayout(START_MAP);
  // HD models are authored at 2× resolution, so each voxel is half the size.
  const bScale = BOARD.buildingScale / 2;
  const B = BOARD.block;
  const jitter = 0; // city models carry their texture in their colours

  let map = null;     // the map currently drawn
  let streets = [];   // world street segments
  const cells = {};   // block key -> { group, terrain, k, target, delay }
  const batches = []; // instanced props per growth: { group, k, target, delay }
  const pickTargets = [];
  const rings = {};
  const locationGroups = {};
  const glowMats = [];
  const halo = haloTexture();
  const tmp = new THREE.Object3D();
  // MAP-2 D: three levels of detail for city models, picked by zoom (0 fine 2×, 1 as authored, 2 half).
  const lodNodes = [];
  let lodLevel = 0;
  const LOD_SIZE = [BOARD.buildingScale / 4, BOARD.buildingScale / 2, BOARD.buildingScale];
  // Mesh options per level: the whole-city view (level 2) skips baked ambient occlusion.
  const lodOpts = (L) => ({ size: LOD_SIZE[L], jitter: 0, ao: L < 2 });
  // A node's tag: 0 / 1 / 2 = that level only; 'near' = levels 0–1; 'far' = level 2.
  const lodShows = (tag, level) => (tag === 'near' ? level < 2 : tag === 'far' ? level === 2 : tag === level);
  // LOAD-1: a level is only built (voxels + mesh) the first time it is shown, so the start builds one level, not three.
  // LOAD-1 progressive start: while a city is first built (snap), only ground and the colony are made at once; other
  // models wait in a queue and are made a few per frame (nearest the colony first, ≤ 6 ms a frame).
  let deferring = false;
  const queue = [];
  let queueDirty = false;
  const realize = (n) => {
    const make = n.userData.make;
    if (!make || !n.visible) return;
    if (deferring && !n.userData.eager) { if (!n.userData.queued) { n.userData.queued = true; queue.push(n); queueDirty = true; } return; }
    n.userData.make = null;
    const content = make();
    n.add(content);
    trackGlow(content);
  };
  const tagLod = (node, tag) => { node.userData.lod = tag; node.visible = lodShows(tag, lodLevel); lodNodes.push(node); realize(node); return node; };
  /** A placeholder for one level of detail; `make` builds its content on first show. */
  const lazyLod = (tag, make, eager = false) => { const g = new THREE.Group(); g.userData.make = make; g.userData.eager = eager; return tagLod(g, tag); };
  const _w = new THREE.Vector3(); const _c = new THREE.Color();
  function drainQueue(budgetMs = 6) {
    if (queueDirty) { queue.sort((a, b) => a.getWorldPosition(_w).lengthSq() - b.getWorldPosition(_w).lengthSq()); queueDirty = false; }
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < budgetMs) {
      const n = queue.shift(); n.userData.queued = false;
      const t1 = performance.now(); realize(n); const dt = performance.now() - t1;
      if (dt > stats.slowMs) { stats.slowMs = dt; let k = '?'; n.traverse((o) => { if (k === '?' && o.userData.kind) k = o.userData.kind; }); stats.slowKind = k; }
    }
    stats.maxSliceMs = Math.max(stats.maxSliceMs, performance.now() - t0);
  }
  const stats = { maxSliceMs: 0, slowMs: 0, slowKind: '' };
  const lodModel = (key, make, eager = false, fine = true) => {
    const g = new THREE.Group();
    for (let L = 0; L < 3; L++) { const M = !fine && L === 0 ? 1 : L; g.add(lazyLod(L, () => groupOf(geometriesFor(`lod${M}-${key}`, lodOpts(M), () => city.lod(M, key, make))), eager)); }
    return g;
  };
  /** Model extents (x, z) over all levels, from voxel bounds (no meshing needed). */
  const lodExtent = (key, make) => {
    let x = 0; let z = 0;
    for (let L = 0; L < 3; L++) {
      const { min, max } = packedBounds(`lod${L}-${key}`, lodOpts(L)) ?? city.lod(L, key, make).bounds();
      x = Math.max(x, (max[0] - min[0]) * LOD_SIZE[L]); z = Math.max(z, (max[2] - min[2]) * LOD_SIZE[L]);
    }
    return { x, z };
  };
  const PROPS = new Map();
  const propPair = (key, make) => { if (!PROPS.has(key)) { const m = make(); PROPS.set(key, [m, downsample(m)]); } return PROPS.get(key); };
  /** A prop with a near version and a half-resolution far version. */
  const lodProp = (key, make, scale, list) => {
    const g = new THREE.Group();
    g.add(
      lazyLod('near', () => instanced(() => propPair(key, make)[0], scale, list, { cacheKey: key, jitter: 0 })),
      lazyLod('far', () => instanced(() => propPair(key, make)[1], scale * 2, list, { cacheKey: `${key}-far`, jitter: 0, castShadow: false, ao: false })),
    );
    return g;
  };
  // fine = false: the close-up level reuses the authored model (MAP-5 filler buildings: big, many, seen from afar).
  const lodInstanced = (key, make, list, fine = true) => {
    const g = new THREE.Group();
    for (let L = 0; L < 3; L++) { const M = !fine && L === 0 ? 1 : L; g.add(lazyLod(L, () => instanced(() => city.lod(M, key, make), LOD_SIZE[M], list, { cacheKey: `lod${M}-${key}`, jitter: 0, castShadow: M < 2, ao: M < 2 }))); }
    return g;
  };
  const cellOf = (x, z) => `${gridOf(x)},${gridOf(z)}`;
  /** MAP-6: clear of the frozen river (its corridor half-width + margin). */
  const offRiver = (x, z, margin = 0) => { const rv = riverLine(map); return Math.abs((rv.axis === 'x' ? z : x) - rv.c) > RAIL_CLEAR + margin; };
  const has = (bx, bz) => !!map?.blocks[`${bx},${bz}`];

  /** Distance from a point to the slab rim: Chebyshev distance to the nearest missing neighbour block. */
  const edgeDist = (bx, bz) => {
    const gaps = [];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if ((dx || dz) && !has(bx + dx, bz + dz)) gaps.push([bx + dx, bz + dz]);
    return (x, z) => {
      let d = Infinity;
      for (const [gx, gz] of gaps) {
        const ex = Math.max(0, Math.abs(x - blockPos(gx)) - blockHalf(gx)); const ez = Math.max(0, Math.abs(z - blockPos(gz)) - blockHalf(gz));
        d = Math.min(d, Math.max(ex, ez));
      }
      return d;
    };
  };
  // MAP-5: the heightmap only shows the streets now (blocks are slabs on top), so 1 world per cell is enough.
  const terrainFor = (key, far = false) => {
    const cell = far ? 2 : 1;
    const [bx, bz] = parse(key);
    const cx = blockPos(bx); const cz = blockPos(bz); const hx = blockHalf(bx); const hz = blockHalf(bz);
    const near = streets.filter(([a, b]) => Math.min(a.x, b.x) < cx + hx + 4 && Math.max(a.x, b.x) > cx - hx - 4 && Math.min(a.z, b.z) < cz + hz + 4 && Math.max(a.z, b.z) > cz - hz - 4);
    // MAP-1c: built-up blocks are flat and paved; parks and the rail yard keep their snowdrifts.
    const blocksNear = [];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const b = map.blocks[`${bx + dx},${bz + dz}`]; if (b) blocksNear.push([blockPos(bx + dx), blockPos(bz + dz), b.kind, ...edgesOf(bx + dx, bz + dz), !(openBlock(b, bx + dx, bz + dz) && b.kind !== 'plaza' && hash3(bx + dx, 77, bz + dz) < 0.5)]); }
    // Snowy empty lots (some open blocks) are not paved.
    const paved = (x, z) => blocksNear.some(([px, pz, k, ex, ez, pv]) => pv && k !== 'colony' && k !== 'park' && k !== 'rail' && Math.abs(x - px) < ex + 0.4 && Math.abs(z - pz) < ez + 0.4);
    const geo = buildTerrainHD({
      center: [cx, cz], half: Math.max(hx, hz), edgeDist: edgeDist(bx, bz), paved, cell,
      clip: (x, z) => cellOf(x, z) === key,
      distRoad: (x, z) => { let d = Infinity; for (const [a, b] of near) d = Math.min(d, distToSegment(x, z, a, b)); return d; },
      distPlot: (x, z) => {
        let d = Infinity;
        for (const [px, pz, k, ex, ez] of blocksNear) {
          if (k === 'colony') d = Math.min(d, Math.hypot(x - px, z - pz) - (BOARD.colonyRadius + 2));
          else if (k !== 'park' && k !== 'rail') d = Math.min(d, Math.max(Math.abs(x - px) - ex, Math.abs(z - pz) - ez));
        }
        return d;
      },
    });
    // MAP-3 D: the raised block slab (kerb, paving or snow) merged into the same mesh (no extra draw call).
    const k = map.blocks[key];
    const lot = openBlock(k, bx, bz) && k.kind !== 'plaza' && hash3(bx, 77, bz) < 0.5;
    const snowy = k.kind === 'park' || k.kind === 'colony' || lot;
    // MAP-4: an edge with no street but a neighbouring block runs on to the block boundary (the blocks join flush).
    const roadSet = new Set(map.roads);
    const open = {
      x0: !roadSet.has(`${bx},${bz},v`) && has(bx - 1, bz), x1: !roadSet.has(`${bx + 1},${bz},v`) && has(bx + 1, bz),
      z0: !roadSet.has(`${bx},${bz},h`) && has(bx, bz - 1), z1: !roadSet.has(`${bx},${bz + 1},h`) && has(bx, bz + 1),
    };
    const e = (o) => (o ? 0 : ROAD.half);
    const slab = blockSlab({ x0: cx - hx + e(open.x0), x1: cx + hx - e(open.x1), z0: cz - hz + e(open.z0), z1: cz + hz - e(open.z1), walk: ROAD.walk - ROAD.kerb, surface: snowy ? 'snow' : 'paved', detail: !far, seed: [bx, bz], open });
    const sg = new THREE.BufferGeometry();
    for (const a of ['position', 'normal', 'color']) sg.setAttribute(a, new THREE.BufferAttribute(slab[a], 3));
    sg.setIndex(new THREE.BufferAttribute(slab.index, 1));
    if (geo.index.array instanceof Uint16Array) geo.setIndex(new THREE.BufferAttribute(Uint32Array.from(geo.index.array), 1));
    const merged = mergeGeometries([geo, sg]);
    geo.dispose(); sg.dispose();
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, MATERIALS.lit);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    return mesh;
  };
  const trackGlow = (g) => g.traverse((o) => {
    if (o.isMesh && o.material === MATERIALS.glow) {
      o.material = MATERIALS.glow.clone();
      glowMats.push({ mat: o.material, base: MATERIALS.glow.color.r, phase: Math.random() * 10 });
    }
  });

  function addPick(L) {
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(L.hitRadius, L.hitRadius, 10, 16), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(L.center.x, 5, L.center.z);
    hit.userData.locationId = L.id;
    root.add(hit);
    pickTargets.push(hit);
    // Soft additive halo (instead of a hard flat ring) for hover / selection.
    const ring = new THREE.Mesh(
      new THREE.PlaneGeometry((L.hitRadius + 2.2) * 2, (L.hitRadius + 2.2) * 2),
      new THREE.MeshBasicMaterial({ map: halo, color: 0xffc46b, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(L.center.x, GROUND + 0.06, L.center.z);
    root.add(ring);
    rings[L.id] = ring;
  }

  // ---------------------------------------------------------------- MAP-3 colony: wall by level + building slots
  let baseLevels = {};
  const colony = { group: null, base: null, slots: {} };
  const slotPops = [];
  const dropLod = (g) => g.traverse((o) => { const i = lodNodes.indexOf(o); if (i >= 0) lodNodes.splice(i, 1); });
  const colonyBase = () => { const w = baseLevels.wall ?? 0; return lodModel(`colony-w${w}`, () => colonyHD(BOARD.colonyRadius * 2, w), true); };
  function slotModel(id) {
    const [kind, lv] = slotView(id, baseLevels);
    const holder = new THREE.Group(); holder.name = `slot ${id}`;
    holder.add(lodModel(`slot-${kind}-${lv}`, () => city.colonySlot(kind, lv), true));
    const [x, z] = COLONY_SLOTS[id];
    holder.position.set(x, 0, z); // (inside the colony group, which stands on the slab)
    holder.rotation.y = Math.round(Math.atan2(-x, -z) / (Math.PI / 2)) * (Math.PI / 2); // front towards the fire
    holder.userData.view = `${kind}-${lv}`;
    trackGlow(holder);
    return holder;
  }
  function colonyModel() {
    const g = new THREE.Group();
    colony.group = g; colony.base = colonyBase(); g.add(colony.base);
    colony.slots = {};
    for (const id of Object.keys(COLONY_SLOTS)) g.add(colony.slots[id] = slotModel(id));
    return g;
  }
  /** Show the base upgrades: the wall's level and what stands in every slot; changes pop in unless snap. */
  function setBase(levels = {}, { snap = false } = {}) {
    const prev = baseLevels;
    baseLevels = { ...levels };
    if (!colony.group) return;
    const swap = (old, next) => {
      colony.group.remove(old); dropLod(old); colony.group.add(next); trackGlow(next);
      if (!snap) { const c = { group: next, model: next }; startPop(c, 0); slotPops.push(c); }
    };
    if ((prev.wall ?? 0) !== (baseLevels.wall ?? 0)) { const old = colony.base; colony.base = colonyBase(); swap(old, colony.base); }
    for (const id of Object.keys(COLONY_SLOTS)) {
      const [kind, lv] = slotView(id, baseLevels);
      if (colony.slots[id]?.userData.view === `${kind}-${lv}`) continue;
      const old = colony.slots[id]; colony.slots[id] = slotModel(id); swap(old, colony.slots[id]);
    }
  }

  /** One block: terrain, its building / colony / filler. */
  function buildBlock(key, b) {
    const [bx, bz] = parse(key);
    const g = new THREE.Group(); g.name = `cell ${key}`;
    const terrain = new THREE.Group(); terrain.name = 'terrain-lod';
    terrain.add(lazyLod('near', () => terrainFor(key), true), lazyLod('far', () => terrainFor(key, true), true));
    g.add(terrain);
    let model = null;
    if (b.kind === 'colony') {
      model = colonyModel();
      model.position.y = GROUND;
      model.name = 'colony';
      locationGroups.colony = model;
    } else if (b.kind === 'place') {
      const L = layout[b.placeId];
      const type = b.type ?? b.placeId;
      const make = LOCATION_BUILDERS_HD[type] ?? LOCATION_BUILDERS_HD.grocery;
      model = lodModel(`place-${type}`, make, false, !COARSE_PLACES.has(type));
      // Fit the building into its chunks (models are centred on x/z, front = +z).
      const size = lodExtent(`place-${type}`, make);
      model.scale.setScalar(Math.min(PLACE_SCALE, (L.plan.fw * CHUNK - 0.2) / size.x, (L.plan.fd * CHUNK - 0.2) / size.z));
      model.position.copy(L.center);
      model.rotation.y = L.facing;
      model.name = b.placeId;
      locationGroups[b.placeId] = model;
      addPick(L);
    } else if (FILLER_MODELS[b.kind]) {
      model = lodModel(`filler-${b.kind}`, FILLER_MODELS[b.kind]);
      model.position.set(blockPos(bx), GROUND, blockPos(bz));
      model.rotation.y = Math.floor(hash3(bx, 7, bz) * 2) * Math.PI;
    }
    if (model) { g.add(model); trackGlow(model); }
    root.add(g);
    return { group: g, terrain, model, k: 1, target: 1, delay: 0 };
  }

  /** Instanced trees, rocks, cars and lamps for a set of new blocks and streets: one group per growth. */
  function buildProps(keys, newStreets, attach = true) {
    const group = new THREE.Group(); group.name = 'props';
    const trees = [[], [], []]; const rocks = [[], [], []]; const cars = [[], [], [], []]; const yards = [[], [], []];
    const lampsAt = lampSpots(streets.filter(([, , seg]) => seg !== 'gate'));
    const railRow = railLine(map);
    const free = (x, z, b) => {
      for (const [a, c] of streets) if (distToSegment(x, z, a, c) < ROAD.walk) return false;
      if (b.kind === 'colony') return Math.hypot(x, z) > BOARD.colonyRadius + 3;
      const gx = gridOf(x); const gz = gridOf(z); const [ex, ez] = edgesOf(gx, gz);
      return Math.abs(x - blockPos(gx)) > ex - 0.5 || Math.abs(z - blockPos(gz)) > ez - 0.5;
    };
    const houses = Array.from({ length: city.SMALL_VARIANTS }, () => []); const cottages = Array.from({ length: city.COTTAGE_VARIANTS }, () => []);
    const put = (list, p, rotY, scale = 1, tint = null) => { tmp.position.copy(p); tmp.rotation.set(0, rotY, 0); tmp.scale.setScalar(scale); tmp.updateMatrix(); list.push(tmp.matrix.clone()); if (tint) (list.tints ??= [])[list.length - 1] = tint; };
    const pushT = (list, mx, tint) => { list.push(mx); if (tint) (list.tints ??= [])[list.length - 1] = tint; };
    const birches = [[], []]; const stumps = []; const drifts = [[], []]; const ruins = [[], []]; const pieces = { parking: [], fountain: [] }; const fences = { picket: [], chain: [] };
    const big = {}; const courts = [];
    const matrixAt = (p, rotY, scale) => { tmp.position.copy(p); tmp.rotation.set(0, rotY, 0); tmp.scale.setScalar(scale); tmp.updateMatrix(); return tmp.matrix.clone(); }; const clutter = Array.from({ length: CLUTTER_KINDS }, () => []);
    const roadSet = new Set(map.roads);
    for (const key of keys) {
      const b = map.blocks[key];
      const [bx, bz] = parse(key);
      if (RECIPES[b.kind] || b.kind === 'place') {
        // MAP-1b/c: a block is 3×3 chunks. A place (or a decoration block's centrepiece) takes some on the street
        // side; the rest hold small buildings, shops, trees, cars, container stacks, ruins or clutter.
        const district = districtOf(bx, bz, map.look);
        const cp = centerpieceOf(b.kind, district);
        const plan = b.kind === 'place' ? layout[b.placeId].plan : placePlan(`${b.kind}@`, b.kind, bx, bz, roadSet, cp ? [cp[1], cp[2]] : [0, 0], b.front, cutLines(map));
        plan.core = coreOf(bx, bz, map.look);
        const recipe = recipeOf(b.kind, district);
        const face0 = Math.atan2(plan.fwd.x, plan.fwd.z);
        if (cp && plan.fw === cp[1] && plan.fd === cp[2]) { // (in the rail row a 2×2 centrepiece no longer fits: left out)
          const at = plan.center.clone();
          if (cp[0] === 'ruinBig') put(ruins[1], at, face0, 0.8); else put(pieces[cp[0]], at, face0, 0.8); // centrepieces fit their chunks at 0.8
        }
        // MAP-3 calmer blocks: everything built (place / centrepiece + pieces) fits in a 3×2 window at the street side;
        // the other chunks stay open (paving or snow, now and then one bench or one tree).
        for (const [i, j, what, span = 1] of blockPieces(b, bx, bz, plan, recipe, district)) {
          const p = span === 2 ? chunkCenter(plan, i, j).add(chunkCenter(plan, i, j + 1)).multiplyScalar(0.5) : chunkCenter(plan, i, j);
          const r2 = hash3(bx * 5 + i, 67, bz * 5 + j);
          // Front-row buildings face the street, back-row ones the back street; others any way.
          const backRow = i === plan.rows - 1 && plan.rows > 2;
          const face = i === 0 ? face0 : backRow ? face0 + Math.PI : span === 2 ? face0 : Math.floor(r2 * 4) * (Math.PI / 2); // wide ones lie along the street
          const BIG = { tower: [city.landmarkTower, 1], office: [city.officeBlock, 2], cinema: [() => city.cinema(), 1], garage: [() => city.parkingGarage(), 1], shed: [city.shedBuilding, 2] };
          if (EXTRA_MODELS[what]) { (big[what] ??= { make: EXTRA_MODELS[what], list: [] }).list.push(matrixAt(p, i === 0 ? face0 : face, city.SMALL_SCALE)); continue; }
          if (BIG[what]) {
            const [mk, nv] = BIG[what]; const v = Math.floor(r2 * nv);
            pushT((big[`${what}-${v}`] ??= { make: () => mk(v), list: [] }).list, matrixAt(p, face, city.SMALL_SCALE), tintOf(district, p.x, p.z));
            continue;
          }
          const corner = i === 0 && (j === 0 || j === plan.cols - 1); // MAP-7: corner buildings stand taller
          if (what === 'rows' || (what === 'shop' && district === 'downtown' && ((plan.core && hash3(bx + j, 93 + i, bz) < 0.3) || corner))) {
            const isRows = what === 'rows'; const v = isRows ? Math.floor(r2 * 2) : [0, 1, 3][Math.floor(r2 * 3)]; // (MAP-6: 3 tall variants keep the pack small)
            pushT((big[`${isRows ? 'rows' : 'tall'}-${v}`] ??= { make: () => (isRows ? city.rowHouses(v) : city.tallBuilding(v)), list: [] }).list, matrixAt(p, face, city.SMALL_SCALE), tintOf(district, p.x, p.z));
            if (isRows && district === 'residential' && (i === 0 || backRow)) put(fences.picket, p.clone().addScaledVector(plan.fwd, (backRow ? -1 : 1) * (CHUNK / 2 - 0.25)), face0);
            continue;
          }
          if (what === 'alley') { if (r2 < 0.5) put(clutter[Math.floor(r2 * 8) % (CLUTTER_KINDS - 1)], p, face); continue; }
          if (what === 'camp' || what === 'laundry') { courts.push({ p, face, what }); continue; }
          if (what === 'house' && district === 'outskirts') { // MAP-6: a cottage facing the road, its garden behind
            const dead = hash3(bx + j, 101, bz + i) < 0.25; // MAP-7: one in four abandoned
            const v = dead ? 4 + Math.floor(r2 * 2) : Math.floor(r2 * 4);
            put(cottages[v], p, i === 0 ? face0 : face, city.SMALL_SCALE, tintOf(district, p.x, p.z));
            if (!dead) houseSpots.push({ roof: p.clone().setY(GROUND + 3.4), cottage: true });
            continue;
          }
          if (what === 'house' || what === 'shop') {
            const pool = DISTRICT_SMALL[district] ?? [0, 1, 2, 3, 4, 5, 6, 7];
            const shopPool = pool.filter((v) => v % 2 === 0); const housePool = pool.filter((v) => v % 2 === 1);
            const list = what === 'shop' && shopPool.length ? shopPool : what !== 'shop' && housePool.length ? housePool : pool;
            const v = list[Math.floor(r2 * list.length)];
            // Downtown front rows: sized to their chunk's width, side by side (no gaps); others the usual size.
            const wide = (district === 'downtown' || district === 'residential') && i === 0 ? Math.min(1.1, (CHUNK - 0.25) / ((16 + (v % 3) * 2 + 7) * 0.3)) : city.SMALL_SCALE; // + fire escape, AC, snow bank
            put(houses[v % city.SMALL_VARIANTS], p, face, wide, tintOf(district, p.x, p.z));
            const floors = 2 + (v % 3); const dep = (14 + (v % 2) * 3) * 0.3 * wide;
            const toward = plan.fwd.clone(); if (i !== 0) toward.set(Math.sin(face), 0, Math.cos(face));
            houseSpots.push({ roof: p.clone().addScaledVector(toward, dep / 2 - 0.2).setY(GROUND + floors * 10 * 0.3 * wide + 0.2) });
            // Residential front yards get a picket fence along the sidewalk.
            if (district === 'residential' && i === 0) put(fences.picket, p.clone().addScaledVector(plan.fwd, CHUNK / 2 - 0.25), face0);
          } else if (what === 'clump' || (what === 'trees' && district === 'outskirts')) {
            // MAP-7 woods: a dense centre of big pines, a thinner rim of young ones, a birch or two, stumps, now and then a fallen trunk.
            for (let k = 0; k < 3; k++) put(trees[Math.floor(hash3(k, i + bx, j) * 3)], p.clone().add(new THREE.Vector3((hash3(k, bx, j) - 0.5) * 1.6, 0, (hash3(k, bz, i) - 0.5) * 1.6)), k * 2.1, 0.95 + hash3(j, k, i) * 0.45);
            for (let k = 0; k < 4; k++) {
              const a = k * 1.57 + hash3(k, bx + i, bz) * 1.2; const q = p.clone().add(new THREE.Vector3(Math.cos(a) * 2.1, 0, Math.sin(a) * 2.1));
              const h = hash3(k, j, bz + 3);
              if (h < 0.35) put(birches[k % 2], q, a, 0.8 + h); else if (h < 0.55) put(stumps, q, a, 1); else put(trees[(k + j) % 3], q, a, 0.45 + h * 0.3);
            }
            if (!plan.railCut && hash3(bx + j, 103, bz + i) < 0.3) { // a fallen trunk, centred on the clump (it lies along -cos/sin of face0)
              tmp.position.copy(p).add(new THREE.Vector3(0, 0.3, 0)).add(new THREE.Vector3(Math.cos(face0) * 1.8, 0, -Math.sin(face0) * 1.8)); tmp.rotation.set(0, face0, Math.PI / 2 - 0.05); tmp.scale.setScalar(0.8); tmp.updateMatrix(); trees[1].push(tmp.matrix.clone());
            }
          } else if (what === 'field' || what === 'pond') {
            const v = what === 'pond' ? 0 : Math.floor(r2 * 3);
            pushT((big[`b7-${what}-${v}`] ??= { make: () => (what === 'pond' ? city.pondPiece() : city.fieldPiece(v)), list: [] }).list, matrixAt(p, face0 + Math.floor(r2 * 4) * (Math.PI / 2), city.SMALL_SCALE), null);
          } else if (what === 'trees') {
            for (let k = 0; k < 3; k++) {
              const q = p.clone().add(new THREE.Vector3((hash3(k, bx, j) - 0.5) * 3, 0, (hash3(k, bz, i) - 0.5) * 3));
              put(trees[Math.floor(hash3(k, i, j) * 3)], q, k, 0.7 + hash3(j, k, i) * 0.5);
            }
          } else if (what === 'tree') put(trees[Math.floor(r2 * 3)], p.clone().add(new THREE.Vector3((r2 - 0.5) * 3, 0, (hash3(i, j, 5) - 0.5) * 3)), r2 * 6, 0.8 + r2 * 0.4);
          else if (what === 'drift') put(drifts[Math.floor(r2 * 2)], p.clone().add(new THREE.Vector3((r2 - 0.5) * 1.5, 0, (hash3(i, j, 9) - 0.5) * 1.5)), r2 * 6, 0.8 + r2 * 0.25);
          else if (what === 'bench') put(clutter[CLUTTER_KINDS - 1], p.clone().addScaledVector(plan.fwd, CHUNK * 0.35), face0 + Math.PI);
          else if (what === 'car') {
            const across = new THREE.Vector3(Math.sin(face + Math.PI / 2), 0, Math.cos(face + Math.PI / 2)); // side by side
            put(cars[Math.floor(r2 * 4)], p.clone().addScaledVector(across, -1.6), face + Math.PI / 2);
            put(cars[Math.floor(hash3(i, j, bx) * 4)], p.clone().addScaledVector(across, 1.6), face + Math.PI / 2);
          } else if (what === 'yard') {
            if (district === 'industrial' && i === 0) put(fences.chain, p.clone().addScaledVector(plan.fwd, CHUNK / 2 - 0.2), face0); // a fenced lot
            // Two stacks side by side (offset across their length, whichever way they face).
            const across = new THREE.Vector3(Math.sin(face), 0, Math.cos(face));
            put(yards[Math.floor(r2 * 3)], p.clone().addScaledVector(across, -1.7), face);
            put(yards[Math.floor(hash3(j, i, bz) * 3)], p.clone().addScaledVector(across, 1.8), face);
          } else if (what === 'ruin') put(ruins[Math.floor(r2 * 2)], p, face, PLACE_SCALE);
          else if (what === 'rocks') { for (let k = 0; k < 2; k++) put(rocks[k], p.clone().add(new THREE.Vector3((k - 0.5) * 3, 0, (r2 - 0.5) * 3)), r2 * 6, 0.9); }
          else for (let k = 0; k < 2; k++) put(clutter[Math.floor(hash3(k, i + bx, j + bz) * (CLUTTER_KINDS - 1))], p.clone().add(new THREE.Vector3((k ? 1.9 : -1.9) + (hash3(k, 3, j) - 0.5) * 0.6, 0, (hash3(k, 5, i) - 0.5) * 3)), hash3(k, i, j) * 6);
        }
        continue;
      }
      const spots = [];
      for (let i = 0; i < 40 && spots.length < 7; i++) {
        const x = blockPos(bx) + (hash3(i, bx * 7 + 3, bz * 13 + 11) * 2 - 1) * (blockHalf(bx) - 2);
        const z = blockPos(bz) + (hash3(i, bx * 7 + 5, bz * 13 + 17) * 2 - 1) * (blockHalf(bz) - 2);
        if (edgeDist(bx, bz)(x, z) < 4 || !free(x, z, b) || spots.some((p) => Math.hypot(p[0] - x, p[1] - z) < 3)) continue;
        spots.push([x, z]);
      }
      spots.forEach(([x, z], i) => {
        const r = hash3(Math.round(x * 10), 5, Math.round(z * 10));
        tmp.position.set(x, GROUND, z); tmp.rotation.set(0, Math.floor(r * 4) * (Math.PI / 2), 0); tmp.scale.setScalar(0.75 + r * 0.6); tmp.updateMatrix();
        if (i % 3 === 2) rocks[Math.floor(r * 3)].push(tmp.matrix.clone());
        else if (i === 0 && b.kind === 'place' && r < 0.3) yards[Math.floor(r * 9) % 3].push(tmp.matrix.clone());
        else trees[Math.floor(r * 3)].push(tmp.matrix.clone());
      });
    }
    newStreets.forEach(([a, b, seg], i) => {
      const dir = b.clone().sub(a); const len = dir.length(); dir.normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      const at = (t, lat) => a.clone().addScaledVector(dir, len * t).addScaledVector(side, lat);
      // Seeded by the street itself (not its place in the list), so a city built in one go = one grown step by step.
      const sk = seg === 'gate' ? [Math.round(b.x), 9, Math.round(b.z)] : seg.split(',').map((v) => (v === 'h' ? 1 : v === 'v' ? 2 : +v));
      const h = (k) => hash3(sk[0] * 31 + sk[2] * 7 + k, sk[1] * 13 + 3, k * 17 + sk[2]);
      const nearRail = (p) => Math.abs((railRow.axis === 'x' ? p.z : p.x) - railRow.c) < RAIL_CLEAR + 3;
      if (false && len > 6 && h(2) < 0.6 && !nearRail(at(0.5, 0))) { // MAP audit: random street cars clashed with the route / place vehicles
        tmp.position.copy(at(0.3 + h(3) * 0.4, (h(4) < 0.5 ? -1 : 1) * ROAD.half / 2));
        tmp.rotation.set(0, Math.atan2(dir.x, dir.z) - Math.PI / 2 + (h(5) - 0.5) * 0.6, 0); tmp.scale.setScalar(1); tmp.updateMatrix();
        cars[Math.floor(h(6) * 4)].push(tmp.matrix.clone());
      }
    });
    trees.forEach((list, k) => { if (list.length) group.add(lodProp(`tree-${k}`, () => treeModelHD(k, 1), 0.25, list)); });
    houses.forEach((list, v) => { if (list.length) group.add(lodInstanced(`small-${v}`, () => city.smallBuilding(v), list, false)); });
    cottages.forEach((list, v) => { if (list.length) group.add(lodInstanced(`cottage-${v}`, () => city.cottage(v), list, false)); });
    ruins.forEach((list, v) => { if (list.length) group.add(lodInstanced(`ruin-${v}`, () => city.ruinSmall(v), list)); });
    if (pieces.parking.length) group.add(lodInstanced('parking-small', city.parkingSmall, pieces.parking));
    if (pieces.fountain.length) group.add(lodInstanced('fountain', city.fountain, pieces.fountain));
    clutter.forEach((list, k) => { if (list.length) group.add(lazyLod('near', () => instanced(() => clutterModel(k), 0.12, list, { cacheKey: `clutter-${k}`, jitter: 0, castShadow: false }))); });
    drifts.forEach((list, k) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(DRIFT_GEOS[k], MATERIALS.lit, list.length);
      list.forEach((mx, i) => im.setMatrixAt(i, mx)); im.receiveShadow = true; im.userData.kind = `drift-${k}`; im.userData.base = list;
      group.add(im);
    });
    const detail = (o) => { detailNodes.push(o); return o; };
    birches.forEach((list, k) => { if (list.length) group.add(detail(lodProp(`birch-${k}`, () => birchModel(k), 0.25, list))); });
    if (stumps.length) group.add(detail(lazyLod('near', () => instanced(stumpModel, 0.25, stumps, { cacheKey: 'stump', jitter: 0, castShadow: false }))));
    rocks.forEach((list, k) => { if (list.length) group.add(lazyLod('near', () => instanced(() => rockModelHD(k), 0.25, list, { cacheKey: `rock-${k}`, jitter: 0 }))); });
    cars.forEach((list, v) => { if (list.length) group.add(lazyLod('near', () => instanced(() => carModel(v), 0.15, list, { cacheKey: `car4-${v}`, jitter: 0, castShadow: false }))); });
    yards.forEach((list, k) => { if (list.length) group.add(lodProp(`container-${k}`, () => containerModel(k, 1 + (k % 2)), 0.2, list)); });
    for (const [k, { make, list }] of Object.entries(big)) { const g = lodInstanced(`b5-${k}`, make, list, false); if (k.startsWith('b7-')) detail(g); group.add(g); }
    courtyards.push(...courts);
    for (const [k, list] of Object.entries(fences)) if (list.length) group.add(lazyLod('near', () => instanced(() => fenceModel(k), 0.1, list, { cacheKey: `fence-${k}`, jitter: 0, castShadow: false })));
    if (attach) root.add(group);
    return { group, k: 0, target: 1, delay: 0 };
  }

  // ---------------------------------------------------------------- MAP-3 streets: markings, lamps, light pools
  // Rebuilt for the whole city on every map change (a new street can turn a corner into a junction).
  const MARK_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const POOL_MAT = new THREE.MeshBasicMaterial({ map: poolTexture(), color: 0xffb36b, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
  const decor = new THREE.Group(); decor.name = 'street-decor';
  const debugItems = []; // MAP audit: merged furniture pieces { kind, box }
  const houseSpots = []; // MAP-4: roof edges of small buildings (service drops from the power lines)
  const courtyards = []; // MAP-5: courtyard spots { p, face, what }
  const crowPerches = []; const BASE_CHIMNEYS = 3; // the colony's two houses + the dorm
  const detailNodes = []; // MAP-7: hidden in Battery saver
  root.add(decor);
  let flickers = []; let pools = null;
  function buildStreetDecor() {
    for (const o of decor.children) { const i = lodNodes.indexOf(o); if (i >= 0) lodNodes.splice(i, 1); }
    decor.traverse((o) => { if (o.isMesh && o.geometry !== POOL_GEO) o.geometry.dispose?.(); });
    decor.clear();
    const segs = streets.filter(([, , seg]) => seg !== 'gate');
    const ground = (x, z) => { const bx = gridOf(x); const bz = gridOf(z); return has(bx, bz) && edgeDist(bx, bz)(x, z) >= 3; };
    const rail = railOf(map);
    // MAP-6 road hierarchy: a street with only outskirts blocks beside it is a country road: no markings or dropped
    // kerbs, snowed over, with the tyre ruts of the last cars that left.
    const country = ([, , seg]) => {
      const [cx, cz, d] = seg.split(','); const x = +cx; const z = +cz;
      const beside = (d === 'h' ? [[x, z - 1], [x, z]] : [[x - 1, z], [x, z]]).filter(([bx, bz]) => has(bx, bz));
      return beside.length > 0 && beside.every(([bx, bz]) => districtOf(bx, bz, map.look) === 'outskirts');
    };
    const townSegs = segs.filter((sg) => !country(sg));
    const snowRoads = segs.filter(country);
    if (snowRoads.length) {
      const pos = []; const col = []; const idx = [];
      const quad = (a, b, lat0, lat1, y, c) => {
        const d = b.clone().sub(a).normalize(); const sd = new THREE.Vector3(-d.z, 0, d.x); const n = pos.length / 3;
        for (const [p, l] of [[a, lat0], [b, lat0], [b, lat1], [a, lat1]]) { const v = p.clone().addScaledVector(sd, l); pos.push(v.x, y, v.z); col.push(...c); }
        idx.push(n, n + 2, n + 1, n, n + 3, n + 2);
      };
      // MAP-7 fix: snow over asphalt, not a pale strip. Two tyre tracks show the dark road through; the edges are
      // ragged; where a country road meets a town street the snow stops short of the junction and breaks into
      // patches; it never covers a level crossing (the rails stay visible); a junction of country roads is snowed too.
      const C3 = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
      const snow = C3(P.snow); const packed = C3(0xd6dde5); const rut = C3(0x3b4049); const rut2 = C3(0x565c66);
      const nk2 = (v) => `${Math.round(v.x * 10)},${Math.round(v.z * 10)}`;
      const ends = new Map(); // node → does a town street meet it?
      for (const sg of segs) { const isC = country(sg); for (const v of [sg[0], sg[1]]) { const k = nk2(v); const e = ends.get(k) ?? { town: false, country: 0, v }; if (!isC) e.town = true; else e.country++; ends.set(k, e); } }
      const h2 = (a, b, k) => hash3(Math.round(a * 4), Math.round(b * 4), k);
      const railAt = (v) => Math.abs((rail.axis === 'x' ? v.z : v.x) - rail.c);
      for (const [a0, b0] of snowRoads) {
        const d = b0.clone().sub(a0); const len = d.length(); d.normalize();
        const alongRail = Math.abs(d.x) > 0.5 ? rail.axis === 'x' : rail.axis === 'z';
        const trim = (v) => (ends.get(nk2(v))?.town ? ROAD.walk + 0.6 : 0);
        let t0 = trim(a0); let t1 = len - trim(b0);
        // Pieces along the street, leaving out the level crossing.
        const pieces = [];
        const cross = alongRail ? null : (rail.axis === 'x' ? (rail.c - a0.z) / (d.z || 1e-9) : (rail.c - a0.x) / (d.x || 1e-9));
        if (cross !== null && cross > -1 && cross < len + 1) {
          if (cross - RAIL_CLEAR - 1.6 > t0) pieces.push([t0, cross - RAIL_CLEAR - 1.6]);
          if (cross + RAIL_CLEAR + 1.6 < t1) pieces.push([cross + RAIL_CLEAR + 1.6, t1]);
        } else pieces.push([t0, t1]);
        for (const [u0, u1] of pieces) {
          if (u1 - u0 < 0.5) continue;
          const A = a0.clone().addScaledVector(d, u0); const B = a0.clone().addScaledVector(d, u1);
          quad(A, B, -ROAD.half + 0.25, ROAD.half - 0.25, 0.025, snow);
          quad(A, B, -1.5, 1.5, 0.028, packed); // the packed track
          for (const l of [-1.05, 0.65]) { quad(A, B, l, l + 0.42, 0.032, rut); quad(A, B, l + 0.1, l + 0.3, 0.034, rut2); } // dark asphalt in the ruts
          // Ragged edges: drifted lumps reaching to the kerb, bare slivers in between.
          for (let t = u0; t < u1 - 0.6; t += 0.9) for (const sg of [-1, 1]) {
            const h = h2(a0.x + d.x * t, a0.z + d.z * t, sg + 3); if (h < 0.45) continue;
            const P0 = a0.clone().addScaledVector(d, t); const P1 = a0.clone().addScaledVector(d, Math.min(u1, t + 0.5 + h * 0.6));
            quad(P0, P1, sg > 0 ? ROAD.half - 0.3 : -ROAD.half, sg > 0 ? ROAD.half : -ROAD.half + 0.3, 0.026, snow);
          }
          // Where it was cut short (a town junction or the crossing): the snow runs on along both kerbs, tapering off
          // toward the ploughed asphalt, with a few thin tongues of packed snow in the middle.
          for (const [u, dir] of [[u0, -1], [u1, 1]]) {
            if ((dir < 0 ? u0 : len - u1) < 0.5) continue;
            for (let k = 0; k < 5; k++) {
              const ta = u + dir * k * 0.55; const tb = u + dir * (k + 1) * 0.55; const w = 1.3 * (1 - k / 5) + h2(a0.x + k, a0.z + u, 17) * 0.25;
              const [A, B] = dir > 0 ? [ta, tb] : [tb, ta];
              for (const sg of [-1, 1]) quad(a0.clone().addScaledVector(d, A), a0.clone().addScaledVector(d, B), sg > 0 ? ROAD.half - 0.25 - w : -ROAD.half + 0.25, sg > 0 ? ROAD.half - 0.25 : -ROAD.half + 0.25 + w, 0.026, snow);
            }
            for (const l of [-0.6, 0.55]) { const L = 0.6 + h2(a0.z + l, a0.x + u, 19) * 1.2; const [A, B] = dir > 0 ? [u, u + L] : [u - L, u]; quad(a0.clone().addScaledVector(d, A), a0.clone().addScaledVector(d, B), l - 0.18, l + 0.18, 0.027, packed); }
          }
        }
      }
      // Junctions where only country roads meet: snow over the crossing square too.
      for (const e of ends.values()) {
        if (e.town || e.country < 2 || railAt(e.v) < RAIL_CLEAR + 2) continue;
        const v = e.v; const x = new THREE.Vector3(1, 0, 0);
        quad(v.clone().addScaledVector(x, -ROAD.half + 0.25), v.clone().addScaledVector(x, ROAD.half - 0.25), -ROAD.half + 0.25, ROAD.half - 0.25, 0.025, snow);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, MARK_MAT); m.receiveShadow = true; m.name = 'country-roads'; decor.add(m);
    }
    const q = markingQuads(townSegs, ground, 0.03);
    if (q.index.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(q.position, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(q.normal, 3));
      g.setAttribute('color', new THREE.BufferAttribute(q.color, 3));
      g.setIndex(new THREE.BufferAttribute(q.index, 1));
      const m = new THREE.Mesh(g, MARK_MAT); m.receiveShadow = true; m.name = 'markings';
      decor.add(m);
    }
    // Dropped kerbs at the zebras (one mesh).
    const slabTest = (x, z) => { const bx = gridOf(x); const bz = gridOf(z); return has(bx, bz) && Math.abs(x - blockPos(bx)) <= blockHalf(bx) - ROAD.half + 0.7 && Math.abs(z - blockPos(bz)) <= blockHalf(bz) - ROAD.half + 0.7; };
    const rq = rampQuads(townSegs, slabTest, GROUND);
    if (rq.index.length) {
      const g = new THREE.BufferGeometry();
      for (const a of ['position', 'normal', 'color']) g.setAttribute(a, new THREE.BufferAttribute(rq[a], 3));
      g.setIndex(new THREE.BufferAttribute(rq.index, 1));
      const m = new THREE.Mesh(g, MATERIALS.lit); m.receiveShadow = true; m.name = 'kerb-ramps'; decor.add(m);
    }
    const posts = railCrossings(rail);
    const slabAt = (x, z) => { const bx = gridOf(x); const bz = gridOf(z); return has(bx, bz) && Math.abs(x - blockPos(bx)) <= blockHalf(bx) - ROAD.half - 0.2 && Math.abs(z - blockPos(bz)) <= blockHalf(bz) - ROAD.half - 0.2; };
    const spots = lampSpots(segs, (x, z) => ground(x, z) && slabAt(x, z)).filter((l) => !posts.some((p) => Math.hypot(p.x - l.x, p.z - l.z) < 2.5) && Math.abs((rail.axis === 'x' ? l.z : l.x) - rail.c) > RAIL_CLEAR + 0.6 && offRiver(l.x, l.z, 0.6));
    const lit = []; const dead = []; const poolList = [];
    flickers = [];
    // MAP-6: a dying town: most lamps are dark. Light is left near the colony, at places (generators) and on the
    // avenue downtown; elsewhere only a stray lamp still burns.
    const doorsAt = Object.values(layout).filter((L) => L.plan).map((L) => L.plan.c.clone().addScaledVector(L.plan.fwd, L.plan.edge + 1).addScaledVector(L.plan.side, L.plan.lat));
    const aveL = avenueLine(map);
    for (const l of spots) {
      const h = hash3(Math.round(l.x * 3), 77, Math.round(l.z * 3));
      const onAve = Math.abs((aveL.axis === 'x' ? l.z : l.x) - aveL.c) < ROAD.walk + 1;
      const keep = Math.hypot(l.x, l.z) < 30 ? h < 0.75 : doorsAt.some((d) => Math.hypot(d.x - l.x, d.z - l.z) < 10) ? h < 0.55
        : onAve && districtOf(gridOf(l.x), gridOf(l.z), map.look) === 'downtown' ? h < 0.5 : h < 0.05;
      l.dead = !keep; l.flicker = keep && h > 0.7;
    }
    for (const l of spots) {
      tmp.position.set(l.x + l.dx * 0.45, GROUND, l.z + l.dz * 0.45); tmp.rotation.set(0, Math.atan2(-l.dz, l.dx), 0); tmp.scale.setScalar(1); tmp.updateMatrix();
      (l.dead ? dead : lit).push(tmp.matrix.clone());
      if (l.dead) continue;
      if (l.flicker) flickers.push(poolList.length);
      tmp.position.set(l.x + l.dx * 0.85, GROUND + 0.05, l.z + l.dz * 0.85); tmp.rotation.set(-Math.PI / 2, 0, 0); tmp.scale.setScalar(5); tmp.updateMatrix();
      poolList.push(tmp.matrix.clone());
    }
    if (lit.length) decor.add(tagLod(instanced(() => lampModel(false), 0.1, lit, { cacheKey: 'lamp3', jitter: 0, castShadow: false }), 'near'));
    if (dead.length) decor.add(tagLod(instanced(() => lampModel(true), 0.1, dead, { cacheKey: 'lamp3-dead', jitter: 0, castShadow: false }), 'near'));
    pools = null;
    if (poolList.length) {
      pools = new THREE.InstancedMesh(POOL_GEO, POOL_MAT, poolList.length);
      poolList.forEach((mx, i) => { pools.setMatrixAt(i, mx); pools.setColorAt(i, new THREE.Color(1, 1, 1)); });
      pools.renderOrder = 1; pools.name = 'lamp-pools';
      decor.add(pools);
    }
    buildRailway(rail);
    buildFurniture(rail, segs, ground, spots);
    for (let i = detailNodes.length - 1; i >= 0; i--) if (!detailNodes[i].parent) detailNodes.splice(i, 1);
    const fd = decor.getObjectByName('furniture-detail'); if (fd) detailNodes.push(fd);
    buildRim();
    trackGlow(decor);
  }

  // ---------------------------------------------------------------- MAP-3 E2: street furniture, power lines, the evacuation route
  // Everything here is merged into one lit mesh + one glow mesh for the whole city (2 draw calls).
  function buildFurniture(rail, segs, ground0, lamps) {
    debugItems.length = 0;
    const lit = []; const glow = []; const amber = []; const litD = []; // litD: MAP-7 details (hidden in Battery saver)
    // On a block slab (not over a back lane between blocks), off the track, and clear of doors and gates.
    const onSlab = (x, z) => { const bx = gridOf(x); const bz = gridOf(z); return has(bx, bz) && Math.abs(x - blockPos(bx)) <= blockHalf(bx) - ROAD.half - 0.2 && Math.abs(z - blockPos(bz)) <= blockHalf(bz) - ROAD.half - 0.2; };
    const doors = Object.values(layout).flatMap((L) => (L.plan ? [L.plan.c.clone().addScaledVector(L.plan.fwd, L.plan.edge + 1).addScaledVector(L.plan.side, L.plan.lat)] : L.gates ?? []));
    const ground = (x, z) => ground0(x, z) && onSlab(x, z) && Math.abs((rail.axis === 'x' ? z : x) - rail.c) > RAIL_CLEAR + 2.2 && offRiver(x, z, 2.2) && !doors.some((d) => Math.hypot(d.x - x, d.z - z) < 3.5);
    const onRoadOk = (x, z) => ground0(x, z) && Math.abs((rail.axis === 'x' ? z : x) - rail.c) > RAIL_CLEAR + 0.6 && offRiver(x, z, 1.5);
    const _q = new THREE.Quaternion(); const _e = new THREE.Euler();
    const add = (key, make, size, x, y, z, yaw, tilt = 0, tiltAxis = 'x', detail = false) => {
      const g = geometriesFor(key, { size, jitter: 0 }, make);
      _e.set(tiltAxis === 'x' ? tilt : 0, yaw, tiltAxis === 'z' ? tilt : 0, 'YXZ');
      const mx = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e), new THREE.Vector3(1, 1, 1));
      if (g.lit) (detail ? litD : lit).push(g.lit.clone().applyMatrix4(mx));
      if (g.glow) (key === 'tlight-amber' ? amber : glow).push(g.glow.clone().applyMatrix4(mx)); // amber lights blink on their own
      // MAP audit: remember what went into the merged mesh and where (world box).
      const box = (g.lit ?? g.glow).boundingBox.clone().applyMatrix4(mx);
      if (g.glow && g.lit) box.union(g.glow.boundingBox.clone().applyMatrix4(mx));
      debugItems.push({ kind: key.replace(/-\d+$/, ''), box });
    };
    const yawTo = (dx, dz) => Math.atan2(dx, dz); // local +z faces (dx, dz)
    const taken = (x, z, r) => debugItems.some((d) => x > d.box.min.x - r && x < d.box.max.x + r && z > d.box.min.z - r && z < d.box.max.z + r);
    buildRiver(add);
    const { nodes, runs } = streetRuns(segs);
    const onRail = (n) => (rail.axis === 'x' ? Math.abs(n.z - rail.c) < 0.01 : Math.abs(n.x - rail.c) < 0.01);
    const junctions = nodes.filter((n) => n.kind === 'junction');
    // Junctions: traffic lights on two corners (one dead now and then, one blinking amber), a street sign.
    const ave = avenueLine(map);
    const onAve = (n) => (ave.axis === 'x' ? Math.abs(n.z - ave.c) < 0.01 : Math.abs(n.x - ave.c) < 0.01);
    junctions.forEach((n, i) => {
      if (onRail(n)) return; // level crossings have their own posts
      if (!onAve(n)) {
        // MAP-4: side-street junctions get stop signs (one each on two corners) instead of traffic lights.
        for (const [sx, sz] of [[1, 1], [-1, -1]]) {
          const x = n.x + sx * (ROAD.kerb + 0.35); const z = n.z + sz * (ROAD.walk + 0.6);
          if (ground(x, z) && n.dirs.has(sz > 0 ? '+z' : '-z')) add('stop', stopSignModel, 0.1, x, GROUND, z, sz > 0 ? 0 : Math.PI);
        }
        return;
      }
      { const x = n.x - (ROAD.kerb + 0.35); const z = n.z + (ROAD.walk + 0.6); if (ground(x, z)) add('dirsign', directionSignModel, 0.1, x, GROUND, z, Math.PI / 4); }
      for (const [sx, sz] of [[1, 1], [-1, -1]]) {
        const x = n.x + sx * (ROAD.kerb + 0.35); const z = n.z + sz * (ROAD.walk + 0.6);
        if (!ground(x, z) || !n.dirs.has(sz > 0 ? '+z' : '-z')) continue; // its arm reaches over a street, not a back lane
        const h = hash3(i, sx + 5, rail.look);
        const state = h < 0.65 ? 'dead' : h < 0.85 ? 'amber' : 'red'; // MAP-6: most signals are dead
        // The arm reaches over the street this corner stands beside (towards −sx).
        add(`tlight-${state}`, () => trafficLightModel(state), 0.1, x - sx * 0.8, GROUND, z, Math.atan2(sx, 0) + Math.PI / 2);
      }
      const x = n.x + (ROAD.kerb + 0.35); const z = n.z - (ROAD.walk + 0.6);
      if (ground(x, z)) add('sign', streetSignModel, 0.1, x, GROUND, z, 0);
    });
    // Sidewalks: furniture between the lamps (never on a lamp spot or near a junction).
    const near = (x, z, list, r) => list.some((p) => Math.hypot(p.x - x, p.z - z) < r);
    runs.forEach((r, ri) => {
      let busStop = false;
      for (let k = Math.ceil((r.t0 - 2.25) / 9); k * 9 + 2.25 <= r.t1; k++) {
        const t = k * 9 + 2.25;
        const lat = ROAD.walk - 0.6;
        const [x, z] = r.axis === 'x' ? [t, r.c + lat] : [r.c + lat, t];
        if (!ground(x, z) || near(x, z, nodes, 11) || near(x, z, lamps, 1.6)) continue;
        const h = hash3(Math.round(t), ri, rail.look + 13);
        const zoneHere = districtOf(gridOf(x), gridOf(z), map.look);
        let kind = zoneHere === 'outskirts' ? (h < 0.2 ? 'postbox' : null) // MAP-6: the outskirts have no city furniture
          : h < 0.3 ? 'hydrant' : h < 0.5 ? 'bin' : h < 0.6 ? 'postbox' : h < 0.7 ? 'newsbox' : h < 0.74 ? 'phone' : h < 0.86 ? 'busstop' : null;
        const aveRun = r.axis === ave.axis && Math.abs(r.c - ave.c) < 0.01;
        if (kind === 'busstop') { if (busStop || !aveRun) kind = 'bin'; else busStop = true; } // the bus route runs on the avenue
        const [dx, dz] = r.axis === 'x' ? [0, -1] : [-1, 0];
        if (kind) add(`furn-${kind}`, () => furnitureModel(kind), 0.1, x, GROUND, z, yawTo(dx, dz));
        // Street clutter (cones, crates, barrels, bags, barriers) halfway between furniture spots, same side.
        const tc = t + 4.5; const [cx, cz] = r.axis === 'x' ? [tc, r.c + lat] : [r.c + lat, tc];
        const hc = hash3(Math.round(tc), ri, rail.look + 19);
        if (hc < 0.3 && zoneHere !== 'outskirts' && tc < r.t1 && ground(cx, cz) && !near(cx, cz, nodes, 11) && !near(cx, cz, lamps, 1.6)) { const ck = Math.floor(hash3(Math.round(tc), 5, rail.look) * (CLUTTER_KINDS - 1)); add(`clutter-${ck}`, () => clutterModel(ck), 0.12, cx, GROUND, cz, hc * 20); }
      }
    });
    // Power lines (MAP-4): poles every 12 on one sidewalk, cross arm ACROSS the street; each of the 3 wires runs from
    // insulator to insulator, the ends taken from the pole's full transform (a leaning pole carries its wires).
    // Runs end with a guy wire to the ground; wires from a fallen pole's neighbours hang to the ground beside it.
    const wires = []; const livePoles = [];
    const INS = [-0.9, 0, 0.9].map((xo) => new THREE.Vector3(xo, 6.55, -0.05)); // insulators in pole space (0.1 voxels)
    const sag = (a, b) => { for (let s2 = 0; s2 < 10; s2++) { const u = s2 / 10; const v = (s2 + 1) / 10; const span = a.distanceTo(b); const pa = a.clone().lerp(b, u); pa.y -= Math.sin(u * Math.PI) * span * 0.05; const pb = a.clone().lerp(b, v); pb.y -= Math.sin(v * Math.PI) * span * 0.05; wires.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z); } };
    const straight = (a, b) => wires.push(a.x, a.y, a.z, b.x, b.y, b.z);
    const long = runs.filter((r) => !(r.axis === rail.axis && Math.abs(r.c - rail.c) < 0.01)).sort((a, b) => (b.t1 - b.t0) - (a.t1 - a.t0) || a.c - b.c).slice(0, 2);
    long.forEach((r, ri) => {
      const lat = -(ROAD.kerb + 1.0); // the arm (±1) stays over the sidewalk, clear of the building line
      const dirT = r.axis === 'x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      const chain = []; // consecutive poles: { ends: [3 world points], base, down }
      const flush = () => {
        // Wire the chain: spans between standing poles; guy wires at both ends; drop wires next to a fallen pole.
        for (let i = 0; i < chain.length; i++) {
          const p = chain[i]; const q = chain[i + 1];
          if (q && !p.down && !q.down) for (let k = 0; k < 3; k++) sag(p.ends[k], q.ends[k]);
          if (q && (p.down !== q.down)) { const st = p.down ? q : p; const fl = p.down ? p : q; for (let k = 0; k < 3; k++) { const g = fl.base.clone().lerp(st.base, 0.25 + k * 0.08); g.y = GROUND + 0.02; sag(st.ends[k], g); } }
        }
        const live = chain.filter((c) => !c.down);
        for (const [c, sgn] of [[live[0], -1], [live[live.length - 1], 1]]) {
          if (!c || live.length < 2) continue;
          const anchor = c.base.clone().addScaledVector(dirT, sgn * 2.6); anchor.y = GROUND;
          straight(c.ends[1].clone().setY(c.ends[1].y - 0.4), anchor);
        }
        chain.length = 0;
      };
      for (let k = Math.ceil((r.t0 - 6) / 12); k * 12 + 6 <= r.t1; k++) {
        const t = k * 12 + 6;
        const [x, z] = r.axis === 'x' ? [t, r.c + lat] : [r.c + lat, t];
        if (!ground(x, z) || near(x, z, nodes, 7) || near(x, z, lamps, 2.4)) { flush(); continue; }
        const h = hash3(Math.round(t), ri, rail.look + 17);
        const down = h < 0.08 && !near(x, z, lamps, 8.5) && Math.abs((r.axis === 'x' ? z : x) - rail.c) > 10 && !(r.axis !== rail.axis && Math.abs(t - rail.c) < 10);
        const lean = down ? 0 : h < 0.3 ? (h - 0.19) * 0.5 : 0;
        const yaw = r.axis === 'x' ? Math.PI / 2 : 0;            // the arm (local x) across the street
        const tilt = down ? Math.PI / 2 - 0.08 : lean;            // leaning / falling along the street
        add('pole', powerPoleModel, 0.1, x, GROUND, z, yaw, tilt, 'x'); // tilts along the street (about the arm)
        _e.set(tilt, yaw, 0, 'YXZ');
        const mx = new THREE.Matrix4().compose(new THREE.Vector3(x, GROUND, z), _q.setFromEuler(_e), new THREE.Vector3(1, 1, 1));
        chain.push({ base: new THREE.Vector3(x, GROUND, z), down, ends: INS.map((v) => v.clone().applyMatrix4(mx)) });
        if (!down) livePoles.push(chain[chain.length - 1]);
      }
      flush();
    });
    // Service drops: one thin wire from the nearest standing pole to each small building's roof edge within 12.
    for (const h of houseSpots) {
      let best = null; let bd = 12;
      for (const p of livePoles) { const d = Math.hypot(p.base.x - h.roof.x, p.base.z - h.roof.z); if (d < bd) { bd = d; best = p; } }
      if (best) sag(best.ends[1], h.roof);
    }
    // The evacuation route: the street on the other axis beside the colony, cars abandoned nose to tail in the
    // outbound lane, a bus, a jack-knifed truck, and an army checkpoint near the colony.
    const eAxis = rail.axis;
    const eLine = rail.r > 0 ? 0 : 1; // the colony-row edge away from the railway
    const eC = blockPos(eLine) - blockHalf(eLine);
    const eRuns = runs.filter((r) => r.axis === eAxis && Math.abs(r.c - eC) < 0.01);
    let truck = false; let bus = false;
    eRuns.forEach((r) => {
      const dir = r.axis === 'x' ? [1, 0] : [0, 1];
      const at = (t, lat) => (r.axis === 'x' ? [t, r.c + lat] : [r.c + lat, t]);
      const yaw0 = r.axis === 'x' ? 0 : -Math.PI / 2;
      for (let t = r.t0 + ROAD.walk + 2.5; t < r.t1 - ROAD.walk - 2.5;) {
        const [x, z] = at(t, -ROAD.half / 2);
        if (!onRoadOk(x, z) || Math.abs(t) < 12 || doors.some((d) => Math.hypot(d.x - x, d.z - z) < 13)) { t += 4.4; continue; } // keep gate roads and place fronts clear
        const h = hash3(Math.round(t * 3), 23, rail.look);
        const armNear = (d0, d1) => lamps.some((l) => { const [lx, lz] = r.axis === 'x' ? [l.x, l.z] : [l.z, l.x]; return lx > t + d0 && lx < t + d1 && Math.abs(lz - r.c) < ROAD.half + 1.5; });
        if (!bus && h < 0.12 && t + 9 < r.t1 - ROAD.walk - 2.5 && !armNear(-3, 9)) { add(`veh-bus-${rail.look % 2}`, () => vehicleModel('bus', rail.look), 0.15, x + dir[0] * 2.5, 0.05, z + dir[1] * 2.5, yaw0); bus = true; t += 12; continue; }
        if (!truck && h > 0.88 && t + 13 < r.t1 - ROAD.walk && !armNear(-3, 13)) {
          const [cx, cz] = at(t + 11, -0.4);
          add('veh-cab', () => vehicleModel('cab'), 0.15, cx, 0.05, cz, yaw0 + 0.3);
          add('veh-trailer', () => vehicleModel('trailer'), 0.15, x + dir[0] * 4.5, 0.05, z + dir[1] * 4.5, yaw0 - 0.12);
          truck = true; t += 17; continue;
        }
        if (h < 0.82) { const v = Math.floor(hash3(Math.round(t), 29, rail.look) * 4); add(`car4-${v}`, () => carModel(v), 0.15, x, 0, z, yaw0 + (h - 0.4) * 0.3) /* along the lane */; }
        t += 4.4;
      }
    });
    if (eRuns.length) {
      // The checkpoint stands across the inbound lane, on the stretch beside the colony.
      const r = eRuns.find((q) => q.t0 < 0 && q.t1 > 0) ?? eRuns[0];
      const t = Math.min(r.t1 - ROAD.walk - 3, Math.max(r.t0 + ROAD.walk + 3, 14));
      const [x, z] = r.axis === 'x' ? [t, r.c + ROAD.half / 2] : [r.c + ROAD.half / 2, t];
      if (onRoadOk(x, z)) add('checkpoint', checkpointModel, 0.1, x, 0.03, z, r.axis === 'x' ? 0 : Math.PI / 2);
    }
    // MAP-4 wayfinding: "SAFE ZONE →" boards along the evacuation route, arrows pointing to the colony; a second
    // checkpoint where the route leaves the city.
    eRuns.forEach((r) => {
      for (let k = Math.ceil((r.t0 - 4.5) / 18); k * 18 + 4.5 <= r.t1; k++) {
        const t = k * 18 + 4.5; if (Math.abs(t) < 14) continue;
        const [x, z] = r.axis === 'x' ? [t, r.c + (ROAD.walk - 0.6)] : [r.c + (ROAD.walk - 0.6), t];
        if (!ground(x, z) || near(x, z, nodes, 9) || near(x, z, lamps, 1.6) || taken(x, z, 0.8)) continue;
        const toward = t > 0 ? -1 : 1; // the arrow (local +x) points along the street to the colony
        add('safe', safeZoneModel, 0.1, x, GROUND, z, r.axis === 'x' ? (toward > 0 ? 0 : Math.PI) : (toward > 0 ? -Math.PI / 2 : Math.PI / 2));
      }
    });
    if (eRuns.length) {
      const far = eRuns.reduce((a, r) => (Math.abs(r.t1) > Math.abs(a.t) ? { r, t: r.t1 - ROAD.walk - 4 } : Math.abs(r.t0) > Math.abs(a.t) ? { r, t: r.t0 + ROAD.walk + 4 } : a), { t: 0 });
      if (far.r && Math.abs(far.t) > 30) {
        const [x, z] = far.r.axis === 'x' ? [far.t, far.r.c - ROAD.half / 2] : [far.r.c - ROAD.half / 2, far.t];
        if (onRoadOk(x, z) && !taken(x, z, 2)) add('checkpoint', checkpointModel, 0.1, x, 0.03, z, far.r.axis === 'x' ? 0 : Math.PI / 2);
      }
    }
    // The station: a platform with a shelter beside the track where the avenue crosses the railway.
    const cross = (rail.pieces ?? []).find((p) => p[2] === 'road' && Math.abs((p[0] + p[1]) / 2 - ave.c) < 0.5);
    if (cross) {
      const t = ave.c + ROAD.walk + 5.5; const lat = 2.35;
      const [x, z] = rail.axis === 'x' ? [t, rail.c + lat] : [rail.c + lat, t];
      add('shelter', shelterModel, 0.1, x, GROUND, z, rail.axis === 'x' ? Math.PI : -Math.PI / 2);
    }
    // MAP-5 overhead: strings of warm lights across a few side streets, from facade to facade.
    runs.forEach((r, ri) => {
      if (r.axis === ave.axis && Math.abs(r.c - ave.c) < 0.01) return;
      for (let k = Math.ceil((r.t0 - 13.5) / 27); k * 27 + 13.5 <= r.t1; k++) {
        const t = k * 27 + 13.5;
        if (hash3(Math.round(t), ri, rail.look + 51) > 0.7 || near(...(r.axis === 'x' ? [t, r.c] : [r.c, t]), nodes, 9)) continue;
        { const [sx, sz] = r.axis === 'x' ? [t, r.c] : [r.c, t]; if (Math.max(Math.abs(gridOf(sx)), Math.abs(gridOf(sz))) > 1) continue; } // MAP-6: only by the colony
        const P = (lat, y) => (r.axis === 'x' ? new THREE.Vector3(t, y, r.c + lat) : new THREE.Vector3(r.c + lat, y, t));
        const a = P(-(ROAD.walk + 0.4), GROUND + 4.6); const b = P(ROAD.walk + 0.4, GROUND + 4.6);
        if (!onSlab(a.x - (r.axis === 'x' ? 0 : 0.6), a.z - (r.axis === 'x' ? 0.6 : 0)) || !onSlab(b.x + (r.axis === 'x' ? 0 : 0.6), b.z + (r.axis === 'x' ? 0.6 : 0))) continue;
        sag(a, b);
        for (let q = 1; q < 10; q++) { const u = q / 10; const p = a.clone().lerp(b, u); p.y -= Math.sin(u * Math.PI) * a.distanceTo(b) * 0.05 + 0.08; add('bulb', bulbModel, 0.12, p.x, p.y, p.z, 0); }
      }
    });
    // Crows on roof edges and on the power line arms.
    crowPerches.length = 0;
    houseSpots.forEach((hs, i) => { if (hash3(i, 7, rail.look) < 0.18) crowPerches.push(hs.roof.clone()); });
    livePoles.forEach((p, i) => { if (hash3(i, 9, rail.look) < 0.25) crowPerches.push(p.ends[0].clone().add(new THREE.Vector3(0, 0.15, 0))); });
    crowPerches.splice(40);
    // Smoke from a few chimneys and burn barrels in the city (the colony's chimneys stay first).
    fx.chimneys.splice(BASE_CHIMNEYS);
    houseSpots.forEach((hs, i) => { if (fx.chimneys.length < BASE_CHIMNEYS + 5 && hash3(i, 11, rail.look) < 0.08) fx.chimneys.push(hs.roof.clone().add(new THREE.Vector3(0, 0.6, 0))); });
    // MAP-5 courtyards: a camp or a washing line with a snowman inside the blocks.
    for (const c of courtyards) {
      if (taken(c.p.x, c.p.z, 0.5)) continue;
      if (c.what === 'camp') add('camp', campModel, 0.1, c.p.x, GROUND, c.p.z, c.face);
      else add('laundry', laundryModel, 0.1, c.p.x, GROUND, c.p.z, c.face);
    }
    // Places belong to their street: driveways across the sidewalk, vehicles parked at the kerb, a few signs of use.
    const apron = () => { const m = new VoxelModel(); m.box(-15, 0, -12, 30, 1, 25, (x, _y, z) => (Math.abs(x) === 15 || Math.abs(z) === 12 ? 0x8d949e : 0x2b2e33)); return m; };
    const front = (L, along, out) => { const p = L.plan; return p.c.clone().addScaledVector(p.fwd, p.edge + out).addScaledVector(p.side, p.lat + along); };
    const yawAlong = (L) => Math.atan2(L.plan.side.x, L.plan.side.z) - Math.PI / 2; // vehicle length (local x) along the street
    const parked = [];
    for (const L of Object.values(layout)) {
      if (!L.plan) continue;
      const type = map.blocks[Object.keys(map.blocks).find((k) => map.blocks[k].placeId === L.id)]?.type ?? L.id;
      const half = (L.plan.fw * CHUNK) / 2;
      const yawF = Math.atan2(L.plan.fwd.x, L.plan.fwd.z);
      const kerbLane = (ROAD.walk - ROAD.half) + 1.2; // from the building line out to the parking lane
      // Parked at the kerb, shifted along the street until no lamp arm hangs over it.
      const park = (key, make, along, i = 0, room = 5.2) => {
        let p = null; // no free spot at this kerb: leave it out
        for (const d of [0, 3, -3, 6, -6, 9, -9]) { const q = front(L, along + d, kerbLane); if (offRiver(q.x, q.z, 2) && !lamps.some((l) => Math.hypot(l.x - q.x, l.z - q.z) < room) && !parked.some((o) => o.distanceTo(q) < 5.5)) { p = q; break; } }
        if (!p) return;
        parked.push(p);
        add(key, make, 0.15, p.x, 0.05, p.z, yawAlong(L) + i * 0.04);
      };
      if (type === 'gas' || type === 'grocery' || type === 'hospital') {
        for (const a of type === 'gas' ? [-half + 2, half - 2] : [half - 2.2]) { const p = front(L, a, 1.25); add('apron', apron, 0.1, p.x, GROUND - 0.06, p.z, yawF); }
      }
      if (type === 'hospital') { park('veh-ambulance', () => vehicleModel('ambulance'), half - 2.2); park('veh-ambulance', () => vehicleModel('ambulance'), -half + 3, 1); }
      if (type === 'police') {
        park('veh-police', () => vehicleModel('police'), -half + 2.5); park('veh-police', () => vehicleModel('police'), half - 2.5, 1);
        for (const a of [-3.4, 3.4]) { const p = front(L, a, 1.6); add('clutter-4', () => clutterModel(4), 0.12, p.x, GROUND, p.z, yawF + Math.PI / 2); }
      }
      if (type === 'school') park(`veh-bus-1`, () => vehicleModel('bus', 1), 0, 0, 7);
      if (type === 'library' && L.plan.fw >= 2) { const p = front(L, half - 1.5, 1.3); add('statue', statueModel, 0.1, p.x, GROUND, p.z, yawF); }
      // MAP-6: a place shows what it has outside: a woodpile, a scrap heap, crates of food (wide places only).
      if (L.plan.fw >= 2 && type !== 'library') {
        const y = yieldsOf(type, ITEMS);
        const show = [['woodpile', woodpileModel, y.wood], ['scrapheap', scrapHeapModel, y.metal], ['crates', cratesModel, y.food]].filter((e) => e[2]).slice(0, 2);
        show.forEach(([k, mk], n) => { const p = front(L, (n ? -1 : 1) * (half - 1.1), 1.1); if (!taken(p.x, p.z, 0.6) && !lamps.some((l) => Math.hypot(l.x - p.x, l.z - p.z) < 1.5)) add(k, mk, 0.1, p.x, GROUND, p.z, yawF + Math.PI / 2); });
      }
    }
    // Small stories, 1–2 per stage, away from place entrances, gates and the evacuation route.
    const entrances = Object.values(layout).flatMap((L) => (L.plan ? [front(L, 0, 1)] : L.gates ?? []));
    const clear = (x, z, road = false) => (road ? onRoadOk(x, z) : ground(x, z)) && !entrances.some((e) => Math.hypot(e.x - x, e.z - z) < 7) && !taken(x, z, 1.5) && !lamps.some((l) => Math.hypot(l.x - x, l.z - z) < 2.5);
    const ringOfT = (r, t) => { const [x, z] = r.axis === 'x' ? [t, r.c] : [r.c, t]; return Math.max(Math.abs(gridOf(x)), Math.abs(gridOf(z))); };
    for (let st = 1; st <= (map.stage ?? 1); st++) {
      for (let k = 0; k < 2; k++) {
        const h = hash3(st, k, rail.look + 31);
        if (k === 1 && h < 0.5) continue; // the second story only half the time
        const pool = runs.filter((r) => !(r.axis === eAxis && Math.abs(r.c - eC) < 0.01) && !(r.axis === rail.axis && Math.abs(r.c - rail.c) < 0.01));
        if (!pool.length) break;
        const r = pool[Math.floor(hash3(st, k, rail.look + 37) * pool.length)];
        const t = r.t0 + ROAD.walk + 4 + hash3(st, k, 41) * Math.max(0, r.t1 - r.t0 - 2 * ROAD.walk - 8);
        if (ringOfT(r, t) !== st && st > 1) continue;
        const at = (lat) => (r.axis === 'x' ? [t, r.c + lat] : [r.c + lat, t]);
        const yaw = r.axis === 'x' ? 0 : Math.PI / 2;
        const kind = Math.floor(hash3(st, k, rail.look + 43) * 4);
        if (kind === 0) { // a fallen pine across the lane, a gap cut through it
          const [x, z] = at(-0.8); if (!clear(x, z, true)) continue;
          add('tree-1', () => treeModelHD(1, 1), 0.25, x, 0.3, z, yaw, Math.PI / 2 - 0.05, 'z');
        } else if (kind === 1) { // a burnt-out car
          const [x, z] = at(1.4); if (!clear(x, z, true)) continue;
          const v = Math.floor(h * 4); add(`car-burnt-${v}`, () => burntCarModel(v), 0.15, x, 0, z, yaw + 0.4);
        } else if (kind === 2) { // a tent camp on the sidewalk by a blank wall
          for (const [i, d] of [[0, -2.5], [1, 1.5]]) { const [x, z] = r.axis === 'x' ? [t + d, r.c + (ROAD.walk - 1.2)] : [r.c + (ROAD.walk - 1.2), t + d]; if (clear(x, z)) add(`tent-${i}`, () => tentModel(i), 0.1, x, GROUND, z, yaw + i * 0.3); }
        } else { // spilt goods from a looted shop
          for (let i = 0; i < 5; i++) { const [x, z] = r.axis === 'x' ? [t + (i - 2) * 0.9, r.c + ROAD.walk - 1 - hash3(i, st, 47)] : [r.c + ROAD.walk - 1 - hash3(i, st, 47), t + (i - 2) * 0.9]; if (clear(x, z)) { const c = [1, 2, 3][i % 3]; add(`clutter-${c}`, () => clutterModel(c), 0.12, x, GROUND, z, i * 1.3); } }
        }
      }
    }
    // MAP-6 damage gradient: downtown streets were ploughed (heaps against the kerb) and barricaded (sandbag walls by
    // the junctions); the outskirts were simply left.
    const downAt = (x, z) => districtOf(gridOf(x), gridOf(z), map.look) === 'downtown';
    runs.forEach((r, ri) => {
      for (let k = Math.ceil((r.t0 - 6.5) / 13); k * 13 + 6.5 <= r.t1; k++) {
        const t = k * 13 + 6.5;
        for (const sgn of [1, -1]) {
          const lat = sgn * (ROAD.half - 0.65);
          const [x, z] = r.axis === 'x' ? [t, r.c + lat] : [r.c + lat, t];
          const [sx, sz] = r.axis === 'x' ? [t, r.c + sgn * (ROAD.walk + 2)] : [r.c + sgn * (ROAD.walk + 2), t];
          if (!downAt(sx, sz) || hash3(Math.round(t), ri * 2 + (sgn > 0 ? 1 : 0), rail.look + 61) > 0.6) continue;
          if (!onRoadOk(x, z) || Math.abs((rail.axis === 'x' ? z : x) - rail.c) < RAIL_CLEAR + 5 || near(x, z, nodes, 9) || taken(x, z, 1.4) || doors.some((d) => Math.hypot(d.x - x, d.z - z) < 5)) continue;
          const v = Math.floor(hash3(Math.round(t), 63, ri) * 2);
          add(`heap-${v}`, () => snowHeapModel(v), 0.1, x, 0, z, r.axis === 'x' ? 0 : Math.PI / 2);
        }
      }
    });
    junctions.forEach((n, i) => {
      if (onRail(n) || hash3(i, 65, rail.look) > 0.4) return;
      for (const [sx, sz] of [[1, -1], [-1, 1]]) {
        const x = n.x + sx * (ROAD.kerb + 0.6); const z = n.z + sz * (ROAD.walk + 2.6);
        if (!downAt(x, z) || !ground(x, z) || taken(x, z, 1.9)) continue;
        add('sandbags', sandbagModel, 0.1, x, GROUND, z, Math.PI / 2);
        break;
      }
    });
    // MAP-7 street life left behind: cars parked along the kerbs of town streets, snowed over.
    runs.forEach((r, ri) => {
      for (let k = Math.ceil((r.t0 - 3.75) / 7.5); k * 7.5 + 3.75 <= r.t1; k++) {
        const t = k * 7.5 + 3.75;
        for (const sgn of [1, -1]) {
          const [x, z] = r.axis === 'x' ? [t, r.c + sgn * (ROAD.half - 0.95)] : [r.c + sgn * (ROAD.half - 0.95), t];
          const [sx, sz] = r.axis === 'x' ? [t, r.c + sgn * (ROAD.walk + 2)] : [r.c + sgn * (ROAD.walk + 2), t];
          const dz = districtOf(gridOf(sx), gridOf(sz), map.look);
          if ((dz !== 'downtown' && dz !== 'residential') || hash3(Math.round(t), ri * 2 + (sgn > 0 ? 1 : 0), rail.look + 71) > 0.24) continue;
          if (!onRoadOk(x, z) || Math.abs((rail.axis === 'x' ? z : x) - rail.c) < RAIL_CLEAR + 5 || near(x, z, nodes, 10) || taken(x, z, 1.6) || doors.some((d) => Math.hypot(d.x - x, d.z - z) < 5) || lamps.some((l) => Math.hypot(l.x - x, l.z - z) < 3.5)) continue;
          const v = Math.floor(hash3(Math.round(t), 73, ri) * 4);
          add(`car4-${v}`, () => carModel(v), 0.15, x, 0, z, (r.axis === 'x' ? 0 : -Math.PI / 2) + (sgn > 0 ? 0 : Math.PI), 0, 'x', true);
        }
      }
    });
    // MAP-7 rim: where the city ends, a road stops at a striped barrier; in the outskirts a field fence runs off the edge.
    nodes.filter((n) => n.kind === 'end').forEach((n) => {
      const d = [...n.dirs][0]; const ax = d[1]; const sg = d[0] === '+' ? 1 : -1; // the street leaves the node this way
      const off = (k) => (ax === 'x' ? [n.x - sg * k, n.z] : [n.x, n.z - sg * k]);
      if (ground0(...off(1))) return; // a dead end inside the city
      for (const k of [-4.5, -6, -7.5]) { const [x, z] = off(k); if (onRoadOk(x, z) && !taken(x, z, 1.5)) { add('barrier', barrierModel, 0.1, x, 0, z, ax === 'x' ? Math.PI / 2 : 0, 0, 'x', true); break; } }
    });
    for (const k of Object.keys(map.blocks)) {
      const [bx, bz] = parse(k);
      if (districtOf(bx, bz, map.look) !== 'outskirts') continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (has(bx + dx, bz + dz) || hash3(bx * 3 + dx, 107, bz * 3 + dz) > 0.4) continue;
        const rimC = dx ? blockPos(bx) + dx * (blockHalf(bx) - 3) : blockPos(bz) + dz * (blockHalf(bz) - 3);
        const t = (dx ? blockPos(bz) : blockPos(bx)) + (hash3(bx, 109, bz) - 0.5) * 8;
        const [x, z] = dx ? [rimC - dx * 3.1, t] : [t, rimC - dz * 3.1];
        if (ground(x, z) && !taken(x, z, 3.2)) add('fence-rail', () => fenceModel('rail'), 0.1, x, GROUND, z, dx ? 0 : Math.PI / 2, 0, 'x', true);
      }
    }
    if (wires.length) {
      const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
      const wl = new THREE.LineSegments(wg, WIRE_MAT); wl.name = 'wires'; decor.add(tagLod(wl, 'near'));
    }
    const merge = (list, mat, name) => {
      if (!list.length) return;
      for (const g of list) if (g.index.array instanceof Uint16Array) g.setIndex(new THREE.BufferAttribute(Uint32Array.from(g.index.array), 1));
      const geo = mergeGeometries(list); list.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(geo, mat); mesh.name = name; mesh.receiveShadow = true; mesh.castShadow = mat === MATERIALS.lit;
      decor.add(mesh);
    };
    merge(lit, MATERIALS.lit, 'furniture'); merge(glow, MATERIALS.glow, 'furniture-glow'); merge(amber, AMBER_MAT, 'amber-lights'); merge(litD, MATERIALS.lit, 'furniture-detail');
  }

  // ---------------------------------------------------------------- MAP-7: the rim of the diorama
  // Along every edge where the city ends: a lumpy snow lip over the cut and icicles hanging from it; in the outskirts
  // roots poke out of the soil band. One merged mesh.
  function buildRim() {
    const pos = []; const col = []; const idx = [];
    const box = (x0, y0, z0, x1, y1, z1, c) => {
      const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
      for (const f of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [3, 7, 6, 2], [0, 1, 5, 4]]) {
        const n = pos.length / 3;
        for (const k of f) { pos.push(...v[k]); col.push(c.r, c.g, c.b); }
        idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
      }
    };
    const snow = new THREE.Color(P.snow); const ice = new THREE.Color(0xcfe2f0); const root0 = new THREE.Color(0x4a3426);
    for (const k of Object.keys(map.blocks)) {
      const [bx, bz] = parse(k);
      const outskirts = districtOf(bx, bz, map.look) === 'outskirts';
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (has(bx + dx, bz + dz)) continue;
        // The rim runs 3 inside the block boundary; at its ends it stops short of a convex corner, runs on into a
        // straight neighbour, and reaches 3 past a concave one.
        const lineC = dx ? blockPos(bx) + dx * (blockHalf(bx) - 3) : blockPos(bz) + dz * (blockHalf(bz) - 3);
        const cb = dx ? bz : bx; const c0 = blockPos(cb) - blockHalf(cb); const c1 = blockPos(cb) + blockHalf(cb);
        const endOff = (sg) => {
          const nb = dx ? [bx, bz + sg] : [bx + sg, bz]; const dg = dx ? [bx + dx, bz + sg] : [bx + sg, bz + dz];
          return !has(...nb) ? -3 : has(...dg) ? 3 : 0;
        };
        const t0 = c0 - endOff(-1); const t1 = c1 + endOff(1);
        const P3 = (t, o, y) => (dx ? [lineC + dx * o, y, t] : [t, y, lineC + dz * o]);
        const put = (ta, tb, oa, ob, ya, yb, c) => { const a = P3(ta, oa, ya); const b = P3(tb, ob, yb); box(Math.min(a[0], b[0]), ya, Math.min(a[2], b[2]), Math.max(a[0], b[0]), yb, Math.max(a[2], b[2]), c); };
        for (let t = t0; t < t1 - 0.05; t += 0.7) {
          const h = hash3(Math.round(t * 7), bx * 5 + dx, bz * 5 + dz); const te = Math.min(t1, t + 0.7);
          put(t, te, -0.25, 0.18 + h * 0.14, GROUND - 0.12 - h * 0.1, GROUND + 0.08 + h * 0.07, snow); // the lip
          if (h < 0.55) { const L = 0.25 + hash3(Math.round(t * 11), 5, bx + bz) * 0.9; const m0 = t + 0.2 + h * 0.3; put(m0, m0 + 0.09, 0.05, 0.14, GROUND - 0.12 - L, GROUND - 0.1, ice); put(m0 + 0.02, m0 + 0.07, 0.07, 0.12, GROUND - 0.2 - L * 1.25, GROUND - 0.12 - L, ice); }
          if (outskirts && h > 0.86) put(t, t + 0.12, 0, 0.35 + h * 0.3, -1.9 - h * 0.4, -1.8 - h * 0.4, root0); // a root
        }
      }
    }
    if (!idx.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, MATERIALS.lit); m.name = 'rim'; m.receiveShadow = true; decor.add(m); detailNodes.push(m);
  }

  // ---------------------------------------------------------------- MAP-6: the frozen river
  // Ice down the middle chunk row of its block row, snow banks on both sides, cracks; where a street crosses, the
  // road is the bridge deck and two parapets stand at its kerbs; across a back lane the ice simply goes on.
  function buildRiver(add) {
    const rv = railOf(map, riverLine(map));
    if (!rv.pieces.length) return;
    const pos = []; const col = []; const idx = [];
    const quad = (t0, t1, l0, l1, y, c) => {
      const n = pos.length / 3;
      for (const [t, l] of [[t0, l0], [t1, l0], [t1, l1], [t0, l1]]) { if (rv.axis === 'x') pos.push(t, y, rv.c + l); else pos.push(rv.c + l, y, t); col.push(c.r, c.g, c.b); }
      idx.push(...(rv.axis === 'x' ? [n, n + 2, n + 1, n, n + 3, n + 2] : [n, n + 1, n + 2, n, n + 2, n + 3]));
    };
    const ice = new THREE.Color(0x7f97a8); const deep = new THREE.Color(0x5f798c); const crack = new THREE.Color(0xd7e4ee); const bank = new THREE.Color(P.snow); // MAP-7: darker ice, white banks
    const W = 2.6;
    for (const [t0, t1, kind, y0] of rv.pieces) {
      if (kind === 'road') {
        for (const s2 of [-1, 1]) { // MAP-7: a (dark) lamp post at each bridge, its arm over the road
          const [lx, lz] = rv.axis === 'x' ? [(t0 + t1) / 2 + s2 * (ROAD.half + 0.45), rv.c + 3.0 * s2] : [rv.c + 3.0 * s2, (t0 + t1) / 2 + s2 * (ROAD.half + 0.45)];
          add('lamp-bridge', () => lampModel(true), 0.1, lx, GROUND, lz, rv.axis === 'x' ? (s2 > 0 ? Math.PI : 0) : (s2 > 0 ? Math.PI / 2 : -Math.PI / 2));
        }
        for (const s2 of [-1, 1]) add('parapet', bridgeParapetModel, 0.1, ...(rv.axis === 'x' ? [(t0 + t1) / 2 + s2 * (ROAD.half + 0.45), GROUND, rv.c] : [rv.c, GROUND, (t0 + t1) / 2 + s2 * (ROAD.half + 0.45)]), rv.axis === 'x' ? Math.PI / 2 : 0); // along the street, at its kerbs
        continue;
      }
      const y = y0 + 0.03;
      quad(t0, t1, -W, W, y, ice);
      quad(t0, t1, -0.8, 0.9, y + 0.004, deep); // the channel, darker in the middle
      for (let t = t0 + 0.6; t < t1 - 1.6; t += 1.7) { const h = hash3(Math.round(t * 3), 81, rv.look); if (h < 0.5) quad(t, t + 1 + h, -1.6 + h * 2.4, -1.5 + h * 2.4, y + 0.008, crack); }
      // MAP-7: pressure ridges across the ice; a boat frozen in, a fishing hole with a stool.
      for (let t = t0 + 2; t < t1 - 2; t += 4.3) { const h = hash3(Math.round(t * 3), 85, rv.look); if (h < 0.45) quad(t, t + 0.35, -W + 0.4, W - 0.4 - h, y + 0.07, crack); }
      if (kind === 'slab' && t1 - t0 > 12) {
        const h = hash3(Math.round(t0), 87, rv.look);
        const at = (t, l) => (rv.axis === 'x' ? [t, rv.c + l] : [rv.c + l, t]);
        if (h < 0.35) add('boat', boatModel, 0.1, ...((p) => [p[0], y0 + 0.02, p[1]])(at(t0 + 4 + h * 6, -0.6)), rv.axis === 'x' ? 0.3 : Math.PI / 2 + 0.3, 0.08, 'z');
        else if (h < 0.7) add('fishing', fishingModel, 0.1, ...((p) => [p[0], y0 + 0.04, p[1]])(at(t0 + 5 + h * 4, 0.5)), h * 6);
      }
      for (const sgn of [-1, 1]) for (let t = t0; t < t1 - 0.01; t += 1.2) { const h = hash3(Math.round(t * 5), 83 + sgn, rv.look); quad(t, Math.min(t1, t + 1.2), sgn * (W - 0.1 - h * 0.5), sgn * (W + 0.5), y + 0.05 + h * 0.06, bank); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, MARK_MAT); m.receiveShadow = true; m.name = 'river'; decor.add(m);
  }

  // ---------------------------------------------------------------- MAP-3 E: the railway
  /** The railway through the rail row: pieces [t0, t1, kind, y0] where there is ground (slab, crossing or back lane). */
  function railOf(m, rail = railLine(m)) {
    const pieces = [];
    const along = Object.keys(m.blocks).map((k) => parse(k)[rail.axis === 'x' ? 0 : 1]);
    const inRow = (b) => (rail.axis === 'x' ? has(b, rail.r) : has(rail.r, b));
    const roads = new Set(m.roads);
    for (let b = Math.min(...along); b <= Math.max(...along); b++) {
      if (!inRow(b)) continue;
      const h = blockHalf(b) - ROAD.half; // slab half length along the track
      pieces.push([blockPos(b) - h, blockPos(b) + h, 'slab', GROUND]);
      if (inRow(b + 1)) { // the street (or back lane) between this block and the next
        const line = blockPos(b) + blockHalf(b);
        const road = roads.has(rail.axis === 'x' ? `${b + 1},${rail.r},v` : `${rail.r},${b + 1},h`);
        pieces.push([line - ROAD.half, line + ROAD.half, road ? 'road' : 'lane', 0]);
      }
    }
    return { ...rail, pieces };
  }
  /** Level crossings: where a street crosses the track, two warning posts (one each side, on the right). */
  function railCrossings(rail) {
    const out = [];
    for (const [t0, t1, kind] of rail.pieces ?? []) {
      if (kind !== 'road') continue;
      const line = (t0 + t1) / 2;
      [-1, 1].forEach((s, i) => {
        const along = rail.axis === 'x' ? [line + s * (ROAD.kerb + 0.4), rail.c + s * 3.2] : [rail.c + s * 3.2, line + s * (ROAD.kerb + 0.4)];
        const d = rail.axis === 'x' ? [-s, 0] : [0, -s]; // the arm reaches over the street
        out.push({ x: along[0], z: along[1], dx: d[0], dz: d[1], up: hash3(Math.round(line), i, rail.look) < 0.25 });
      });
    }
    return out;
  }
  const placeOnRail = (rail, t, lat, yaw = 0) => (rail.axis === 'x' ? [t, rail.c + lat, yaw] : [rail.c + lat, t, yaw + Math.PI / 2]);
  function buildRailway(rail) {
    if (!rail.pieces.length) return;
    const q = railQuads(rail, rail.pieces);
    const g = new THREE.BufferGeometry();
    for (const a of ['position', 'normal', 'color']) g.setAttribute(a, new THREE.BufferAttribute(q[a], 3));
    g.setIndex(new THREE.BufferAttribute(q.index, 1));
    const mesh = new THREE.Mesh(g, MATERIALS.lit); mesh.receiveShadow = true; mesh.name = 'railway';
    decor.add(mesh);
    // Warning posts with crossbucks, red lamps (one dead) and arms, at every level crossing.
    const posts = { down: [], up: [] };
    const off = (up) => { const { min, max } = crossingModel(up).bounds(); return ((min[0] + max[0]) / 2) * 0.1; };
    for (const p of railCrossings(rail)) {
      const o = off(p.up);
      tmp.position.set(p.x + p.dx * o, GROUND, p.z + p.dz * o); tmp.rotation.set(0, Math.atan2(-p.dz, p.dx), 0); tmp.scale.setScalar(1); tmp.updateMatrix();
      posts[p.up ? 'up' : 'down'].push(tmp.matrix.clone());
    }
    for (const k of ['down', 'up']) if (posts[k].length) decor.add(tagLod(instanced(() => crossingModel(k === 'up'), 0.1, posts[k], { cacheKey: `crossing-${k}`, jitter: 0, castShadow: false }), 'near'));
    // A derailed freight train on the longest open stretch of slab: wagons on the track, the last two overturned
    // beside it on their sides; a warning sign and a buffer stop where the line ends at the city's edge.
    const slabs = rail.pieces.filter((p) => p[2] === 'slab').sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]) || a[0] - b[0]);
    const kinds = ['box', 'tank', 'hopper'];
    const wagons = { box: [], tank: [], hopper: [] }; const lying = [];
    const rvL = riverLine(map); // MAP-6: not where the river crosses the line (a rail bridge there)
    const blocksOnRow = rail.pieces.filter((p) => p[2] === 'slab' && !(rvL.axis !== rail.axis && p[0] < rvL.c + 4 && p[1] > rvL.c - 4));
    const pick = blocksOnRow[Math.floor(hash3(rail.look, 7, 3) * blocksOnRow.length)] ?? slabs[0];
    const [s0, s1] = pick;
    const n = Math.max(1, Math.min(3, Math.floor((s1 - s0 - 1) / 12.6)));
    for (let k = 0; k < n; k++) {
      const kind = kinds[Math.floor(hash3(k, rail.look, 9) * 3)];
      const t = s0 + 0.8 + 6.3 + k * 12.6;
      const over = k >= n - 1 && n > 1;
      // The last wagon lies on its side beside the track (a model built lying down), slightly skewed.
      const [x, z, yaw] = placeOnRail(rail, t, over ? 0.6 : 0);
      tmp.position.set(x, GROUND + (over ? 0 : 0.16), z);
      tmp.rotation.set(0, yaw + (over ? 0.08 : 0), 0); tmp.scale.setScalar(1); tmp.updateMatrix();
      if (over) lying.push([kind, tmp.matrix.clone()]); else wagons[kind].push(tmp.matrix.clone());
    }
    for (const k of kinds) if (wagons[k].length) decor.add(instanced(() => wagonModel(k, rail.look % 5), 0.3, wagons[k], { cacheKey: `wagon-${k}-${rail.look % 5}`, jitter: 0 }));
    for (const [k, mx] of lying) decor.add(instanced(() => wagonModel(k, rail.look % 5, true), 0.3, [mx], { cacheKey: `wagon-lying-${k}-${rail.look % 5}`, jitter: 0 }));
    // Buffer stops at both ends of the line, with a warning sign.
    const ends = [rail.pieces[0][0] + 0.6, rail.pieces[rail.pieces.length - 1][1] - 0.6];
    ends.forEach((t, i) => {
      const [x, z, yaw] = placeOnRail(rail, t, 0, i ? Math.PI : 0);
      tmp.position.set(x, GROUND, z); tmp.rotation.set(0, yaw, 0); tmp.scale.setScalar(1); tmp.updateMatrix();
      decor.add(instanced(bufferStopModel, 0.1, [tmp.matrix.clone()], { cacheKey: `buffer-${i}`, jitter: 0 }));
    });
  }


  // The slab's soft shadow on the backdrop (follows the city's outline).
  const shadow = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d'); const gr = g.createRadialGradient(32, 32, 10, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.65)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, fog: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.set(4, -16, 6); sh.renderOrder = -1;
    sh.visible = false; // MAP audit: its square corner showed as a pale wedge under big cities
    root.add(sh);
    return sh;
  })();

  // MAP-6/7: a downtown skyline beyond the city's far edge, toward the town but never between the camera and the city
  // (it hides while the view is turned so it would stand in front). A few lit windows near the tops.
  const SKY_MAT = new THREE.MeshBasicMaterial({ color: 0x313d52, fog: true });
  const SKY_LIT = new THREE.MeshBasicMaterial({ color: 0xffc66b, fog: true, toneMapped: false });
  const SKY_GEO = new THREE.BoxGeometry(1, 1, 1);
  const skyline = new THREE.Group(); skyline.name = 'skyline'; root.add(skyline);
  let skyDir = new THREE.Vector3(-1, 0, -1);
  function buildSkyline() {
    for (const o of skyline.children) o.dispose?.();
    skyline.clear();
    const look = map?.look ?? 0; const { dx, dz } = townOf(look);
    // The usual camera stands at +x +z: the far side is −x −z. Keep the skyline within 80° of that side.
    const far = Math.atan2(-1, -1); let a0 = Math.atan2(dz, dx);
    let diff = Math.atan2(Math.sin(a0 - far), Math.cos(a0 - far));
    diff = Math.max(-0.5, Math.min(0.5, diff)); a0 = far + diff;
    skyDir = new THREE.Vector3(Math.cos(a0), 0, Math.sin(a0));
    let R = 0;
    for (const k of Object.keys(map?.blocks ?? {})) { const [bx, bz] = parse(k); R = Math.max(R, Math.cos(Math.atan2(blockPos(bz), blockPos(bx)) - a0) * Math.hypot(blockPos(bx), blockPos(bz))); }
    const n = 30; const cards = new THREE.InstancedMesh(SKY_GEO, SKY_MAT, n); const dots = new THREE.InstancedMesh(SKY_GEO, SKY_LIT, n * 2);
    let nd = 0;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1) - 0.5; const core = 1 - Math.abs(u) * 2;
      const side = u * (R + 20) * 1.5; const d = R + 10 + hash3(i, 5, look) * 14;
      const x = Math.cos(a0) * d - Math.sin(a0) * side; const z = Math.sin(a0) * d + Math.cos(a0) * side;
      const H = 10 + core * (14 + 34 * hash3(i, 7, look)); const W = 6 + hash3(i, 9, look) * 9;
      tmp.position.set(x, H / 2 - 14, z); tmp.rotation.set(0, -a0, 0); tmp.scale.set(4, H + 14, W); tmp.updateMatrix(); cards.setMatrixAt(i, tmp.matrix);
      for (let k = 0; k < 2; k++) if (hash3(i, 11 + k, look) < 0.18) {
        tmp.position.set(x - Math.cos(a0) * 2.1, H - 3 - k * 4 - hash3(i, k, 13) * 6, z - Math.sin(a0) * 2.1 + (k - 0.5) * 2);
        tmp.scale.set(0.5, 0.6, 0.6); tmp.updateMatrix(); dots.setMatrixAt(nd++, tmp.matrix);
      }
    }
    dots.count = nd;
    cards.name = 'skyline-cards'; dots.name = 'skyline-lights';
    skyline.add(cards, dots);
  }

  // Warm light sources: campfire + a lamp at each of the first six places (lights are costly; new places glow).
  const lights = [];
  let fireLevel = 1;
  // A gentle light set high up, so survivors around the fire stay readable instead of blowing out.
  const fireBase = 85;
  const fire = new THREE.PointLight(0xff8a3c, fireBase, 32, 1.2);
  fire.position.set(0, 4.5, 0);
  root.add(fire);
  lights.push({ light: fire, base: fireBase, flicker: 0.25 });
  for (const id of Object.keys(START_FRONT).filter((x) => layout[x])) {
    const L = layout[id];
    const lamp = new THREE.PointLight(0xffa552, 45, 16, 1.5);
    const p = L.center.clone().addScaledVector(L.center.clone().normalize(), -6.5);
    lamp.position.set(p.x, 3, p.z);
    root.add(lamp);
    lights.push({ light: lamp, base: 45, flicker: 0.08 });
  }

  // World anchors for ambient particles (match the voxel colony model, 0.6 world units per voxel).
  const s = BOARD.buildingScale;
  const fx = {
    fire: new THREE.Vector3(0, 1.2 * s + GROUND, 0),
    // The starter container houses' stovepipes (colony voxels → world) and the dorm's.
    chimneys: [...city.HOUSE_CHIMNEYS.map(([x, y, z]) => new THREE.Vector3(x, y, z).multiplyScalar(BOARD.colonyRadius / 50).setY(y * BOARD.colonyRadius / 50 + GROUND)), new THREE.Vector3(COLONY_SLOTS.dorm[0], 3.4 + GROUND, COLONY_SLOTS.dorm[1])],
    // MAP-3: gate posts stand in the wall (3 voxels in from its radius), 6 voxels either side of each opening.
    torches: layout.colony.gates.flatMap((g) => {
      const dir = g.clone().normalize();
      const along = Math.abs(dir.x) < 0.01 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      const v = BOARD.colonyRadius / 50; // world per colony voxel (wall radius = 50 voxels)
      return [-1, 1].map((k) => dir.clone().setY(0).multiplyScalar(47 * v).addScaledVector(along, 6 * v * k).setY(13.5 * v + GROUND));
    }),
  };

  // A separate, animated flame on top of the static campfire voxels.
  const flame = new VoxelModel();
  flame.box(-1, 0, -1, 3, 1, 3, (x, _y, z) => (x === 0 && z === 0 ? P.fireCore : P.fire), true);
  flame.box(0, 1, 0, 1, 2, 1, P.fireCore, true);
  flame.set(0, 3, 0, P.fire, true);
  flame.set(1, 1, 0, P.fire, true); flame.set(0, 1, -1, P.fire, true); flame.set(-1, 1, 0, P.ember, true);
  const flameMesh = flame.build({ size: BOARD.buildingScale * 0.55, cacheKey: 'flame' });
  flameMesh.position.copy(fx.fire).setY(fx.fire.y + 0.25);
  root.add(flameMesh);

  // ---------------------------------------------------------------- MAP-2 C: pop-in
  // A new block: its ground rises (0.3 s), then each chunk piece pops up with a small overshoot (scale 0.6 → 1.05 → 1,
  // y −6 → 0, 20 ms apart, nearest the colony first), and the building lands last with a puff of snow.
  const POP = 0.35;
  const _m = new THREE.Matrix4(); const _p = new THREE.Vector3(); const _s = new THREE.Vector3();
  const curve = (p) => {
    const e = 1 - (1 - p) ** 3;
    return [p < 0.6 ? 0.6 + 0.45 * (p / 0.6) : 1.05 - 0.05 * ((p - 0.6) / 0.4), -6 * (1 - e)];
  };
  function startPop(c, delay, pieceDelay = null) {
    const meshes = [];
    c.group.traverse((o) => { if (o.isInstancedMesh && o.userData.base) meshes.push(o); });
    const pieces = []; // [mesh list, base index, pos, quat, scale, delay]
    const byBase = new Map();
    for (const im of meshes) { if (!byBase.has(im.userData.base)) byBase.set(im.userData.base, []); byBase.get(im.userData.base).push(im); }
    for (const [base, ims] of byBase) base.forEach((mx, i) => {
      const pos = new THREE.Vector3(); const q = new THREE.Quaternion(); const sc = new THREE.Vector3();
      mx.decompose(pos, q, sc);
      pieces.push({ ims, i, pos, q, sc, d: 0 });
    });
    pieces.sort((a, b) => a.pos.lengthSq() - b.pos.lengthSq()).forEach((pc, r) => { pc.d = pieceDelay ? pieceDelay(pc.pos) + (r % 7) * 0.02 : 0.25 + r * 0.02; });
    const last = pieces.reduce((m, pc) => Math.max(m, pc.d), 0.3);
    const modelAt = c.model ? 0.55 : last; // a block's building lands after its ground and around its pieces
    c.pop = { t: -delay, pieces, modelAt, end: Math.max(modelAt, last) + POP, landed: false, modelScale: c.model?.scale.x ?? 1, modelY: c.model?.position.y ?? 0 };
    c.group.visible = !!pieceDelay; // a batch shows at once (its pieces start tiny); a block waits for its turn
    stepPop(c, 0);
  }
  function stepPop(c, dt) {
    const P = c.pop;
    P.t += dt;
    if (P.t < 0) return;
    c.group.visible = true;
    const done = P.t >= P.end;
    if (c.terrain) c.terrain.position.y = done ? 0 : -6 * (1 - (1 - Math.min(1, P.t / 0.3)) ** 3);
    const dirty = new Set();
    for (const pc of P.pieces) {
      const p = done ? 1 : Math.max(0, Math.min(1, (P.t - pc.d) / POP));
      if (pc.last === p) continue;
      pc.last = p;
      const [k, y] = p >= 1 ? [1, 0] : p <= 0 ? [0.001, -6] : curve(p);
      _m.compose(_p.copy(pc.pos).setY(pc.pos.y + y), pc.q, _s.copy(pc.sc).multiplyScalar(k));
      for (const im of pc.ims) { im.setMatrixAt(pc.i, _m); dirty.add(im); }
    }
    for (const im of dirty) { im.instanceMatrix.needsUpdate = true; if (done) im.computeBoundingSphere(); } // culling bounds
    if (c.model) {
      const p = done ? 1 : Math.max(0, Math.min(1, (P.t - P.modelAt) / POP));
      const [k, y] = p >= 1 ? [1, 0] : p <= 0 ? [0.001, -6] : curve(p);
      c.model.scale.setScalar(P.modelScale * k);
      c.model.position.y = P.modelY + y;
      if (p >= 1 && !P.landed) { P.landed = true; puff(c.model.position); }
    }
    if (done) c.pop = null;
  }

  // Snow puffs: a small pool of point clouds, reused (no allocation per frame).
  const PUFF_N = 28;
  const puffs = Array.from({ length: 6 }, () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(PUFF_N * 3), 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, transparent: true, opacity: 0, depthWrite: false }));
    pts.visible = false; pts.frustumCulled = false;
    root.add(pts);
    return { pts, t: 1, at: new THREE.Vector3(), dirs: Array.from({ length: PUFF_N }, (_, i) => [Math.cos(i * 2.4), 0.3 + hash3(i, 1, 7) * 0.8, Math.sin(i * 2.4), 4 + hash3(i, 2, 7) * 4]) };
  });
  let puffNext = 0;
  function puff(at) {
    const pf = puffs[puffNext++ % puffs.length];
    pf.t = 0; pf.at.copy(at); pf.pts.visible = true;
  }
  function stepPuffs(dt) {
    for (const pf of puffs) {
      if (!pf.pts.visible) continue;
      pf.t += dt / 0.9;
      if (pf.t >= 1) { pf.pts.visible = false; continue; }
      const arr = pf.pts.geometry.attributes.position.array;
      const r = 1 - (1 - pf.t) ** 2;
      pf.dirs.forEach(([dx, dy, dz, sp], i) => {
        arr[i * 3] = pf.at.x + dx * sp * r; arr[i * 3 + 1] = pf.at.y + 0.3 + dy * 2.5 * r - pf.t * pf.t * 1.5; arr[i * 3 + 2] = pf.at.z + dz * sp * r;
      });
      pf.pts.geometry.attributes.position.needsUpdate = true;
      pf.pts.material.opacity = 0.85 * (1 - pf.t);
    }
  }

  // MAP-5 crows: perched on roof edges and pole arms; when the camera comes close they take off and circle away,
  // settling again when it pulls back. One instanced mesh; nothing when the graphics tier is Battery saver.
  const crowGeo = geometriesFor('crow', { size: 0.1, jitter: 0 }, crowModel).lit;
  const crows = new THREE.InstancedMesh(crowGeo, MATERIALS.lit, 40); crows.count = 0; crows.frustumCulled = false; crows.name = 'crows';
  root.add(crows);
  let zoomNow = 1; let flight = 0;
  function stepCrows(t, dt) {
    const saver = typeof document !== 'undefined' && document.body?.dataset?.gfx === 'saver';
    crows.visible = !saver && crowPerches.length > 0 && lodLevel < 2;
    if (!crows.visible) return;
    flight += ((zoomNow > 1.6 ? 1 : 0) - flight) * Math.min(1, dt * (zoomNow > 1.6 ? 1.5 : 0.3));
    crows.count = crowPerches.length;
    crowPerches.forEach((p, i) => {
      const a = i * 2.4 + t * 0.6; const f = flight;
      tmp.position.set(p.x + Math.cos(a) * 6 * f, p.y + f * (5 + (i % 4)), p.z + Math.sin(a) * 6 * f);
      tmp.rotation.set(0, f > 0.05 ? -a : i * 1.3, 0); tmp.scale.setScalar(1 + f * 0.3 * Math.abs(Math.sin(t * 12 + i))); tmp.updateMatrix();
      crows.setMatrixAt(i, tmp.matrix);
    });
    crows.instanceMatrix.needsUpdate = true;
  }

  let hovered = null;
  let selected = null;
  let lastT = null;

  const show = (c) => {
    c.group.visible = c.k > 0.001;
    const e = 1 - (1 - c.k) ** 3; // ease out
    c.group.position.y = -22 * (1 - e);
  };

  let skyHooked = false;
  let detailSaver = null; let detailCount = -1;
  const hookSkyline = () => {
    const scene = root.parent; if (skyHooked || !scene?.isScene) return;
    skyHooked = true; const prev = scene.onBeforeRender;
    scene.onBeforeRender = (r, sc, cam, ...rest) => {
      prev?.call(scene, r, sc, cam, ...rest);
      const v = cam.getWorldDirection(new THREE.Vector3()); v.y = 0; v.normalize();
      skyline.visible = v.dot(skyDir) > 0.15; // only while it stands behind the city
    };
  };
  const api = {
    root,
    layout,
    fx,
    pickTargets,
    locationGroups,
    /** Step 20: colony bonfire strength (morale), ~0.1 .. 1.4. */
    setFire(k) { fireLevel = k; },
    setHovered(id) { hovered = id; },
    setSelected(id) { selected = id; },
    /** MAP-2 D: the camera zoom picks the level of detail of city models. */
    setZoom(z) {
      zoomNow = z;
      const level = z >= 0.8 ? 0 : z >= 0.56 ? 1 : 2; // MAP-3: a stage-4 overview (zoom ~0.5) uses the light level
      if (level === lodLevel) return;
      lodLevel = level;
      for (const n of lodNodes) { n.visible = lodShows(n.userData.lod, level); realize(n); }
    },
    /** MAP-1: draw the game's map. New blocks rise into place (staggered outward); the first call snaps.
     *  Calls onBounds with the city's outline. */
    setMap(next, { snap = false } = {}) {
      // A different city (new game, loaded save): start over.
      // MAP-2 A: blocks never change, so any difference means another city (new game / load): start over.
      // MAP-3 E: another game's look (rail line, districts) also means another city: the layout must follow it.
      if (Object.entries(cells).some(([k, c]) => c.sig !== JSON.stringify(next.blocks[k] ?? null)) || (map && (map.look ?? 0) !== (next.look ?? 0))) {
        for (const c of [...Object.values(cells), ...batches]) { root.remove(c.group); }
        for (const k of Object.keys(cells)) delete cells[k];
        batches.length = 0;
        for (const h of pickTargets.splice(0)) root.remove(h);
        for (const [id, r] of Object.entries(rings)) { root.remove(r); delete rings[id]; }
        for (const id of Object.keys(layout)) if (id !== 'colony') delete layout[id];
        for (const id of Object.keys(locationGroups)) delete locationGroups[id];
        glowMats.length = 0;
        lodNodes.length = 0;
        queue.length = 0;
        houseSpots.length = 0; courtyards.length = 0;
        map = null;
        snap = true;
      }
      deferring = progressive && snap;
      const fresh = Object.keys(next.blocks).filter((k) => !cells[k]);
      const oldRoads = new Set(map?.roads ?? []);
      map = next;
      computeLayout(map, layout);
      streets = streetSegments(map.roads, layout);
      const newStreets = streets.filter(([, , seg]) => seg === 'gate' ? !oldRoads.size : !oldRoads.has(seg));
      // Old blocks next to new ones (or new streets) get fresh terrain: their rim is now inside the city.
      const touched = new Set();
      for (const k of fresh) { const [bx, bz] = parse(k); for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) touched.add(`${bx + dx},${bz + dz}`); }
      for (const [a, b] of newStreets) touched.add(cellOf((a.x + b.x) / 2 + 1, (a.z + b.z) / 2 + 1)).add(cellOf((a.x + b.x) / 2 - 1, (a.z + b.z) / 2 - 1));
      for (const k of touched) {
        const c = cells[k];
        if (!c) continue;
        c.terrain.traverse((t) => t.geometry?.dispose());
        for (const t of c.terrain.children) { const i = lodNodes.indexOf(t); if (i >= 0) lodNodes.splice(i, 1); }
        c.terrain.clear();
        c.terrain.add(lazyLod('near', () => terrainFor(k), true), lazyLod('far', () => terrainFor(k, true), true));
      }
      fresh.sort((a, b) => Math.hypot(...parse(a)) - Math.hypot(...parse(b)));
      const dist = (k) => { const [x, z] = parse(k); return Math.hypot(blockPos(x), blockPos(z)); };
      const inner = fresh.length ? Math.max(0, dist(fresh[0]) - B) : 0;
      const outer = fresh.length ? dist(fresh[fresh.length - 1]) + B : 1;
      const spread = 2.2 / Math.max(1, outer - inner);
      fresh.forEach((k, i) => {
        cells[k] = buildBlock(k, map.blocks[k]);
        cells[k].sig = JSON.stringify(map.blocks[k]);
        if (!snap) startPop(cells[k], Math.max(0, (dist(k) - inner) * spread)); // outward from the colony, a growth ≤ ~3 s
      });
      if (fresh.length || newStreets.length) {
        // MAP-2 D: one instanced set per growth for every chunk piece and street prop (few draw calls); each
        // piece pops on its own, later the further it is from the colony.
        const batch = buildProps(fresh, newStreets);
        trackGlow(batch.group);
        batch.k = 1;
        batches.push(batch);
        if (!snap) startPop(batch, 0, (pos) => 0.3 + Math.min(2.4, (Math.hypot(pos.x, pos.z) - inner) * spread));
      }
      buildStreetDecor(); // after the blocks: power drops need the new buildings
      buildSkyline();
      const xs = Object.keys(map.blocks).map((k) => parse(k)[0]); const zs = Object.keys(map.blocks).map((k) => parse(k)[1]);
      // World extents of the open blocks (street centre lines around them).
      const lo = (v) => blockPos(v) - blockHalf(v); const hi = (v) => blockPos(v) + blockHalf(v);
      const bounds = { x0: lo(Math.min(...xs)), x1: hi(Math.max(...xs)), z0: lo(Math.min(...zs)), z1: hi(Math.max(...zs)), block: B, snap };
      shadow.scale.set(bounds.x1 - bounds.x0 + 1.4 * B, bounds.z1 - bounds.z0 + 1.4 * B, 1);
      shadow.position.set((bounds.x0 + bounds.x1) / 2 + 4, -16, (bounds.z0 + bounds.z1) / 2 + 6);
      deferring = false;
      api.onBounds?.(bounds);
    },
    setBase,
    /** MAP audit: every placed thing with a world box: { kind, box, group } (visible level of detail). */
    auditItems() {
      const out = debugItems.map((d) => ({ ...d, group: 'furniture' }));
      const box = new THREE.Box3(); const m = new THREE.Matrix4();
      root.updateMatrixWorld(true);
      root.traverse((o) => {
        if (!o.isInstancedMesh || o.material.isMeshBasicMaterial || o.name === 'lamp-pools') return; // lit parts only (glow materials are cloned)
        for (let p = o; p; p = p.parent) if (p.visible === false) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m);
          out.push({ kind: String(o.userData.kind).replace(/^lod\d-/, '').replace(/-far$/, ''), box: box.copy(o.geometry.boundingBox).applyMatrix4(m.premultiply(o.matrixWorld)).clone(), group: 'instanced' });
        }
      });
      for (const [id, g] of Object.entries(locationGroups)) if (id !== 'colony') out.push({ kind: `place:${id}`, box: new THREE.Box3().setFromObject(g), group: 'place' });
      return out;
    },
    /** LOAD-1: models still waiting to be made (progressive start). */
    get pending() { return queue.length; },
    /** Make every waiting model now (tests, screenshots). */
    flush() { while (queue.length) drainQueue(1e9); },
    stats,
    update(t) {
      const dt = Math.min(0.1, Math.max(0, t - (lastT ?? t))); lastT = t;
      hookSkyline();
      // MAP-7: Battery saver drops the extra details (kerb cars, fields, birches, the rim's icicles).
      const saver = typeof document !== 'undefined' && document.body?.dataset?.gfx === 'saver';
      if (saver !== detailSaver || detailNodes.length !== detailCount) { detailSaver = saver; detailCount = detailNodes.length; for (const o of detailNodes) o.visible = !saver; }
      for (const c of Object.values(cells)) if (c.pop) stepPop(c, dt);
      for (const c of batches) if (c.pop) stepPop(c, dt);
      for (let i = slotPops.length - 1; i >= 0; i--) { stepPop(slotPops[i], dt); if (!slotPops[i].pop) slotPops.splice(i, 1); }
      stepPuffs(dt);
      stepCrows(t, dt);
      AMBER_MAT.visible = Math.floor(t * 1.6) % 2 === 0; // amber signals blink
      if (pools && flickers.length) {
        for (const [n, i] of flickers.entries()) { const f = Math.sin(t * 9 + n * 2.3) > 0.6 || Math.sin(t * 23 + n) > 0.93 ? 0.15 : 1; _c.setScalar(f); pools.setColorAt(i, _c); }
        pools.instanceColor.needsUpdate = true;
      }
      if (queue.length) drainQueue();
      for (const c of batches) {
        if (c.k === c.target) continue;
        if (c.delay > 0) { c.delay -= dt; continue; }
        c.k += Math.sign(c.target - c.k) * Math.min(Math.abs(c.target - c.k), dt / 1.1); // ~1.1 s
        show(c);
      }
      // Flame: flicker in height and sway.
      const fl = Math.min(1.3, fireLevel);
      flameMesh.visible = fl > 0.15; // a dead colony: the fire is out
      flameMesh.scale.set(fl * (1 + Math.sin(t * 17) * 0.06), fl * (1 + Math.sin(t * 11.3) * 0.18 + Math.sin(t * 23) * 0.08), fl * (1 + Math.cos(t * 15) * 0.06));
      flameMesh.rotation.y = Math.sin(t * 2.1) * 0.4;
      // Windows: a slow breathing glow, with the odd quick flicker.
      for (const g of glowMats) {
        const flick = Math.sin(t * 0.7 + g.phase) > 0.985 ? 0.55 : 1;
        g.mat.color.setScalar(g.base * (0.92 + Math.sin(t * 1.3 + g.phase) * 0.08) * flick);
      }
      for (const [i, l] of lights.entries()) {
        const f = Math.sin(t * 13 + i * 3) * 0.5 + Math.sin(t * 7.3 + i) * 0.5;
        l.light.intensity = l.base * (1 + f * l.flicker) * (i === 0 ? fireLevel : 1);
      }
      for (const [id, ring] of Object.entries(rings)) {
        const target = id === selected ? 0.9 : id === hovered ? 0.55 : 0;
        if (target === 0 && ring.material.opacity < 0.002) { ring.visible = false; continue; }
        ring.visible = true;
        ring.material.opacity += (target - ring.material.opacity) * 0.2;
        ring.material.color.setHex(id === selected ? 0xffc46b : 0xbfdcff);
        ring.scale.setScalar(1 + (id === selected ? Math.sin(t * 3) * 0.03 : 0));
      }
    },
  };
  api.setMap(START_MAP, { snap: true });
  return api;
}
