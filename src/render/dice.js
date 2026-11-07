// Dice tray: a small, separate WebGL canvas where voxel d6 cubes tumble and settle on the rolled value.
// Renders only while something moves, so it costs nothing when idle.
import * as THREE from 'three';
import { MATERIALS } from './voxel.js';
import { dieModel, DIE_FACES, DIE_VOXELS } from './characters.js';
import { Tweens, ease } from './tween.js';

const DIE_SIZE = 1 / DIE_VOXELS; // the whole die is 1 world unit
const UP = new THREE.Vector3(0, 1, 0);

/** Quaternion that turns the face showing `value` to point straight up. */
export function faceUpQuaternion(value) {
  const n = new THREE.Vector3(...DIE_FACES[value]);
  return new THREE.Quaternion().setFromUnitVectors(n, UP);
}

/** Which value faces up for a given orientation (inverse of faceUpQuaternion). */
export function valueFacingUp(quaternion) {
  let best = null;
  for (const [v, n] of Object.entries(DIE_FACES)) {
    const w = new THREE.Vector3(...n).applyQuaternion(quaternion);
    if (!best || w.y > best.y) best = { v: Number(v), y: w.y };
  }
  return best.v;
}

export function diceLayout(count, spacing = 1.35) {
  return Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * spacing);
}

export function createDiceTray(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 4.3, 3.5);
  camera.lookAt(0, 0.3, 0);
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x2a3550, 1.6));
  const key = new THREE.DirectionalLight(0xffe2b8, 2.2);
  key.position.set(-3, 8, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(512, 512);
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 4, bottom: -4 });
  scene.add(key);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 10), new THREE.ShadowMaterial({ opacity: 0.35 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const { lit } = dieModel().buildGeometries({ size: DIE_SIZE });
  lit.translate(0, -0.5, 0); // centre the cube on its origin so it spins around the middle
  const tweens = new Tweens();
  let dice = []; // { mesh, value, used }
  let currentKey = null;
  let rafId = null;
  let last = 0;

  function resize() {
    const w = canvas.clientWidth || 300; const h = canvas.clientHeight || 110;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  }

  function render() { renderer.render(scene, camera); }

  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    tweens.update(dt);
    render();
    rafId = tweens.busy ? requestAnimationFrame(loop) : null;
  }
  function kick() {
    if (rafId == null) { last = performance.now(); rafId = requestAnimationFrame(loop); }
  }

  function makeDie() {
    const mesh = new THREE.Mesh(lit, MATERIALS.lit.clone());
    mesh.castShadow = true;
    scene.add(mesh);
    return mesh;
  }

  function setUsed(d, used) {
    d.used = used;
    d.mesh.material.color.setHex(used ? 0x4a5160 : 0xffffff);
    d.mesh.position.y = used ? 0.42 : 0.5;
  }

  /** Tumble one die from off-tray onto (x, 0.5, 0) showing `value`. */
  function throwDie(d, x, value, delay) {
    const final = new THREE.Quaternion()
      .setFromAxisAngle(UP, (Math.random() - 0.5) * 0.5)
      .multiply(faceUpQuaternion(value));
    const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    const spin = Math.PI * 2 * (2 + Math.random());
    const from = new THREE.Vector3(x - 3 - Math.random() * 2, 3.5, -3);
    const q = new THREE.Quaternion();
    d.mesh.position.copy(from);
    d.mesh.visible = false;
    return tweens.add({
      duration: 1.15, delay, ease: ease.linear,
      onStart: () => { d.mesh.visible = true; },
      onUpdate: (_e, t) => {
        const k = ease.outCubic(t);
        d.mesh.position.set(from.x + (x - from.x) * k, 0.5 + (1 - ease.outBounce(t)) * 3, from.z * (1 - k));
        q.setFromAxisAngle(axis, spin * (1 - ease.outCubic(t)));
        d.mesh.quaternion.copy(final).multiply(q);
      },
      onComplete: () => { d.mesh.quaternion.copy(final); d.mesh.position.set(x, 0.5, 0); },
    });
  }

  /**
   * Show a player's dice. A new `rollKey` (e.g. player+round) or changed values trigger a roll animation;
   * otherwise only the used/unused shading updates.
   * @param {{v:number, used:boolean}[]} values
   */
  function sync(values, rollKey) {
    const xs = diceLayout(values.length);
    const fresh = rollKey !== currentKey;
    currentKey = rollKey;
    if (fresh) {
      for (const d of dice) scene.remove(d.mesh);
      dice = [];
    }
    let rolled = false;
    values.forEach((dv, i) => {
      let d = dice[i];
      if (!d) { d = { mesh: makeDie(), value: null, used: false }; dice[i] = d; }
      if (d.value !== dv.v) {
        d.value = dv.v;
        setUsed(d, false);
        throwDie(d, xs[i], dv.v, fresh ? i * 0.08 : 0).then(() => setUsed(d, dv.used));
        rolled = true;
      } else {
        d.mesh.position.x = xs[i];
        setUsed(d, dv.used);
      }
    });
    for (const d of dice.splice(values.length)) scene.remove(d.mesh);
    if (rolled) kick(); else render();
    return rolled;
  }

  window.addEventListener('resize', resize);
  resize();
  return { sync, get busy() { return tweens.busy; }, values: () => dice.map((d) => valueFacingUp(d.mesh.quaternion)) };
}
