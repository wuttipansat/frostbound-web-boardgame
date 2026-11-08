// The diorama board: snowy plateau, roads, colony at the centre, six locations around it,
// survivor/zombie slot markers, instanced pines and rocks, and pick targets for each location.
import * as THREE from 'three';
import { VoxelModel, hash3, MATERIALS } from './voxel.js';
import { P } from './palette.js';
import {
  LOCATION_BUILDERS, LOCATION_BUILDERS_HD, colony, colonyHD, pineTree, rock, treeModelHD, rockModelHD,
} from './buildings.js';
import { buildTerrainHD } from './terrain.js';
import { LOCATIONS } from '../content/locations.js';
import { OUTSIDE_LOCATIONS } from '../core/constants.js';

export const BOARD = {
  radius: 46,         // plateau radius (world units)
  locationRadius: 27, // distance of location centres from the colony
  colonyRadius: 9,    // palisade radius (world units)
  ringRoad: 12.5,
  buildingScale: 0.6, // world units per building voxel
};

/** Board-space layout for every location (positions, facing, slot anchors). */
export function computeLayout() {
  const layout = {};
  OUTSIDE_LOCATIONS.forEach((id, i) => {
    const theta = (-90 + 60 * i + 30) * (Math.PI / 180);
    const c = new THREE.Vector3(Math.cos(theta) * BOARD.locationRadius, 0, Math.sin(theta) * BOARD.locationRadius);
    const toColony = c.clone().negate().normalize();
    const side = new THREE.Vector3(-toColony.z, 0, toColony.x);
    const at = (forward, lateral) => c.clone().addScaledVector(toColony, forward).addScaledVector(side, lateral);
    const nSurv = LOCATIONS[id].survivorSlots;
    layout[id] = {
      id,
      theta,
      center: c,
      facing: Math.atan2(toColony.x, toColony.z),
      label: at(-1, 0).setY(10),
      // Zombies crowd the entrance; survivors stand on pads on the road side.
      zombieSlots: [-1.6, 0, 1.6].map((l) => at(8, l)),
      survivorSlots: Array.from({ length: nSurv }, (_, k) => at(11, (k - (nSurv - 1) / 2) * 2.1)),
      hitRadius: 8.5,
    };
  });
  // Colony: 4 gates (N/E/S/W) with 3 zombie slots each, a ring of survivor spots by the fire.
  const gateDirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  layout.colony = {
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
  return layout;
}

// ---------------------------------------------------------------- terrain

function distToSegment(px, pz, a, b) {
  const abx = b.x - a.x; const abz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((px - a.x) * abx + (pz - a.z) * abz) / (abx * abx + abz * abz)));
  return Math.hypot(px - (a.x + abx * t), pz - (a.z + abz * t));
}

function computeRoads(layout) {
  const roads = [];
  for (const id of OUTSIDE_LOCATIONS) {
    const L = layout[id];
    const dir = L.center.clone().normalize();
    roads.push([dir.clone().multiplyScalar(BOARD.ringRoad), L.center.clone().addScaledVector(dir, -5)]);
  }
  for (const g of layout.colony.gates) roads.push([g.clone(), g.clone().normalize().multiplyScalar(BOARD.ringRoad)]);
  return roads;
}

function distances(layout, roads) {
  const tmp = new THREE.Vector3();
  return {
    distRoad: (x, z) => {
      let d = Math.abs(Math.hypot(x, z) - BOARD.ringRoad);
      for (const [a, b] of roads) d = Math.min(d, distToSegment(x, z, a, b));
      return d;
    },
    distPlot: (x, z) => {
      let d = Math.hypot(x, z) - (BOARD.colonyRadius + 2);
      for (const id of OUTSIDE_LOCATIONS) d = Math.min(d, layout[id].center.distanceTo(tmp.set(x, 0, z)) - 9);
      return d;
    },
  };
}

function buildTerrain(layout, roads) {
  const m = new VoxelModel();
  const R = BOARD.radius;

  for (let x = -R; x <= R; x++) {
    for (let z = -R; z <= R; z++) {
      const r = Math.hypot(x + 0.5, z + 0.5);
      // Slightly ragged diorama edge
      const edge = R - 1.5 + hash3(x, 7, z) * 2;
      if (r > edge) continue;
      const cx = x + 0.5; const cz = z + 0.5;
      const ringD = Math.abs(r - BOARD.ringRoad);
      let roadD = ringD;
      for (const [a, b] of roads) roadD = Math.min(roadD, distToSegment(cx, cz, a, b));
      let plotD = r - (BOARD.colonyRadius + 2);
      for (const id of OUTSIDE_LOCATIONS) plotD = Math.min(plotD, layout[id].center.distanceTo(new THREE.Vector3(cx, 0, cz)) - 9);

      // Gentle drifts away from roads and plots.
      const n = Math.sin(cx * 0.21) * Math.cos(cz * 0.17) + Math.sin((cx + cz) * 0.09) * 0.8 + hash3(x, 1, z) * 0.35;
      const flat = Math.min(roadD - 1.5, plotD);
      let h = flat > 2 ? Math.max(0, Math.floor(n + 0.4)) : 0;
      if (r > R - 6) h = Math.max(h, Math.floor(hash3(x, 3, z) * 2)); // snowbanks near the rim
      const isRoad = roadD < 1.9;
      const top = isRoad ? (roadD > 1.2 ? P.roadEdge : (hash3(x, 2, z) > 0.7 ? P.roadDark : P.road))
        : (hash3(x, 4, z) > 0.8 ? P.snowShade : (hash3(x, 5, z) > 0.93 ? P.snowBlue : P.snow));
      // Strata visible at the diorama edge.
      for (let y = -6; y < h; y++) {
        let c;
        if (y === h - 1) c = top;
        else if (y >= -2) c = P.snowShade;
        else if (y === -3) c = P.dirt;
        else c = hash3(x, y, z) > 0.5 ? P.rock : P.rockLight;
        m.set(x, y, z, c);
      }
    }
  }
  const { lit } = m.buildGeometries({ size: 1, origin: 'none', jitter: 0.025, greedy: false });
  const mesh = new THREE.Mesh(lit, MATERIALS.lit);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

/** Is a spot clear of roads, plots and the colony (for trees and rocks)? */
function isFreeForDecoration(x, z, layout, roads) {
  const r = Math.hypot(x, z);
  if (r > BOARD.radius - 3 || r < BOARD.ringRoad + 3) return false;
  for (const id of OUTSIDE_LOCATIONS) if (layout[id].center.distanceTo(new THREE.Vector3(x, 0, z)) < 13) return false;
  for (const [a, b] of roads) if (distToSegment(x, z, a, b) < 3.5) return false;
  return true;
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

function scatter(layout, roads, count, seed, minGap = 2.4) {
  const pts = [];
  let i = 0;
  while (pts.length < count && i < count * 40) {
    i++;
    const a = hash3(i, seed, 11) * Math.PI * 2;
    const r = BOARD.ringRoad + 3 + Math.sqrt(hash3(i, seed, 13)) * (BOARD.radius - BOARD.ringRoad - 6);
    const x = Math.cos(a) * r; const z = Math.sin(a) * r;
    if (!isFreeForDecoration(x, z, layout, roads)) continue;
    if (pts.some((p) => Math.hypot(p.x - x, p.z - z) < minGap)) continue;
    pts.push({ x, z, r: hash3(i, seed, 17), s: hash3(i, seed, 19) });
  }
  return pts;
}

function slotMarker(color, rim) {
  const m = new VoxelModel();
  m.box(-1, 0, -1, 3, 1, 3, (x, _y, z) => (x === 0 && z === 0 ? color : rim));
  return m;
}

/** HD slot markers: a bevelled 6×6 plate with a carved emblem (snowflake for survivors, claw marks for zombies). */
function slotMarkerHD(kind) {
  const m = new VoxelModel();
  const survivor = kind === 'survivor';
  const rim = survivor ? 0x7f97b8 : P.dangerDark;
  const fill = survivor ? 0xd8e6f5 : P.danger;
  m.box(0, 0, 0, 6, 1, 6, (x, _y, z) => {
    const corner = (x === 0 || x === 5) && (z === 0 || z === 5);
    if (corner) return null;
    return x === 0 || x === 5 || z === 0 || z === 5 ? rim : fill;
  });
  const emblem = survivor
    ? [[2, 1], [3, 1], [1, 2], [4, 2], [1, 3], [4, 3], [2, 4], [3, 4], [2, 2], [3, 3]]
    : [[1, 1], [2, 2], [3, 3], [2, 1], [3, 2], [4, 3], [3, 1], [4, 2]];
  for (const [x, z] of emblem) m.set(x, 0, z, survivor ? 0x9fc4e6 : 0x3a1010);
  return m;
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

export function createBoard({ quality = { hd: false } } = {}) {
  const hd = !!quality.hd;
  const root = new THREE.Group();
  root.name = 'board';
  const layout = computeLayout();
  const roads = computeRoads(layout);
  // HD models are authored at 2× resolution, so each voxel is half the size.
  const bScale = hd ? BOARD.buildingScale / 2 : BOARD.buildingScale;

  let terrain;
  if (hd) {
    terrain = new THREE.Mesh(buildTerrainHD({ radius: BOARD.radius, ...distances(layout, roads) }), MATERIALS.lit);
    terrain.receiveShadow = true;
    terrain.name = 'terrain';
  } else {
    terrain = buildTerrain(layout, roads);
  }
  root.add(terrain);

  // Colony
  // HD models carry their texture in material patterns, so skip the extra per-voxel jitter: it would stop
  // neighbouring faces from merging and multiply the triangle count.
  const jitter = hd ? 0 : 0.05;
  const colonyGroup = (hd ? colonyHD(BOARD.colonyRadius * 2) : colony(BOARD.colonyRadius * 2)).build({ size: bScale, jitter });
  colonyGroup.position.y = 0;
  colonyGroup.name = 'colony';
  root.add(colonyGroup);

  // Locations
  const locationGroups = {};
  for (const id of OUTSIDE_LOCATIONS) {
    const L = layout[id];
    const g = (hd ? LOCATION_BUILDERS_HD : LOCATION_BUILDERS)[id]().build({ size: bScale, jitter });
    g.position.copy(L.center);
    g.rotation.y = L.facing;
    g.name = id;
    root.add(g);
    locationGroups[id] = g;
  }
  locationGroups.colony = colonyGroup;

  // Slot markers (instanced): pale pads for survivors, blood-red tiles for zombies.
  const survivorTransforms = [];
  const zombieTransforms = [];
  const tmp = new THREE.Object3D();
  for (const L of Object.values(layout)) {
    for (const p of L.survivorSlots) { tmp.position.set(p.x, 0.01, p.z); tmp.rotation.y = L.facing; tmp.updateMatrix(); survivorTransforms.push(tmp.matrix.clone()); }
    for (const p of L.zombieSlots) { tmp.position.set(p.x, 0.01, p.z); tmp.rotation.y = L.facing; tmp.updateMatrix(); zombieTransforms.push(tmp.matrix.clone()); }
  }
  if (hd) {
    root.add(instanced(slotMarkerHD('survivor'), 0.225, survivorTransforms, { castShadow: false, jitter: 0 }));
    root.add(instanced(slotMarkerHD('zombie'), 0.225, zombieTransforms, { castShadow: false, jitter: 0 }));
  } else {
    root.add(instanced(slotMarker(0xd8e6f5, 0x7f97b8), 0.45, survivorTransforms, { castShadow: false }));
    root.add(instanced(slotMarker(P.danger, P.dangerDark), 0.45, zombieTransforms, { castShadow: false }));
  }

  // Forest + rocks (instanced)
  const trees = scatter(layout, roads, 90, 3);
  // Low: 3 sizes of the classic pine. HD: 3 silhouettes, one instanced mesh each, size varied by scale
  // (fewer draw calls than one mesh per shape × size).
  const groups = hd ? 3 : 3;
  const bucket = Array.from({ length: groups }, () => []);
  for (const t of trees) {
    tmp.position.set(t.x, 0, t.z);
    tmp.rotation.y = Math.floor(t.r * 4) * (Math.PI / 2);
    tmp.scale.setScalar(hd ? 0.75 + t.s * 0.6 : 0.85 + t.s * 0.35);
    tmp.updateMatrix();
    const g = hd ? Math.floor(hash3(Math.round(t.x * 10), 5, Math.round(t.z * 10)) * 3) : Math.floor(t.s * 3);
    bucket[g].push(tmp.matrix.clone());
  }
  bucket.forEach((list, i) => {
    if (!list.length) return;
    root.add(hd
      ? instanced(treeModelHD(i, 1), 0.25, list, { cacheKey: `tree-${i}`, jitter: 0 })
      : instanced(pineTree(i), 0.5, list));
  });
  const rockSpots = scatter(layout, roads, 30, 9, 3);
  const rockBuckets = Array.from({ length: hd ? 3 : 1 }, () => []);
  rockSpots.forEach((t, i) => {
    tmp.position.set(t.x, 0, t.z); tmp.rotation.y = t.r * Math.PI * 2; tmp.scale.setScalar(0.8 + t.s); tmp.updateMatrix();
    rockBuckets[i % rockBuckets.length].push(tmp.matrix.clone());
  });
  rockBuckets.forEach((list, shape) => root.add(hd ? instanced(rockModelHD(shape), 0.25, list, { cacheKey: `rock-${shape}`, jitter: 0 }) : instanced(rock(), 0.5, list)));

  // Pick targets (invisible cylinders) and hover rings.
  const pickTargets = [];
  const rings = {};
  const halo = haloTexture();
  for (const L of Object.values(layout)) {
    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(L.hitRadius, L.hitRadius, 10, 16),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
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

  // Warm light sources: campfire + a lamp at each location door.
  const lights = [];
  // HD: a gentler light set higher up, so survivors around the fire stay readable instead of blowing out.
  const fireBase = hd ? 85 : 220;
  const fire = new THREE.PointLight(0xff8a3c, fireBase, 32, hd ? 1.2 : 1.5);
  fire.position.set(0, hd ? 4.5 : 3, 0);
  root.add(fire);
  lights.push({ light: fire, base: fireBase, flicker: 0.25 });
  for (const id of OUTSIDE_LOCATIONS) {
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

  // Each building gets its own glow material so windows can breathe independently.
  const glowMats = [];
  for (const g of Object.values(locationGroups)) {
    g.traverse((o) => {
      if (o.isMesh && o.material === MATERIALS.glow) {
        o.material = MATERIALS.glow.clone();
        glowMats.push({ mat: o.material, base: MATERIALS.glow.color.r, phase: Math.random() * 10 });
      }
    });
  }

  let hovered = null;
  let selected = null;

  return {
    root,
    layout,
    fx,
    pickTargets,
    locationGroups,
    setHovered(id) { hovered = id; },
    setSelected(id) { selected = id; },
    update(t) {
      // Flame: flicker in height and sway.
      flameMesh.scale.set(1 + Math.sin(t * 17) * 0.06, 1 + Math.sin(t * 11.3) * 0.18 + Math.sin(t * 23) * 0.08, 1 + Math.cos(t * 15) * 0.06);
      flameMesh.rotation.y = Math.sin(t * 2.1) * 0.4;
      // Windows: a slow breathing glow, with the odd quick flicker.
      for (const g of glowMats) {
        const flick = Math.sin(t * 0.7 + g.phase) > 0.985 ? 0.55 : 1;
        g.mat.color.setScalar(g.base * (0.92 + Math.sin(t * 1.3 + g.phase) * 0.08) * flick);
      }
      for (const [i, l] of lights.entries()) {
        const f = Math.sin(t * 13 + i * 3) * 0.5 + Math.sin(t * 7.3 + i) * 0.5;
        l.light.intensity = l.base * (1 + f * l.flicker);
      }
      for (const [id, ring] of Object.entries(rings)) {
        const target = id === selected ? 0.9 : id === hovered ? 0.5 : 0;
        ring.material.opacity += (target - ring.material.opacity) * 0.2;
        ring.material.color.setHex(id === selected ? 0xffc46b : 0xbfdcff);
        const s = 1 + (id === selected ? Math.sin(t * 3) * 0.03 : 0);
        ring.scale.setScalar(s);
      }
    },
  };
}
