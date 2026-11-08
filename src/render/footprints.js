// Footprints in the snow (step 20): a walking survivor leaves prints that fade over ~2 rounds.
// One InstancedMesh (one draw call); a fixed pool, the oldest print is reused first.
import * as THREE from 'three';

const PRINT = new THREE.Color(0x2a3a58);
const SNOW = new THREE.Color(0xdfe8f5);

/** Pure pool bookkeeping (tested without WebGL). */
export function createPrintPool(max = 60) {
  const slots = [];
  let next = 0;
  return {
    max,
    add(p) { const i = next; slots[i] = p; next = (next + 1) % max; return i; },
    clear() { slots.length = 0; next = 0; },
    get used() { return slots.filter(Boolean).length; },
    slots,
  };
}

/** Points every `step` along a→b, alternating left/right feet; `trimA`/`trimB` keep them out of buildings. */
export function pathPrints(a, b, { step = 1.6, trimA = 0, trimB = 0 } = {}) {
  const dx = b.x - a.x; const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len < step) return [];
  const ux = dx / len; const uz = dz / len;
  const out = [];
  for (let d = Math.max(step * 1.5, trimA), n = 0; d < len - Math.max(step, trimB); d += step, n++) {
    const side = n % 2 ? 0.45 : -0.45;
    out.push({ x: a.x + ux * d - uz * side, z: a.z + uz * d + ux * side, rot: Math.atan2(ux, uz) });
  }
  return out;
}

/** `ground(x, z)` → height of the snow there (the terrain has drifts), default flat. */
export function createFootprints(max = 60, ground = () => 0) {
  const pool = createPrintPool(max);
  const geo = new THREE.BoxGeometry(0.55, 0.06, 0.9);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.count = max;
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  const o = new THREE.Object3D();
  const col = new THREE.Color();
  const hide = (i) => { o.position.set(0, -50, 0); o.scale.setScalar(0); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix); };
  for (let i = 0; i < max; i++) { hide(i); mesh.setColorAt(i, SNOW); }
  let round = 1;
  return {
    mesh, pool,
    setRound(r) { round = r; },
    /** Walk from a to b (Vector3-like); prints appear one by one over `dur` seconds. */
    walk(a, b, dur = 1.2) {
      // The colony palisade is ~11 units round its centre; a location's door ~6.5 in front of its centre.
      const trim = (p) => (Math.hypot(p.x, p.z) < 1 ? 11.5 : 7.5);
      const pts = pathPrints(a, b, { trimA: trim(a), trimB: trim(b) });
      pts.forEach((p, n) => pool.add({ ...p, y: ground(p.x, p.z), round, t: -n * (dur / Math.max(1, pts.length)) }));
    },
    clear() { pool.clear(); for (let i = 0; i < max; i++) hide(i); mesh.instanceMatrix.needsUpdate = true; },
    update(dt) {
      pool.slots.forEach((p, i) => {
        if (!p) return;
        p.t += dt;
        const age = (round - p.round) / 2;
        if (age >= 1) { pool.slots[i] = null; hide(i); return; }
        const appear = Math.max(0, Math.min(1, p.t * 4));
        o.position.set(p.x, (p.y ?? 0) + 0.02, p.z); o.rotation.set(0, p.rot, 0); o.scale.setScalar(appear); o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
        mesh.setColorAt(i, col.copy(PRINT).lerp(SNOW, Math.max(age, 0.05)));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
}
