// Renderer, orthographic "diorama" camera with limited orbit/zoom/pan, lighting, fog and snowfall.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { P } from './palette.js';

const VIEW_HEIGHT = 62; // world units visible vertically at zoom 1
const PAN_LIMIT = 24;

export function createStage(canvas, { snow = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(P.night);
  scene.fog = new THREE.FogExp2(P.fog, 0.0042);

  // Isometric-ish orthographic camera.
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 400);
  const dist = 110;
  const polar = THREE.MathUtils.degToRad(54);
  const azimuth = THREE.MathUtils.degToRad(35);
  camera.position.set(
    dist * Math.sin(polar) * Math.sin(azimuth),
    dist * Math.cos(polar),
    dist * Math.sin(polar) * Math.cos(azimuth),
  );
  camera.zoom = 1.05;

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minZoom = 0.75;
  controls.maxZoom = 3.5;
  controls.minPolarAngle = THREE.MathUtils.degToRad(25);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(68);
  controls.screenSpacePanning = false;
  controls.zoomToCursor = true;
  controls.target.set(0, 0, 0);
  controls.addEventListener('change', () => {
    // Keep the camera focused on the board.
    const t = controls.target;
    t.y = 0;
    const r = Math.hypot(t.x, t.z);
    if (r > PAN_LIMIT) {
      const k = PAN_LIMIT / r;
      const dx = t.x * k - t.x; const dz = t.z * k - t.z;
      t.x += dx; t.z += dz;
      camera.position.x += dx; camera.position.z += dz;
    }
  });
  controls.update();

  // Lights: cold moon + sky fill. Warm point lights live on the board.
  const hemi = new THREE.HemisphereLight(0x8fb0e8, 0x1c2640, 1.1);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xb8d0ff, 1.6);
  moon.position.set(-40, 70, -25);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 10, far: 200 });
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.04;
  scene.add(moon);
  scene.add(moon.target);

  const snowfall = snow ? createSnow() : null;
  if (snowfall) scene.add(snowfall.points);

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    // On narrow (portrait) screens, keep the whole board width visible.
    const viewH = aspect < 1.1 ? (VIEW_HEIGHT * 1.25) / Math.max(aspect, 0.42) : VIEW_HEIGHT;
    camera.left = (-viewH * aspect) / 2;
    camera.right = (viewH * aspect) / 2;
    camera.top = viewH / 2;
    camera.bottom = -viewH / 2;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  const frameCallbacks = [];
  const clock = new THREE.Clock();
  let running = true;
  function loop() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    controls.update();
    snowfall?.update(dt, controls.target);
    for (const cb of frameCallbacks) cb(t, dt);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  return {
    renderer, scene, camera, controls,
    onFrame(cb) { frameCallbacks.push(cb); },
    stop() { running = false; },
  };
}

function createSnow(count = 2600) {
  const area = { x: 120, y: 60, z: 120 };
  const pos = new Float32Array(count * 3);
  const speed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * area.x;
    pos[i * 3 + 1] = Math.random() * area.y;
    pos[i * 3 + 2] = (Math.random() - 0.5) * area.z;
    speed[i] = 2 + Math.random() * 3;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  // Soft round flake sprite generated on a canvas.
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(235,242,255,0.6)');
  grad.addColorStop(1, 'rgba(235,242,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const mat = new THREE.PointsMaterial({
    size: 4, sizeAttenuation: false, map: new THREE.CanvasTexture(c),
    transparent: true, depthWrite: false, opacity: 0.85, fog: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  let t = 0;
  return {
    points,
    update(dt) {
      t += dt;
      for (let i = 0; i < count; i++) {
        const k = i * 3;
        pos[k + 1] -= speed[i] * dt;
        pos[k] += Math.sin(t * 0.7 + i) * dt * 0.8;
        if (pos[k + 1] < 0) {
          pos[k + 1] = area.y;
          pos[k] = (Math.random() - 0.5) * area.x;
          pos[k + 2] = (Math.random() - 0.5) * area.z;
        }
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
