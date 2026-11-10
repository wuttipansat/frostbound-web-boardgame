// Camera rig (step 15): eases the diorama camera to where something happens, follows a walking survivor,
// and comes back to the view the player had. Pan = move target and camera together (the angle never
// changes), zoom = the orthographic zoom. If the player grabs the camera, the rig lets go until released.
import * as THREE from 'three';

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createCameraRig(stage, { board, pieces }) {
  const { camera, controls } = stage;
  let goal = null; // Vector3 the target eases to
  let follow = null; // Object3D followed every frame
  let goalZoom = null;
  let home = null; // { target, zoom } the player's own view, taken when the rig first moves
  let userTook = false;
  let returning = false;
  let lastPoint = null; // where the last scene put the camera
  const tmp = new THREE.Vector3();

  // The player moved the camera (a real drag or the wheel, not a click): stop driving it,
  // and don't fight to bring it back.
  const canvas = stage.renderer.domElement;
  let down = null;
  const letGo = () => { if (goal || follow || returning) { userTook = true; lastPoint = null; goal = null; follow = null; returning = false; home = null; } };
  canvas.addEventListener('pointerdown', (ev) => { down = [ev.clientX, ev.clientY]; });
  canvas.addEventListener('pointerup', () => { down = null; });
  canvas.addEventListener('pointermove', (ev) => { if (down && ev.buttons && Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 6) letGo(); });
  canvas.addEventListener('wheel', letGo, { passive: true });

  function take() {
    if (!home) home = { target: controls.target.clone(), zoom: camera.zoom };
  }
  const closeZoom = () => Math.min(controls.maxZoom, (home?.zoom ?? camera.zoom) * 1.6);

  function pointOf(ev) {
    const obj = ev.survivorId ? pieces.survivorObject(ev.survivorId) : null;
    // A move: ease to where the survivor is going (following the walking piece made the view
    // jitter when its path or slot changed mid-walk).
    const lay = ev.at ? board.layout[ev.at] : null;
    if (lay) return { point: lay.center.clone().lerp(lay.label.clone().setY(0), 0.35) };
    return obj ? { point: obj.position.clone().setY(0) } : null;
  }

  function apply(target, zoom, k) {
    tmp.copy(target).setY(0).sub(controls.target).multiplyScalar(k);
    controls.target.add(tmp);
    camera.position.add(tmp);
    if (zoom != null) {
      camera.zoom += (zoom - camera.zoom) * k;
      camera.updateProjectionMatrix();
    }
    return controls.target.distanceTo(tmp.copy(target).setY(0)) < 0.05 && (zoom == null || Math.abs(zoom - camera.zoom) < 0.005);
  }

  return {
    /** Ease to the place of a scene (and follow a walking survivor). */
    focus(ev) {
      if (userTook) return;
      const p = pointOf(ev);
      if (!p) return;
      take();
      returning = false;
      follow = p.obj ?? null;
      const next = p.point ?? null;
      // Same place as the scene before (more barricades, another search there): stay put, no re-zoom.
      if (next && lastPoint && next.distanceTo(lastPoint) < 3 && !returning) { lastPoint = next; return; }
      lastPoint = next;
      goal = next;
      goalZoom = ev.kind === 'over' ? closeZoom() : null; // UI-6: pan only, the player's zoom stays
    },
    /** Back to the player's own view. */
    home() {
      follow = null;
      lastPoint = null;
      if (userTook || !home) { goal = null; return; }
      goal = home.target.clone();
      goalZoom = home.zoom;
      returning = true;
    },
    /** The queue is empty: the next run may move the camera again. */
    release() { userTook = false; },
    update(dt) {
      if (userTook) return;
      const target = follow ? follow.position : goal;
      if (!target) return;
      const k = reducedMotion() ? 1 : 1 - Math.exp(-dt * (follow ? 5 : 3.2));
      const done = apply(target, goalZoom, k);
      if (done && returning) { returning = false; goal = null; home = null; }
      else if (done && !follow) goal = null;
    },
    get active() { return !!(goal || follow || returning); },
    get homeView() { return home; },
  };
}
