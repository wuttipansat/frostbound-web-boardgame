// The diorama board: snowy plateau, roads, colony at the centre, six locations around it,
// survivor/zombie slot markers, instanced pines and rocks, and pick targets for each location.
import * as THREE from 'three';
import { VoxelModel, hash3, MATERIALS } from './voxel.js';
import { P } from './palette.js';
import { LOCATION_BUILDERS, colony, pineTree, rock } from './buildings.js';
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

function buildTerrain(layout) {
  const m = new VoxelModel();
  const R = BOARD.radius;
  const roads = [];
  for (const id of OUTSIDE_LOCATIONS) {
    const L = layout[id];
    const dir = L.center.clone().normalize();
    roads.push([dir.clone().multiplyScalar(BOARD.ringRoad), L.center.clone().addScaledVector(dir, -5)]);
  }
  for (const g of layout.colony.gates) roads.push([g.clone(), g.clone().normalize().multiplyScalar(BOARD.ringRoad)]);

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
  const { lit } = m.buildGeometries({ size: 1, origin: 'none', jitter: 0.025 });
  const mesh = new THREE.Mesh(lit, MATERIALS.lit);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return { mesh, roads };
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

function instanced(model, scale, transforms, { castShadow = true } = {}) {
  const { lit, glow } = model.buildGeometries({ size: scale });
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

// ---------------------------------------------------------------- public API

export function createBoard() {
  const root = new THREE.Group();
  root.name = 'board';
  const layout = computeLayout();

  const { mesh: terrain, roads } = buildTerrain(layout);
  root.add(terrain);

  // Colony
  const colonyGroup = colony(BOARD.colonyRadius * 2).build({ size: BOARD.buildingScale });
  colonyGroup.position.y = 0;
  colonyGroup.name = 'colony';
  root.add(colonyGroup);

  // Locations
  const locationGroups = {};
  for (const id of OUTSIDE_LOCATIONS) {
    const L = layout[id];
    const g = LOCATION_BUILDERS[id]().build({ size: BOARD.buildingScale });
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
  root.add(instanced(slotMarker(0xd8e6f5, 0x7f97b8), 0.45, survivorTransforms, { castShadow: false }));
  root.add(instanced(slotMarker(P.danger, P.dangerDark), 0.45, zombieTransforms, { castShadow: false }));

  // Forest + rocks (instanced)
  const trees = scatter(layout, roads, 90, 3);
  const bySize = [[], [], []];
  for (const t of trees) {
    tmp.position.set(t.x, 0, t.z);
    tmp.rotation.y = Math.floor(t.r * 4) * (Math.PI / 2);
    tmp.scale.setScalar(0.85 + t.s * 0.35);
    tmp.updateMatrix();
    bySize[Math.floor(t.s * 3)].push(tmp.matrix.clone());
  }
  bySize.forEach((list, size) => { if (list.length) root.add(instanced(pineTree(size), 0.5, list)); });
  const rocks = scatter(layout, roads, 30, 9, 3).map((t) => {
    tmp.position.set(t.x, 0, t.z); tmp.rotation.y = t.r * Math.PI * 2; tmp.scale.setScalar(0.8 + t.s); tmp.updateMatrix();
    return tmp.matrix.clone();
  });
  root.add(instanced(rock(), 0.5, rocks));

  // Pick targets (invisible cylinders) and hover rings.
  const pickTargets = [];
  const rings = {};
  for (const L of Object.values(layout)) {
    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(L.hitRadius, L.hitRadius, 10, 16),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.position.set(L.center.x, 5, L.center.z);
    hit.userData.locationId = L.id;
    root.add(hit);
    pickTargets.push(hit);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(L.hitRadius + 0.6, L.hitRadius + 1.4, 48),
      new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(L.center.x, 0.06, L.center.z);
    root.add(ring);
    rings[L.id] = ring;
  }

  // Warm light sources: campfire + a lamp at each location door.
  const lights = [];
  const fire = new THREE.PointLight(0xff8a3c, 220, 32, 1.5);
  fire.position.set(0, 3, 0);
  root.add(fire);
  lights.push({ light: fire, base: 220, flicker: 0.25 });
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
      for (const [i, l] of lights.entries()) {
        const f = Math.sin(t * 13 + i * 3) * 0.5 + Math.sin(t * 7.3 + i) * 0.5;
        l.light.intensity = l.base * (1 + f * l.flicker);
      }
      for (const [id, ring] of Object.entries(rings)) {
        const target = id === selected ? 0.85 : id === hovered ? 0.5 : 0;
        ring.material.opacity += (target - ring.material.opacity) * 0.2;
        ring.material.color.setHex(id === selected ? 0xffc46b : 0xbfdcff);
        const s = 1 + (id === selected ? Math.sin(t * 3) * 0.02 : 0);
        ring.scale.setScalar(s);
      }
    },
  };
}
