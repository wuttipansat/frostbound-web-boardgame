// The diorama board: a snowed-in city built block by block from the game map (MAP-1). The colony sits in
// the middle block; places, filler blocks (parking, plaza, park, ruins, rail yard, containers), streets on
// the block edges, instanced trees / rocks / cars / lamps, and pick targets for each place.
import * as THREE from 'three';
import { VoxelModel, hash3, MATERIALS } from './voxel.js';
import { P } from './palette.js';
import { LOCATION_BUILDERS_HD, colonyHD, treeModelHD, rockModelHD } from './buildings.js';
import { buildTerrainHD } from './terrain.js';
import { carModel, lampModel, containerModel } from './props.js';
import * as city from './city.js';
import { LOCATIONS } from '../content/locations.js';
import { START_MAP } from '../core/map.js';

export const BOARD = {
  block: 26,          // UI-13: distance between block centres (world)
  street: 13,         // streets run on the block edges (±13 around the colony)
  radius: 46,         // stage-1 slab half size (world units)
  locationRadius: 27,
  colonyRadius: 9,    // palisade radius (world units)
  ringRoad: 12.5,
  buildingScale: 0.6, // world units per building voxel
};
const FILLER_MODELS = { parking: city.parkingLot, containers: city.containerYard, plaza: city.plaza, park: city.park, ruins: city.ruins, rail: city.railYard };
// The six starting places keep their old fronts; new ones face a street (+z / +x first: the sides the camera sees).
const START_FRONT = { police: 'z', grocery: 'z', school: 'z', hospital: 'x', library: 'x', gas: 'x' };

const parse = (k) => k.split(',').map(Number);
/** World position of a street corner (cx,cz = top-left corner of block cx,cz). */
const cornerPos = (cx, cz) => [(cx - 0.5) * BOARD.block, (cz - 0.5) * BOARD.block];

// MAP-1b: a block is 3×3 chunks inside its sidewalks; a place takes 1–4 of them at the street side, the rest
// hold small buildings and props. Chunk size = (block − 2 × sidewalk) / 3.
export const CHUNK = (BOARD.block - 2 * 3.4) / 3;
const EDGE = 1.5 * CHUNK; // from the block centre to the inner edge of the sidewalk
// Chunks a place covers: [wide, deep] (default 2×2); narrow, tall buildings take one column.
const FOOT = { church: [1, 2], apartment: [1, 2] };

/** Where a place sits in its block: front direction, footprint (in chunks), centre and the chunks it covers. */
export function placePlan(id, type, bx, bz, roads) {
  const c = new THREE.Vector3(bx * BOARD.block, 0, bz * BOARD.block);
  const fronts = { z: `${bx},${bz + 1},h`, x: `${bx + 1},${bz},v`, '-z': `${bx},${bz},h`, '-x': `${bx},${bz},v` };
  const pick = START_FRONT[id] ?? ['z', 'x', '-z', '-x'].find((f) => roads.has(fronts[f])) ?? 'z';
  const toFront = { z: [0, 1], x: [1, 0], '-z': [0, -1], '-x': [-1, 0] }[pick];
  const fwd = new THREE.Vector3(toFront[0], 0, toFront[1]);
  const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
  let [fw, fd] = FOOT[type] ?? [2, 2];
  if (/-\d+$/.test(id) && fw === 2 && hash3(bx, 41, bz) < 0.35) fd = 1; // some repeats are a smaller branch
  const col = Math.floor(hash3(bx, 43, bz) * (4 - fw)); // first lateral column (0..2)
  const lat = (col + fw / 2 - 1.5) * CHUNK;
  const fwdC = EDGE - fd * CHUNK / 2;
  const covered = [];
  for (let i = 0; i < fd; i++) for (let j = col; j < col + fw; j++) covered.push(`${i},${j}`); // i: row from the front
  const at = (forward, lateral) => c.clone().addScaledVector(fwd, forward).addScaledVector(side, lateral);
  return { c, fwd, side, fw, fd, lat, center: at(fwdC, lat), covered, at };
}

/** World centre of chunk (row i from the front, column j) of a block. */
export const chunkCenter = (plan, i, j) => plan.at((1 - i) * CHUNK, (j - 1) * CHUNK);

function placeLayout(id, type, bx, bz, roads) {
  const plan = placePlan(id, type, bx, bz, roads);
  const { at, lat } = plan;
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
export function computeLayout(map = START_MAP, into = {}) {
  const roads = new Set(map.roads);
  for (const [k, b] of Object.entries(map.blocks)) {
    if (b.kind !== 'place' || into[b.placeId]) continue;
    into[b.placeId] = placeLayout(b.placeId, b.type ?? b.placeId, ...parse(k), roads);
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
  for (const g of layout.colony.gates) out.push([g.clone(), g.clone().normalize().multiplyScalar(BOARD.street), 'gate']);
  return out;
}

// ---------------------------------------------------------------- decorations

function instanced(model, scale, transforms, { castShadow = true, cacheKey = null, jitter = 0.05 } = {}) {
  const { lit, glow } = model.buildGeometries({ size: scale, cacheKey, jitter });
  const group = new THREE.Group();
  for (const [geo, mat] of [[lit, MATERIALS.lit], [glow, MATERIALS.glow]]) {
    if (!geo) continue;
    const im = new THREE.InstancedMesh(geo, mat, transforms.length);
    transforms.forEach((t, i) => im.setMatrixAt(i, t));
    im.castShadow = castShadow && mat === MATERIALS.lit;
    im.receiveShadow = true;
    group.add(im);
  }
  return group;
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

export function createBoard() {
  const root = new THREE.Group();
  root.name = 'board';
  const layout = computeLayout(START_MAP);
  // HD models are authored at 2× resolution, so each voxel is half the size.
  const bScale = BOARD.buildingScale / 2;
  const B = BOARD.block; const half = B / 2;
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
  const cellOf = (x, z) => `${Math.round(x / B)},${Math.round(z / B)}`;
  const has = (bx, bz) => !!map?.blocks[`${bx},${bz}`];

  /** Distance from a point to the slab rim: Chebyshev distance to the nearest missing neighbour block. */
  const edgeDist = (bx, bz) => {
    const gaps = [];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if ((dx || dz) && !has(bx + dx, bz + dz)) gaps.push([bx + dx, bz + dz]);
    return (x, z) => {
      let d = Infinity;
      for (const [gx, gz] of gaps) {
        const ex = Math.max(0, Math.abs(x - gx * B) - half); const ez = Math.max(0, Math.abs(z - gz * B) - half);
        d = Math.min(d, Math.max(ex, ez));
      }
      return d;
    };
  };
  const terrainFor = (key) => {
    const [bx, bz] = parse(key);
    const cx = bx * B; const cz = bz * B;
    const near = streets.filter(([a, b]) => Math.min(a.x, b.x) < cx + half + 4 && Math.max(a.x, b.x) > cx - half - 4 && Math.min(a.z, b.z) < cz + half + 4 && Math.max(a.z, b.z) > cz - half - 4);
    const plots = Object.values(layout).filter((L) => { const p = L.plan?.c ?? L.center; return Math.abs(p.x - cx) <= B && Math.abs(p.z - cz) <= B; });
    const geo = buildTerrainHD({
      center: [cx, cz], half, edgeDist: edgeDist(bx, bz),
      clip: (x, z) => cellOf(x, z) === key,
      distRoad: (x, z) => { let d = Infinity; for (const [a, b] of near) d = Math.min(d, distToSegment(x, z, a, b)); return d; },
      distPlot: (x, z) => {
        let d = Infinity;
        // A place's whole block is built up (flat); the colony keeps its round clearing.
        for (const L of plots) d = Math.min(d, L.plan ? Math.max(Math.abs(x - L.plan.c.x), Math.abs(z - L.plan.c.z)) - EDGE : Math.hypot(x, z) - (BOARD.colonyRadius + 2));
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
    const terrain = terrainFor(key);
    g.add(terrain);
    let model = null;
    if (b.kind === 'colony') {
      model = colonyHD(BOARD.colonyRadius * 2).build({ size: bScale, jitter });
      model.name = 'colony';
      locationGroups.colony = model;
    } else if (b.kind === 'place') {
      const L = layout[b.placeId];
      const type = b.type ?? b.placeId;
      model = (LOCATION_BUILDERS_HD[type] ?? LOCATION_BUILDERS_HD.grocery)().build({ size: bScale, jitter, cacheKey: `place-${type}` });
      // Fit the building into its chunks (models are centred on x/z, front = +z).
      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
      model.scale.setScalar(Math.min(1, (L.plan.fw * CHUNK - 0.3) / size.x, (L.plan.fd * CHUNK - 0.3) / size.z));
      model.position.copy(L.center);
      model.rotation.y = L.facing;
      model.name = b.placeId;
      locationGroups[b.placeId] = model;
      addPick(L);
    } else if (FILLER_MODELS[b.kind]) {
      model = FILLER_MODELS[b.kind]().build({ size: bScale, jitter, cacheKey: `filler-${b.kind}` });
      model.position.set(bx * B, 0, bz * B);
      model.rotation.y = Math.floor(hash3(bx, 7, bz) * 2) * Math.PI;
    }
    if (model) { g.add(model); trackGlow(model); }
    root.add(g);
    return { group: g, terrain, k: 0, target: 1, delay: 0 };
  }

  /** Instanced trees, rocks, cars and lamps for a set of new blocks and streets: one group per growth. */
  function buildProps(keys, newStreets) {
    const group = new THREE.Group(); group.name = 'props';
    const trees = [[], [], []]; const rocks = [[], [], []]; const cars = [[], [], []]; const lamps = []; const yards = [[], [], []];
    const free = (x, z, b) => {
      for (const [a, c] of streets) if (distToSegment(x, z, a, c) < 3.6) return false;
      if (b.kind === 'colony') return Math.hypot(x, z) > BOARD.colonyRadius + 3;
      return Math.max(Math.abs(x - Math.round(x / B) * B), Math.abs(z - Math.round(z / B) * B)) > (b.kind === 'place' ? 9.5 : 9);
    };
    const houses = Array.from({ length: city.SMALL_VARIANTS }, () => []);
    const put = (list, p, rotY, scale = 1) => { tmp.position.copy(p); tmp.rotation.set(0, rotY, 0); tmp.scale.setScalar(scale); tmp.updateMatrix(); list.push(tmp.matrix.clone()); };
    for (const key of keys) {
      const b = map.blocks[key];
      const [bx, bz] = parse(key);
      if (b.kind === 'place') {
        // MAP-1b: the chunks the place leaves free hold small buildings, trees, parked cars or a container stack.
        const plan = layout[b.placeId].plan;
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
          if (plan.covered.includes(`${i},${j}`)) continue;
          const p = chunkCenter(plan, i, j);
          const r = hash3(bx * 3 + j, 61 + i, bz * 3 + i);
          const r2 = hash3(bx * 5 + i, 67, bz * 5 + j);
          // Front-row buildings face the street; others any way.
          const face = i === 0 ? Math.atan2(plan.fwd.x, plan.fwd.z) : Math.floor(r2 * 4) * (Math.PI / 2);
          if (r < 0.58) put(houses[Math.floor(r2 * city.SMALL_VARIANTS)], p, face, city.SMALL_SCALE);
          else if (r < 0.78) {
            for (let k = 0; k < 3; k++) {
              const q = p.clone().add(new THREE.Vector3((hash3(k, bx, j) - 0.5) * 4, 0, (hash3(k, bz, i) - 0.5) * 4));
              put(trees[Math.floor(hash3(k, i, j) * 3)], q, k, 0.7 + hash3(j, k, i) * 0.5);
            }
          } else if (r < 0.9) put(cars[Math.floor(r2 * 3)], p.clone().addScaledVector(plan.side, -1.2), face + Math.PI / 2);
          else put(yards[Math.floor(r2 * 3)], p, face);
        }
        continue;
      }
      const spots = [];
      for (let i = 0; i < 40 && spots.length < 7; i++) {
        const x = bx * B + (hash3(i, bx * 7 + 3, bz * 13 + 11) * 2 - 1) * (half - 2);
        const z = bz * B + (hash3(i, bx * 7 + 5, bz * 13 + 17) * 2 - 1) * (half - 2);
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
        tmp.position.copy(at(0.3 + h(3) * 0.4, (h(4) < 0.5 ? -1 : 1) * 1.3));
        tmp.rotation.set(0, Math.atan2(dir.x, dir.z) - Math.PI / 2 + (h(5) - 0.5) * 0.6, 0); tmp.scale.setScalar(1); tmp.updateMatrix();
        cars[Math.floor(h(6) * 3)].push(tmp.matrix.clone());
      }
      if (len > 8 && h(7) < 0.75) {
        tmp.position.copy(at(0.5, 3.1)); tmp.rotation.set(0, Math.atan2(side.x, side.z) - Math.PI / 2, 0); tmp.scale.setScalar(1); tmp.updateMatrix();
        lamps.push(tmp.matrix.clone());
      }
    });
    trees.forEach((list, k) => { if (list.length) group.add(instanced(treeModelHD(k, 1), 0.25, list, { cacheKey: `tree-${k}`, jitter: 0 })); });
    houses.forEach((list, v) => { if (list.length) group.add(instanced(city.smallBuilding(v), BOARD.buildingScale / 2, list, { cacheKey: `small-${v}`, jitter: 0 })); });
    rocks.forEach((list, k) => { if (list.length) group.add(instanced(rockModelHD(k), 0.25, list, { cacheKey: `rock-${k}`, jitter: 0 })); });
    cars.forEach((list, v) => { if (list.length) group.add(instanced(carModel(v), 0.15, list, { cacheKey: `car-${v}`, jitter: 0 })); });
    if (lamps.length) group.add(instanced(lampModel(), 0.15, lamps, { cacheKey: 'lamp', jitter: 0, castShadow: false }));
    yards.forEach((list, k) => { if (list.length) group.add(instanced(containerModel(k, 1 + (k % 2)), 0.2, list, { cacheKey: `container-${k}`, jitter: 0 })); });
    root.add(group);
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
  for (const id of Object.keys(START_FRONT)) {
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
    /** MAP-1: draw the game's map. New blocks rise into place (staggered outward); the first call snaps.
     *  Calls onBounds with the city's outline. */
    setMap(next, { snap = false } = {}) {
      // A different city (new game, loaded save): start over.
      if (Object.entries(cells).some(([k, c]) => c.sig !== JSON.stringify(next.blocks[k] ?? null))) {
        for (const c of [...Object.values(cells), ...batches]) { root.remove(c.group); }
        for (const k of Object.keys(cells)) delete cells[k];
        batches.length = 0;
        for (const h of pickTargets.splice(0)) root.remove(h);
        for (const [id, r] of Object.entries(rings)) { root.remove(r); delete rings[id]; }
        for (const id of Object.keys(layout)) if (id !== 'colony') delete layout[id];
        for (const id of Object.keys(locationGroups)) delete locationGroups[id];
        glowMats.length = 0;
        map = null;
        snap = true;
      }
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
        c.group.remove(c.terrain); c.terrain.geometry.dispose();
        c.terrain = terrainFor(k); c.group.add(c.terrain);
      }
      fresh.sort((a, b) => Math.hypot(...parse(a)) - Math.hypot(...parse(b)));
      fresh.forEach((k, i) => {
        cells[k] = buildBlock(k, map.blocks[k]);
        cells[k].sig = JSON.stringify(map.blocks[k]);
        cells[k].delay = snap ? 0 : i * 0.06; // seconds
      });
      if (fresh.length) {
        const batch = buildProps(fresh, newStreets);
        batch.delay = snap ? 0 : fresh.length * 0.06;
        batches.push(batch);
      }
      for (const c of [...Object.values(cells), ...batches]) if (snap) { c.k = c.target; c.delay = 0; show(c); } else show(c);
      const xs = Object.keys(map.blocks).map((k) => parse(k)[0]); const zs = Object.keys(map.blocks).map((k) => parse(k)[1]);
      const bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs), block: B, snap };
      shadow.scale.set((bounds.maxX - bounds.minX + 2.4) * B, (bounds.maxZ - bounds.minZ + 2.4) * B, 1);
      shadow.position.set((bounds.minX + bounds.maxX) / 2 * B + 4, -16, (bounds.minZ + bounds.maxZ) / 2 * B + 6);
      api.onBounds?.(bounds);
    },
    update(t) {
      const dt = Math.min(0.1, Math.max(0, t - (lastT ?? t))); lastT = t;
      for (const c of [...Object.values(cells), ...batches]) {
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
