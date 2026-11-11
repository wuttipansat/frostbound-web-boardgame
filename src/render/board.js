// The diorama board: a snowed-in city built block by block from the game map (MAP-1). The colony sits in
// the middle block; places, filler blocks (parking, plaza, park, ruins, rail yard, containers), streets on
// the block edges, instanced trees / rocks / cars / lamps, and pick targets for each place.
import * as THREE from 'three';
import { VoxelModel, hash3, MATERIALS, geometriesFor, groupOf, packedBounds } from './voxel.js';
import { P } from './palette.js';
import { LOCATION_BUILDERS_HD, colonyHD, treeModelHD, rockModelHD } from './buildings.js';
import { buildTerrainHD, ROAD } from './terrain.js';
import { carModel, lampModel, containerModel, clutterModel, CLUTTER_KINDS } from './props.js';
import * as city from './city.js';
import { downsample } from './detail.js';
import { LOCATIONS } from '../content/locations.js';
import { START_MAP, LEGACY_MAP } from '../core/map.js';

export const BOARD = {
  block: 30,          // MAP-3: block pitch (world): a 3-chunk block + one street (two lanes + sidewalks)
  radius: 46,         // stage-1 slab half size (world units)
  locationRadius: 27,
  colonyRadius: 9,    // palisade radius (world units)
  ringRoad: 12.5,
  buildingScale: 0.6, // world units per building voxel
};
const FILLER_MODELS = { rail: city.railYard }; // MAP-1c: other decoration blocks are built from chunks
const PLACE_SCALE = 0.8; // every place and small building shares one voxel size (0.3 × 0.8 world units)
// What fills a free chunk, by block kind: [content, weight].
const RECIPES = {
  place: [['house', 55], ['trees', 18], ['car', 10], ['yard', 10], ['clutter', 7]],
  shops: [['shop', 80], ['trees', 10], ['clutter', 10]],
  parking: [['car', 35], ['house', 35], ['yard', 30]],
  containers: [['yard', 75], ['house', 15], ['clutter', 10]],
  plaza: [['trees', 35], ['shop', 45], ['clutter', 20]],
  park: [['trees', 80], ['clutter', 20]],
  ruins: [['ruin', 55], ['house', 20], ['rocks', 25]],
};
// A big piece some decoration blocks put on their street side: [model key, wide, deep].
const CENTERPIECE = { parking: ['parking', 2, 2], plaza: ['fountain', 1, 1], park: ['fountain', 1, 1], ruins: ['ruinBig', 1, 1] };
// The six starting places keep their old fronts; new ones face a street (+z / +x first: the sides the camera sees).
const START_FRONT = { police: 'z', grocery: 'z', school: 'z', hospital: 'x', library: 'x', gas: 'x' };

const parse = (k) => k.split(',').map(Number);

// MAP-1b / MAP-3: a block is 3×3 chunks inside its sidewalks; a place takes some of them at the street side, the
// rest hold small buildings and props. Chunk size = (pitch − one street with its sidewalks) / 3.
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
const FOOT = { church: [1, 2] };

/** Where a place sits in its block: front direction, footprint (in chunks), centre and the chunks it covers. */
export function placePlan(id, type, bx, bz, roads, foot = null, front = null) {
  const c = new THREE.Vector3(blockPos(bx), 0, blockPos(bz));
  const fronts = { z: `${bx},${bz + 1},h`, x: `${bx + 1},${bz},v`, '-z': `${bx},${bz},h`, '-x': `${bx},${bz},v` };
  // MAP-1d: the block's stored front (older maps: work it out from the streets).
  const pick = front ?? START_FRONT[id] ?? ['z', 'x', '-z', '-x'].find((f) => roads.has(fronts[f])) ?? 'z';
  const toFront = { z: [0, 1], x: [1, 0], '-z': [0, -1], '-x': [-1, 0] }[pick];
  const fwd = new THREE.Vector3(toFront[0], 0, toFront[1]);
  const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
  let [fw, fd] = foot ?? FOOT[type] ?? [2, 2];
  if (/-\d+$/.test(id) && fw === 2 && hash3(bx, 41, bz) < 0.35) fd = 1; // some repeats are a smaller branch
  // Rows run back from the front street, columns along it (3 each, 5 in the colony's row / column).
  const alongX = toFront[0] !== 0;
  const rows = chunksOf(alongX ? bx : bz); const cols = chunksOf(alongX ? bz : bx);
  const edge = rows * CHUNK / 2; // block centre → front sidewalk
  const col = Math.floor(hash3(bx, 43, bz) * (cols + 1 - fw)); // first lateral column
  const lat = (col + fw / 2 - cols / 2) * CHUNK;
  const fwdC = edge - fd * CHUNK / 2;
  const covered = [];
  for (let i = 0; i < fd; i++) for (let j = col; j < col + fw; j++) covered.push(`${i},${j}`); // i: row from the front
  const at = (forward, lateral) => c.clone().addScaledVector(fwd, forward).addScaledVector(side, lateral);
  return { c, fwd, side, fw, fd, lat, rows, cols, edge, center: at(fwdC, lat), covered, at };
}

/** World centre of chunk (row i from the front, column j) of a block. */
export const chunkCenter = (plan, i, j) => plan.at(plan.edge - (i + 0.5) * CHUNK, (j + 0.5 - plan.cols / 2) * CHUNK);

function placeLayout(id, type, bx, bz, roads, front) {
  const plan = placePlan(id, type, bx, bz, roads, null, front);
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
    center: new THREE.Vector3(0, 0, 0),
    facing: 0,
    label: new THREE.Vector3(0, 9, 0),
    zombieSlots: gateDirs.flatMap(([dx, dz]) => [-1.4, 0, 1.4].map((l) => new THREE.Vector3(
      dx * (BOARD.colonyRadius + 1.6) + (dz !== 0 ? l : 0), 0, dz * (BOARD.colonyRadius + 1.6) + (dx !== 0 ? l : 0),
    ))),
    survivorSlots: Array.from({ length: 10 }, (_, k) => {
      const a = (k / 10) * Math.PI * 2 + 0.3;
      return new THREE.Vector3(Math.cos(a) * 4.2, 0, Math.sin(a) * 4.2);
    }),
    gates: gateDirs.map(([dx, dz]) => new THREE.Vector3(dx * BOARD.colonyRadius, 0, dz * BOARD.colonyRadius)),
    hitRadius: BOARD.colonyRadius + 1,
  };
}

/** Board-space layout for every place on a map (positions, facing, slot anchors). */
export function computeLayout(map = LEGACY_MAP, into = {}) {
  const roads = new Set(map.roads);
  for (const [k, b] of Object.entries(map.blocks)) {
    if (b.kind !== 'place' || into[b.placeId]) continue;
    into[b.placeId] = placeLayout(b.placeId, b.type ?? b.placeId, ...parse(k), roads, b.front);
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
  for (const g of layout.colony.gates) out.push([g.clone(), g.clone().normalize().multiplyScalar(blockHalf(0)), 'gate']);
  return out;
}

// ---------------------------------------------------------------- decorations

/** make: () => VoxelModel, only called when the geometry is neither cached nor baked. */
function instanced(make, scale, transforms, { castShadow = true, cacheKey = null, jitter = 0.05 } = {}) {
  const { lit, glow } = cacheKey ? geometriesFor(cacheKey, { size: scale, jitter }, make) : make().buildGeometries({ size: scale, jitter });
  const group = new THREE.Group();
  for (const [geo, mat] of [[lit, MATERIALS.lit], [glow, MATERIALS.glow]]) {
    if (!geo) continue;
    const im = new THREE.InstancedMesh(geo, mat, transforms.length);
    transforms.forEach((t, i) => im.setMatrixAt(i, t));
    im.userData.base = transforms; // MAP-2 C: pop-in animates from these
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
  const _w = new THREE.Vector3();
  function drainQueue(budgetMs = 6) {
    if (queueDirty) { queue.sort((a, b) => a.getWorldPosition(_w).lengthSq() - b.getWorldPosition(_w).lengthSq()); queueDirty = false; }
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < budgetMs) { const n = queue.shift(); n.userData.queued = false; realize(n); }
    stats.maxSliceMs = Math.max(stats.maxSliceMs, performance.now() - t0);
  }
  const stats = { maxSliceMs: 0 };
  const lodModel = (key, make, eager = false) => {
    const g = new THREE.Group();
    for (let L = 0; L < 3; L++) g.add(lazyLod(L, () => groupOf(geometriesFor(`lod${L}-${key}`, { size: LOD_SIZE[L], jitter: 0 }, () => city.lod(L, key, make))), eager));
    return g;
  };
  /** Model extents (x, z) over all levels, from voxel bounds (no meshing needed). */
  const lodExtent = (key, make) => {
    let x = 0; let z = 0;
    for (let L = 0; L < 3; L++) {
      const { min, max } = packedBounds(`lod${L}-${key}`, { size: LOD_SIZE[L], jitter: 0 }) ?? city.lod(L, key, make).bounds();
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
      lazyLod('far', () => instanced(() => propPair(key, make)[1], scale * 2, list, { cacheKey: `${key}-far`, jitter: 0, castShadow: false })),
    );
    return g;
  };
  const lodInstanced = (key, make, list) => {
    const g = new THREE.Group();
    for (let L = 0; L < 3; L++) g.add(lazyLod(L, () => instanced(() => city.lod(L, key, make), LOD_SIZE[L], list, { cacheKey: `lod${L}-${key}`, jitter: 0, castShadow: L < 2 })));
    return g;
  };
  const cellOf = (x, z) => `${gridOf(x)},${gridOf(z)}`;
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
  const terrainFor = (key, cell = 0.5) => {
    const [bx, bz] = parse(key);
    const cx = blockPos(bx); const cz = blockPos(bz); const hx = blockHalf(bx); const hz = blockHalf(bz);
    const near = streets.filter(([a, b]) => Math.min(a.x, b.x) < cx + hx + 4 && Math.max(a.x, b.x) > cx - hx - 4 && Math.min(a.z, b.z) < cz + hz + 4 && Math.max(a.z, b.z) > cz - hz - 4);
    // MAP-1c: built-up blocks are flat and paved; parks and the rail yard keep their snowdrifts.
    const blocksNear = [];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const b = map.blocks[`${bx + dx},${bz + dz}`]; if (b) blocksNear.push([blockPos(bx + dx), blockPos(bz + dz), b.kind, ...edgesOf(bx + dx, bz + dz)]); }
    const paved = (x, z) => blocksNear.some(([px, pz, k, ex, ez]) => k !== 'colony' && k !== 'park' && k !== 'rail' && Math.abs(x - px) < ex + 0.4 && Math.abs(z - pz) < ez + 0.4);
    // Zebra crossings next to street junctions (3+ streets meet).
    const deg = new Map();
    for (const [a, b2, seg] of near) if (seg !== 'gate') for (const p of [a, b2]) { const k = `${p.x},${p.z}`; deg.set(k, (deg.get(k) ?? 0) + 1); }
    const junctions = [...deg].filter(([, n]) => n >= 3).map(([k]) => k.split(',').map(Number));
    const crossing = (x, z) => junctions.some(([jx, jz]) => {
      const ax = Math.abs(x - jx); const az = Math.abs(z - jz);
      const along = Math.max(ax, az); const across = Math.min(ax, az);
      return along > ROAD.walk + 0.4 && along < ROAD.walk + 2.2 && across < ROAD.half - 0.3 && Math.floor(across * 2.5 + 10) % 2 === 0;
    });
    const geo = buildTerrainHD({
      center: [cx, cz], half: Math.max(hx, hz), edgeDist: edgeDist(bx, bz), paved, crossing, cell,
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
    const mesh = new THREE.Mesh(geo, MATERIALS.lit);
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
    ring.position.set(L.center.x, 0.06, L.center.z);
    root.add(ring);
    rings[L.id] = ring;
  }

  /** One block: terrain, its building / colony / filler. */
  function buildBlock(key, b) {
    const [bx, bz] = parse(key);
    const g = new THREE.Group(); g.name = `cell ${key}`;
    const terrain = new THREE.Group(); terrain.name = 'terrain-lod';
    terrain.add(lazyLod('near', () => terrainFor(key), true), lazyLod('far', () => terrainFor(key, 1), true));
    g.add(terrain);
    let model = null;
    if (b.kind === 'colony') {
      model = lodModel('colony', () => colonyHD(BOARD.colonyRadius * 2), true);
      model.name = 'colony';
      locationGroups.colony = model;
    } else if (b.kind === 'place') {
      const L = layout[b.placeId];
      const type = b.type ?? b.placeId;
      const make = LOCATION_BUILDERS_HD[type] ?? LOCATION_BUILDERS_HD.grocery;
      model = lodModel(`place-${type}`, make);
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
      model.position.set(blockPos(bx), 0, blockPos(bz));
      model.rotation.y = Math.floor(hash3(bx, 7, bz) * 2) * Math.PI;
    }
    if (model) { g.add(model); trackGlow(model); }
    root.add(g);
    return { group: g, terrain, model, k: 1, target: 1, delay: 0 };
  }

  /** Instanced trees, rocks, cars and lamps for a set of new blocks and streets: one group per growth. */
  function buildProps(keys, newStreets, attach = true) {
    const group = new THREE.Group(); group.name = 'props';
    const trees = [[], [], []]; const rocks = [[], [], []]; const cars = [[], [], [], []]; const lamps = []; const yards = [[], [], []];
    const free = (x, z, b) => {
      for (const [a, c] of streets) if (distToSegment(x, z, a, c) < ROAD.walk) return false;
      if (b.kind === 'colony') return Math.hypot(x, z) > BOARD.colonyRadius + 3;
      const gx = gridOf(x); const gz = gridOf(z); const [ex, ez] = edgesOf(gx, gz);
      return Math.abs(x - blockPos(gx)) > ex - 0.5 || Math.abs(z - blockPos(gz)) > ez - 0.5;
    };
    const houses = Array.from({ length: city.SMALL_VARIANTS }, () => []);
    const put = (list, p, rotY, scale = 1) => { tmp.position.copy(p); tmp.rotation.set(0, rotY, 0); tmp.scale.setScalar(scale); tmp.updateMatrix(); list.push(tmp.matrix.clone()); };
    const ruins = [[], []]; const pieces = { parking: [], fountain: [] }; const clutter = Array.from({ length: CLUTTER_KINDS }, () => []);
    const roadSet = new Set(map.roads);
    for (const key of keys) {
      const b = map.blocks[key];
      const [bx, bz] = parse(key);
      if (RECIPES[b.kind] || b.kind === 'place') {
        // MAP-1b/c: a block is 3×3 chunks. A place (or a decoration block's centrepiece) takes some on the street
        // side; the rest hold small buildings, shops, trees, cars, container stacks, ruins or clutter.
        const cp = CENTERPIECE[b.kind];
        const plan = b.kind === 'place' ? layout[b.placeId].plan : placePlan(`${b.kind}@`, b.kind, bx, bz, roadSet, cp ? [cp[1], cp[2]] : [0, 0], b.front);
        const recipe = RECIPES[b.kind] ?? RECIPES.place;
        const face0 = Math.atan2(plan.fwd.x, plan.fwd.z);
        if (cp) {
          const at = plan.center.clone();
          if (cp[0] === 'ruinBig') put(ruins[1], at, face0, PLACE_SCALE); else put(pieces[cp[0]], at, face0, PLACE_SCALE);
        }
        for (let i = 0; i < plan.rows; i++) for (let j = 0; j < plan.cols; j++) {
          if (plan.covered.includes(`${i},${j}`)) continue;
          const p = chunkCenter(plan, i, j);
          const r2 = hash3(bx * 5 + i, 67, bz * 5 + j);
          const what = pickBy(recipe, hash3(bx * 3 + j, 61 + i, bz * 3 + i));
          // Front-row buildings face the street; others any way.
          const face = i === 0 ? face0 : Math.floor(r2 * 4) * (Math.PI / 2);
          if (what === 'house' || what === 'shop') {
            const v = Math.floor(r2 * city.SMALL_VARIANTS / 2) * 2 + (what === 'shop' ? 0 : 1); // even variants have shopfronts
            put(houses[v % city.SMALL_VARIANTS], p, face, city.SMALL_SCALE);
          } else if (what === 'trees') {
            for (let k = 0; k < 3; k++) {
              const q = p.clone().add(new THREE.Vector3((hash3(k, bx, j) - 0.5) * 4, 0, (hash3(k, bz, i) - 0.5) * 4));
              put(trees[Math.floor(hash3(k, i, j) * 3)], q, k, 0.7 + hash3(j, k, i) * 0.5);
            }
          } else if (what === 'car') {
            put(cars[Math.floor(r2 * 4)], p.clone().addScaledVector(plan.side, -1.3), face + Math.PI / 2);
            put(cars[Math.floor(hash3(i, j, bx) * 4)], p.clone().addScaledVector(plan.side, 1.3), face + Math.PI / 2);
          } else if (what === 'yard') {
            put(yards[Math.floor(r2 * 3)], p.clone().addScaledVector(plan.fwd, -1.2), face);
            put(yards[Math.floor(hash3(j, i, bz) * 3)], p.clone().addScaledVector(plan.fwd, 1.4), face);
          } else if (what === 'ruin') put(ruins[Math.floor(r2 * 2)], p, face, PLACE_SCALE);
          else if (what === 'rocks') { for (let k = 0; k < 2; k++) put(rocks[k], p.clone().add(new THREE.Vector3((k - 0.5) * 3, 0, (r2 - 0.5) * 3)), r2 * 6, 0.9); }
          else for (let k = 0; k < 3; k++) put(clutter[Math.floor(hash3(k, i + bx, j + bz) * CLUTTER_KINDS)], p.clone().add(new THREE.Vector3((hash3(k, 3, j) - 0.5) * 4, 0, (hash3(k, 5, i) - 0.5) * 4)), hash3(k, i, j) * 6);
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
        tmp.position.set(x, 0, z); tmp.rotation.set(0, Math.floor(r * 4) * (Math.PI / 2), 0); tmp.scale.setScalar(0.75 + r * 0.6); tmp.updateMatrix();
        if (i % 3 === 2) rocks[Math.floor(r * 3)].push(tmp.matrix.clone());
        else if (i === 0 && b.kind === 'place' && r < 0.3) yards[Math.floor(r * 9) % 3].push(tmp.matrix.clone());
        else trees[Math.floor(r * 3)].push(tmp.matrix.clone());
      });
    }
    newStreets.forEach(([a, b, seg], i) => {
      const dir = b.clone().sub(a); const len = dir.length(); dir.normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      const at = (t, lat) => a.clone().addScaledVector(dir, len * t).addScaledVector(side, lat);
      const h = (k) => hash3(i, k, seg.length * 3 + (seg.charCodeAt(0) ?? 0));
      if (len > 6 && h(2) < 0.6) {
        tmp.position.copy(at(0.3 + h(3) * 0.4, (h(4) < 0.5 ? -1 : 1) * ROAD.half / 2));
        tmp.rotation.set(0, Math.atan2(dir.x, dir.z) - Math.PI / 2 + (h(5) - 0.5) * 0.6, 0); tmp.scale.setScalar(1); tmp.updateMatrix();
        cars[Math.floor(h(6) * 4)].push(tmp.matrix.clone());
      }
      if (len > 8) { // lamps on both sides, staggered
        for (const [t, lat] of [[0.3, ROAD.kerb + 0.5], [0.7, -ROAD.kerb - 0.5]]) {
          tmp.position.copy(at(t, lat)); tmp.rotation.set(0, Math.atan2(side.x * Math.sign(lat), side.z * Math.sign(lat)) - Math.PI / 2, 0); tmp.scale.setScalar(1); tmp.updateMatrix();
          lamps.push(tmp.matrix.clone());
        }
        for (let k = 0; k < 2; k++) if (h(10 + k) < 0.7) { // cones, crates, barrels, bags, barriers on the sidewalk
          tmp.position.copy(at(0.15 + h(12 + k) * 0.7, (k ? -1 : 1) * (ROAD.walk - 0.9))); tmp.rotation.set(0, h(14 + k) * 6, 0); tmp.updateMatrix();
          clutter[Math.floor(h(16 + k) * (CLUTTER_KINDS - 1))].push(tmp.matrix.clone());
        }
      }
    });
    trees.forEach((list, k) => { if (list.length) group.add(lodProp(`tree-${k}`, () => treeModelHD(k, 1), 0.25, list)); });
    houses.forEach((list, v) => { if (list.length) group.add(lodInstanced(`small-${v}`, () => city.smallBuilding(v), list)); });
    ruins.forEach((list, v) => { if (list.length) group.add(lodInstanced(`ruin-${v}`, () => city.ruinSmall(v), list)); });
    if (pieces.parking.length) group.add(lodInstanced('parking-small', city.parkingSmall, pieces.parking));
    if (pieces.fountain.length) group.add(lodInstanced('fountain', city.fountain, pieces.fountain));
    clutter.forEach((list, k) => { if (list.length) group.add(lazyLod('near', () => instanced(() => clutterModel(k), 0.12, list, { cacheKey: `clutter-${k}`, jitter: 0, castShadow: false }))); });
    rocks.forEach((list, k) => { if (list.length) group.add(lazyLod('near', () => instanced(() => rockModelHD(k), 0.25, list, { cacheKey: `rock-${k}`, jitter: 0 }))); });
    cars.forEach((list, v) => { if (list.length) group.add(lazyLod('near', () => instanced(() => carModel(v), 0.15, list, { cacheKey: `car4-${v}`, jitter: 0, castShadow: false }))); });
    if (lamps.length) group.add(lazyLod('near', () => instanced(lampModel, 0.15, lamps, { cacheKey: 'lamp', jitter: 0, castShadow: false })));
    yards.forEach((list, k) => { if (list.length) group.add(lodProp(`container-${k}`, () => containerModel(k, 1 + (k % 2)), 0.2, list)); });
    if (attach) root.add(group);
    return { group, k: 0, target: 1, delay: 0 };
  }

  // The slab's soft shadow on the backdrop (follows the city's outline).
  const shadow = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d'); const gr = g.createRadialGradient(32, 32, 10, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.65)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, fog: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.set(4, -16, 6); sh.renderOrder = -1;
    root.add(sh);
    return sh;
  })();

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
    fire: new THREE.Vector3(0, 1.2 * s, 0),
    chimneys: [new THREE.Vector3(-8 * s, 8.6 * s, -10 * s), new THREE.Vector3(11 * s, 8.6 * s, -11 * s)],
    // Gate posts stand at the palisade (18 voxels out), 3 voxels either side of each opening.
    torches: layout.colony.gates.flatMap((g) => {
      const dir = g.clone().normalize();
      const along = Math.abs(dir.x) < 0.01 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      return [-1, 1].map((k) => dir.clone().multiplyScalar(18 * s).addScaledVector(along, 3 * s * k).setY(7 * s));
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

  let hovered = null;
  let selected = null;
  let lastT = null;

  const show = (c) => {
    c.group.visible = c.k > 0.001;
    const e = 1 - (1 - c.k) ** 3; // ease out
    c.group.position.y = -22 * (1 - e);
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
      const level = z >= 0.8 ? 0 : z >= 0.5 ? 1 : 2;
      if (level === lodLevel) return;
      lodLevel = level;
      for (const n of lodNodes) { n.visible = lodShows(n.userData.lod, level); realize(n); }
    },
    /** MAP-1: draw the game's map. New blocks rise into place (staggered outward); the first call snaps.
     *  Calls onBounds with the city's outline. */
    setMap(next, { snap = false } = {}) {
      // A different city (new game, loaded save): start over.
      // MAP-2 A: blocks never change, so any difference means another city (new game / load): start over.
      if (Object.entries(cells).some(([k, c]) => c.sig !== JSON.stringify(next.blocks[k] ?? null))) {
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
        c.terrain.add(lazyLod('near', () => terrainFor(k), true), lazyLod('far', () => terrainFor(k, 1), true));
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
      const xs = Object.keys(map.blocks).map((k) => parse(k)[0]); const zs = Object.keys(map.blocks).map((k) => parse(k)[1]);
      // World extents of the open blocks (street centre lines around them).
      const lo = (v) => blockPos(v) - blockHalf(v); const hi = (v) => blockPos(v) + blockHalf(v);
      const bounds = { x0: lo(Math.min(...xs)), x1: hi(Math.max(...xs)), z0: lo(Math.min(...zs)), z1: hi(Math.max(...zs)), block: B, snap };
      shadow.scale.set(bounds.x1 - bounds.x0 + 1.4 * B, bounds.z1 - bounds.z0 + 1.4 * B, 1);
      shadow.position.set((bounds.x0 + bounds.x1) / 2 + 4, -16, (bounds.z0 + bounds.z1) / 2 + 6);
      deferring = false;
      api.onBounds?.(bounds);
    },
    /** LOAD-1: models still waiting to be made (progressive start). */
    get pending() { return queue.length; },
    /** Make every waiting model now (tests, screenshots). */
    flush() { while (queue.length) drainQueue(1e9); },
    stats,
    update(t) {
      const dt = Math.min(0.1, Math.max(0, t - (lastT ?? t))); lastT = t;
      for (const c of Object.values(cells)) if (c.pop) stepPop(c, dt);
      for (const c of batches) if (c.pop) stepPop(c, dt);
      stepPuffs(dt);
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
