// PieceManager: keeps 3D survivors, zombies and barricades in sync with GameState and animates changes.
//   survivors -> individual meshes (<= 20), hop between slots along a path, pop in, topple when they die
//   zombies   -> InstancedMesh pools (3 variants), rise from the snow, shuffle idly, topple and sink when killed
//   barricades-> InstancedMesh pool, pop in / break apart
import * as THREE from 'three';
import { MATERIALS } from './voxel.js';
import { survivorModel, zombieModel, barricadeModel } from './characters.js';
import { ease } from './tween.js';
import { SURVIVORS_BY_ID } from '../content/survivors.js';
import { LOCATIONS } from '../content/locations.js';
import { LOCATION_IDS } from '../core/constants.js';

export const CHAR_VOXEL = 0.15; // world size of a character voxel (8 voxels = 1.2 units wide, ~2.4 tall)
export const PLAYER_COLORS = [0xf2b33d, 0x4fa3e0, 0xe0605a, 0x7fcf6a, 0xc58ae8];

// ---------------------------------------------------------------- pure helpers (unit-tested)

/**
 * Stable slot assignment: survivors that stay keep their slot; newcomers take the lowest free slot.
 * @param {Map<string, number>} prev  previous id -> slot (for this location only)
 * @param {string[]} ids              survivors now at the location
 * @returns {Map<string, number>}
 */
export function assignSlots(prev, ids) {
  const out = new Map();
  const taken = new Set();
  for (const id of ids) {
    const s = prev.get(id);
    if (s != null && !taken.has(s)) { out.set(id, s); taken.add(s); }
  }
  let next = 0;
  for (const id of ids) {
    if (out.has(id)) continue;
    while (taken.has(next)) next++;
    out.set(id, next); taken.add(next);
  }
  return out;
}

/** Zombie fill order: the colony spreads zombies round-robin across its 4 gates. */
export function zombieSlotIndex(locationId, i) {
  if (locationId !== 'colony') return i;
  const gates = LOCATIONS.colony.entrances;
  const per = LOCATIONS.colony.zombieSlots / gates;
  return (i % gates) * per + Math.floor(i / gates);
}

/** Barricades fill zombie slots from the far end so they never overlap zombies (z + b <= slots). */
export function barricadeSlotIndex(locationId, j) {
  return zombieSlotIndex(locationId, LOCATIONS[locationId].zombieSlots - 1 - j);
}

// ---------------------------------------------------------------- instanced pool

class Pool {
  constructor(model, size, capacity) {
    const { lit, glow } = model.buildGeometries({ size });
    this.group = new THREE.Group();
    this.meshes = [];
    for (const [geo, mat] of [[lit, MATERIALS.lit], [glow, MATERIALS.glow]]) {
      if (!geo) continue;
      const im = new THREE.InstancedMesh(geo, mat, capacity);
      im.count = 0;
      im.castShadow = mat === MATERIALS.lit;
      im.receiveShadow = true;
      im.frustumCulled = false;
      this.group.add(im);
      this.meshes.push(im);
    }
    this.items = [];
    this.tmp = new THREE.Object3D();
  }

  add(item) { this.items.push(item); return item; }

  remove(item) { this.items = this.items.filter((i) => i !== item); }

  write() {
    const o = this.tmp;
    this.items.forEach((it, i) => {
      o.position.set(it.x, it.y, it.z);
      o.rotation.set(it.tiltX ?? 0, it.rotY ?? 0, it.tiltZ ?? 0, 'YXZ');
      o.scale.setScalar(it.scale ?? 1);
      o.updateMatrix();
      for (const im of this.meshes) im.setMatrixAt(i, o.matrix);
    });
    for (const im of this.meshes) { im.count = this.items.length; im.instanceMatrix.needsUpdate = true; }
  }
}

// ---------------------------------------------------------------- snow puffs

class Puffs {
  constructor(capacity = 400) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), new THREE.MeshLambertMaterial(), capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.parts = [];
    this.capacity = capacity;
    this.tmp = new THREE.Object3D();
    this.col = new THREE.Color();
    // instanceColor must exist before the first render.
    this.mesh.setColorAt(0, this.col.setHex(0xffffff));
  }

  burst(pos, n = 14, color = 0xf2f6fc, power = 1) {
    for (let i = 0; i < n && this.parts.length < this.capacity; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (0.8 + Math.random() * 1.6) * power;
      this.parts.push({
        p: new THREE.Vector3(pos.x, pos.y + 0.15, pos.z),
        v: new THREE.Vector3(Math.cos(a) * s, (1.5 + Math.random() * 2.5) * power, Math.sin(a) * s),
        life: 0.6 + Math.random() * 0.5, max: 1.1, color,
      });
    }
  }

  update(dt) {
    const o = this.tmp;
    this.parts = this.parts.filter((q) => (q.life -= dt) > 0);
    this.parts.forEach((q, i) => {
      q.v.y -= 9 * dt;
      q.p.addScaledVector(q.v, dt);
      if (q.p.y < 0.05) { q.p.y = 0.05; q.v.multiplyScalar(0.5); }
      o.position.copy(q.p);
      o.rotation.set(q.life * 5, q.life * 3, 0);
      o.scale.setScalar(Math.min(1, q.life / 0.4));
      o.updateMatrix();
      this.mesh.setMatrixAt(i, o.matrix);
      this.mesh.setColorAt(i, this.col.setHex(q.color));
    });
    this.mesh.count = this.parts.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- manager

export function createPieces(board, tweens) {
  const root = new THREE.Group();
  root.name = 'pieces';
  const { layout } = board;

  const zombiePools = [0, 1, 2].map((v) => new Pool(zombieModel(v), CHAR_VOXEL, 64));
  const barricadePool = new Pool(barricadeModel(), 0.22, 64);
  const puffs = new Puffs();
  for (const p of [...zombiePools, barricadePool]) root.add(p.group);
  root.add(puffs.mesh);

  const geoCache = new Map();
  const discGeo = new THREE.CylinderGeometry(0.78, 0.78, 0.08, 20);
  const discMats = PLAYER_COLORS.map((c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));

  const survivors = new Map(); // id -> visual
  const slots = new Map(LOCATION_IDS.map((id) => [id, new Map()])); // loc -> Map(id -> slot)
  const zombies = new Map(LOCATION_IDS.map((id) => [id, []]));
  const barricades = new Map(LOCATION_IDS.map((id) => [id, []]));
  let pending = 0; // running piece animations

  // Selection ring that follows the highlighted survivor.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.85, 1.12, 28),
    new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.1;
  ring.visible = false;
  let highlighted = null;

  // ---------------- positions

  function survivorSlotPos(locId, k) {
    const L = layout[locId];
    const n = L.survivorSlots.length;
    const p = L.survivorSlots[k % n].clone();
    if (k >= n) {
      const out = p.clone().sub(L.center).setY(0).normalize();
      p.addScaledVector(out, 1.8 * Math.floor(k / n));
    }
    return p;
  }

  const faceToward = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

  function zombieSlotPos(locId, i) {
    const L = layout[locId];
    return L.zombieSlots[zombieSlotIndex(locId, i) % L.zombieSlots.length];
  }

  /** Waypoints for a hop between locations, routed through the nearest colony gate. */
  function route(fromPos, fromLoc, toPos, toLoc) {
    const pts = [fromPos.clone()];
    const gateNear = (p) => layout.colony.gates.reduce((best, g) => (g.distanceTo(p) < best.distanceTo(p) ? g : best));
    if (fromLoc === 'colony' && toLoc !== 'colony') {
      const g = gateNear(toPos);
      pts.push(g.clone().multiplyScalar(0.75), g.clone().multiplyScalar(1.3));
    }
    if (toLoc === 'colony' && fromLoc !== 'colony') {
      const g = gateNear(fromPos);
      pts.push(g.clone().multiplyScalar(1.3), g.clone().multiplyScalar(0.75));
    }
    pts.push(toPos.clone());
    return pts;
  }

  // ---------------- survivors

  function survivorGeometry(id) {
    if (!geoCache.has(id)) geoCache.set(id, survivorModel(SURVIVORS_BY_ID[id]).buildGeometries({ size: CHAR_VOXEL }));
    return geoCache.get(id);
  }

  function createSurvivor(id, ownerIdx) {
    const group = new THREE.Group();
    const body = new THREE.Group();
    const { lit, glow } = survivorGeometry(id);
    const mesh = new THREE.Mesh(lit, MATERIALS.lit);
    mesh.castShadow = true;
    body.add(mesh);
    if (glow) body.add(new THREE.Mesh(glow, MATERIALS.glow));
    const disc = new THREE.Mesh(discGeo, discMats[ownerIdx % discMats.length]);
    disc.position.y = 0.04;
    group.add(disc, body);
    group.userData.survivorId = id;
    root.add(group);
    return { id, group, body, disc, loc: null, slot: null, moving: false, dying: false, phase: Math.random() * 10 };
  }

  function hop(vis, pts, targetFacing) {
    const segs = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const len = pts[i].distanceTo(pts[i - 1]);
      segs.push({ a: pts[i - 1], b: pts[i], len, start: total });
      total += len;
    }
    const hops = Math.max(1, Math.ceil(total / 2.6));
    const duration = Math.min(3.2, 0.24 * hops + 0.1);
    vis.moving = true;
    pending++;
    const p = new THREE.Vector3();
    return tweens.add({
      duration,
      ease: ease.linear,
      onUpdate: (_e, t) => {
        const d = t * total;
        const seg = segs.find((s) => d <= s.start + s.len + 1e-6) ?? segs[segs.length - 1];
        p.lerpVectors(seg.a, seg.b, seg.len ? (d - seg.start) / seg.len : 1);
        const local = (t * hops) % 1;
        p.y = Math.sin(Math.PI * local) * 0.9;
        vis.group.position.copy(p);
        vis.group.rotation.y = faceToward(seg.a, seg.b);
        // squash on take-off and landing
        const squash = local < 0.15 || local > 0.85 ? 0.88 : 1.04;
        vis.body.scale.set(2 - squash, squash, 2 - squash);
      },
      onComplete: () => {
        vis.group.position.y = 0;
        vis.body.scale.set(1, 1, 1);
        vis.group.rotation.y = targetFacing;
        vis.moving = false;
        pending--;
        puffs.burst(vis.group.position, 6);
      },
    });
  }

  function appear(vis, pos, facing, animate) {
    vis.group.position.copy(pos);
    vis.group.rotation.y = facing;
    if (!animate) return;
    vis.group.scale.setScalar(0.01);
    pending++;
    puffs.burst(pos, 16);
    tweens.add({
      duration: 0.5, ease: ease.outBack,
      onUpdate: (e) => vis.group.scale.setScalar(Math.max(0.01, e)),
      onComplete: () => { vis.group.scale.setScalar(1); pending--; },
    });
  }

  function kill(vis, animate) {
    vis.dying = true;
    if (highlighted === vis.id) setHighlight(null);
    survivors.delete(vis.id);
    if (!animate) { root.remove(vis.group); return; }
    pending++;
    tweens.add({ duration: 0.45, ease: ease.outBounce, onUpdate: (e) => { vis.body.rotation.x = -Math.PI / 2 * e; } })
      .then(() => {
        puffs.burst(vis.group.position, 18, 0x9a2b2b);
        return tweens.add({ duration: 0.7, delay: 0.3, ease: ease.inQuad, onUpdate: (e) => { vis.group.position.y = -1.6 * e; } });
      })
      .then(() => { root.remove(vis.group); pending--; });
  }

  // ---------------- zombies & barricades

  function spawnZombie(locId, i, animate) {
    const pos = zombieSlotPos(locId, i);
    const variant = (i + locId.length) % 3;
    const item = zombiePools[variant].add({
      x: pos.x, y: animate ? -2.2 : 0, z: pos.z,
      rotY: faceToward(pos, layout[locId].center) + (Math.random() - 0.5) * 0.5,
      baseY: animate ? -2.2 : 0, tiltX: 0, tiltZ: 0, lean: 0, scale: 1,
      phase: Math.random() * 10, variant, rising: animate,
    });
    if (animate) {
      pending++;
      puffs.burst(pos, 18, 0xe3ecf7, 1.1);
      tweens.add({
        duration: 1.0, delay: Math.random() * 0.25, ease: ease.outCubic,
        onStart: () => puffs.burst(pos, 10),
        onUpdate: (e) => { item.baseY = -2.2 * (1 - e); item.lean = (1 - e) * 0.5; },
        onComplete: () => { item.rising = false; item.baseY = 0; item.lean = 0; pending--; },
      });
    }
    return item;
  }

  function removeZombie(item, animate) {
    const pool = zombiePools[item.variant];
    if (!animate) { pool.remove(item); return; }
    item.dying = true;
    pending++;
    tweens.add({ duration: 0.35, ease: ease.outQuad, onUpdate: (e) => { item.lean = -1.4 * e; } })
      .then(() => {
        puffs.burst({ x: item.x, y: 0.2, z: item.z }, 14, 0x6f8a4e);
        return tweens.add({ duration: 0.6, ease: ease.inQuad, onUpdate: (e) => { item.baseY = -2.2 * e; } });
      })
      .then(() => { pool.remove(item); pending--; });
  }

  function addBarricade(locId, j, animate) {
    const pos = zombieSlotPos(locId, LOCATIONS[locId].zombieSlots - 1 - j);
    const item = barricadePool.add({
      x: pos.x, y: 0, z: pos.z, rotY: faceToward(pos, layout[locId].center) + Math.PI / 2, scale: animate ? 0.01 : 1,
    });
    if (animate) {
      pending++;
      puffs.burst(pos, 8, 0x8a6444);
      tweens.add({ duration: 0.45, ease: ease.outBack, onUpdate: (e) => { item.scale = Math.max(0.01, e); }, onComplete: () => { pending--; } });
    }
    return item;
  }

  function removeBarricade(item, animate) {
    if (!animate) { barricadePool.remove(item); return; }
    puffs.burst(item, 16, 0x6b4a32, 1.2);
    pending++;
    tweens.add({ duration: 0.3, ease: ease.inQuad, onUpdate: (e) => { item.scale = 1 - e * 0.99; item.tiltZ = e; }, onComplete: () => { barricadePool.remove(item); pending--; } });
  }

  // ---------------- sync

  function sync(state, { animate = true } = {}) {
    const ownerIdx = Object.fromEntries(state.players.map((p, i) => [p.id, i]));

    // Survivors: assign slots per location, then animate differences.
    const byLoc = new Map(LOCATION_IDS.map((id) => [id, []]));
    for (const sv of Object.values(state.survivors)) if (sv.alive) byLoc.get(sv.location).push(sv.id);
    for (const [loc, ids] of byLoc) {
      // Survivors who were already here keep priority on their old slots.
      const prev = new Map([...slots.get(loc)].filter(([id]) => survivors.get(id)?.loc === loc));
      slots.set(loc, assignSlots(prev, ids));
    }
    for (const sv of Object.values(state.survivors)) {
      let vis = survivors.get(sv.id);
      if (!sv.alive) { if (vis && !vis.dying) kill(vis, animate); continue; }
      const slot = slots.get(sv.location).get(sv.id);
      const pos = survivorSlotPos(sv.location, slot);
      const facing = faceToward(pos, layout[sv.location].center);
      if (!vis) {
        vis = createSurvivor(sv.id, ownerIdx[sv.owner] ?? 0);
        survivors.set(sv.id, vis);
        appear(vis, pos, facing, animate);
      } else if (vis.loc !== sv.location || vis.slot !== slot) {
        if (animate) hop(vis, route(vis.group.position, vis.loc, pos, sv.location), facing);
        else { vis.group.position.copy(pos); vis.group.rotation.y = facing; }
      }
      vis.disc.material = discMats[(ownerIdx[sv.owner] ?? 0) % discMats.length];
      vis.loc = sv.location;
      vis.slot = slot;
    }

    // Zombies and barricades: counts per location.
    for (const id of LOCATION_IDS) {
      const zs = zombies.get(id);
      const target = state.locations[id].zombies;
      while (zs.length > target) removeZombie(zs.pop(), animate);
      while (zs.length < target) zs.push(spawnZombie(id, zs.length, animate));
      const bs = barricades.get(id);
      const tb = state.locations[id].barricades;
      while (bs.length > tb) removeBarricade(bs.pop(), animate);
      while (bs.length < tb) bs.push(addBarricade(id, bs.length, animate));
    }
    if (!animate) tweens.flush();
  }

  // ---------------- per-frame

  function update(t, dt) {
    for (const pool of zombiePools) {
      for (const z of pool.items) {
        // Shuffling idle: bob, side-to-side tilt, a little sway of the head.
        const ph = t * 2.4 + z.phase;
        z.y = z.baseY + (z.dying ? 0 : Math.abs(Math.sin(ph)) * 0.07);
        z.tiltZ = z.dying ? 0 : Math.sin(ph * 0.5) * 0.14;
        z.tiltX = 0.12 + z.lean + Math.sin(ph) * 0.03;
      }
      pool.write();
    }
    barricadePool.write();
    for (const vis of survivors.values()) {
      if (!vis.moving && !vis.dying) vis.body.scale.y = 1 + Math.sin(t * 2 + vis.phase) * 0.025; // breathing
    }
    puffs.update(dt);
    if (ring.visible) {
      ring.scale.setScalar(1 + Math.sin(t * 4) * 0.06);
      ring.material.opacity = 0.65 + Math.sin(t * 4) * 0.25;
    }
  }

  function setHighlight(id) {
    const vis = id ? survivors.get(id) : null;
    highlighted = vis ? id : null;
    ring.removeFromParent();
    ring.visible = !!vis;
    if (vis) vis.group.add(ring);
  }

  /** Survivor under the pointer ray, if any. */
  function pick(raycaster) {
    const groups = [...survivors.values()].filter((v) => !v.dying).map((v) => v.body);
    const hit = raycaster.intersectObjects(groups, true)[0];
    if (!hit) return null;
    let o = hit.object;
    while (o && !o.userData.survivorId) o = o.parent;
    return o?.userData.survivorId ?? null;
  }

  return {
    root,
    sync,
    update,
    get busy() { return pending > 0; },
    setHighlight,
    pick,
    get highlighted() { return highlighted; },
    survivorObject: (id) => survivors.get(id)?.group ?? null,
    counts: () => ({
      survivors: survivors.size,
      zombies: zombiePools.reduce((n, p) => n + p.items.length, 0),
      barricades: barricadePool.items.length,
    }),
  };
}
