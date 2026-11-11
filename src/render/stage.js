// Renderer, orthographic "diorama" camera with limited orbit/zoom/pan, lighting, fog and snowfall.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { P } from './palette.js';
import { MATERIALS } from './voxel.js';
import { QUALITY } from './quality.js';

const VIEW_HEIGHT = 62; // world units visible vertically at zoom 1
const PAN_LIMIT = 24; // stage-1 pan box half size
const panBox = { minX: -PAN_LIMIT, maxX: PAN_LIMIT, minZ: -PAN_LIMIT, maxZ: PAN_LIMIT };

export function createStage(canvas, { snow = true, quality = QUALITY } = {}) {
  const q = quality;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !q.post, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.maxPixelRatio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = q.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  // Glowing voxels (fire, windows, eyes) go above 1.0 so bloom can pick them up.
  MATERIALS.glow.color.setScalar(q.glowBoost);
  renderer.info.autoReset = false; // count every pass of a frame (reset manually each frame)

  const scene = new THREE.Scene();
  // UI-13: a plain dark backdrop (the diorama floats over it) instead of the night sky.
  scene.background = new THREE.Color(P.backdrop);
  scene.fog = new THREE.FogExp2(P.backdrop, 0.0015); // less fog: the whole town stays readable

  // Isometric-ish orthographic camera.
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 400);
  const dist = 110;
  // Step 16: a fixed isometric tilt (~55°); the view turns in 90° steps and zooms in 3 levels.
  const polar = THREE.MathUtils.degToRad(55);
  const azimuth = THREE.MathUtils.degToRad(45);
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
  // MAP-2 C: a fixed isometric angle — drag to pan, pinch / wheel to zoom, no turning.
  controls.minPolarAngle = THREE.MathUtils.degToRad(40);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(65);
  controls.enableRotate = false;
  controls.enableZoom = true;
  controls.screenSpacePanning = false;
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.screenSpacePanning = false;
  controls.zoomToCursor = true;
  controls.target.set(0, 0, 0);
  controls.addEventListener('change', () => {
    // Keep the camera over the city: the target stays inside the map outline + 1 block.
    const t = controls.target;
    t.y = 0;
    const dx = Math.max(panBox.minX, Math.min(panBox.maxX, t.x)) - t.x;
    const dz = Math.max(panBox.minZ, Math.min(panBox.maxZ, t.z)) - t.z;
    if (dx || dz) { t.x += dx; t.z += dz; camera.position.x += dx; camera.position.z += dz; }
  });
  controls.update();

  // Lights: cold moon + sky fill. Warm point lights live on the board.
  const hemi = new THREE.HemisphereLight(0x9fb8e8, 0x2a3450, 1.35);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xb8d0ff, 1.6);
  moon.position.set(-25, 70, 45); // UI-13: light the façades the camera sees (+z), long shadows to the back
  moon.castShadow = true;
  moon.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
  // Tight to the plateau (radius 46) to keep shadow texels dense.
  Object.assign(moon.shadow.camera, { left: -49, right: 49, top: 49, bottom: -49, near: 20, far: 170 });
  if (q.softShadows) moon.shadow.radius = 3;
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.04;
  scene.add(moon);
  scene.add(moon.target);

  // Cold rim light from behind the board: outlines silhouettes against the dark.
  const rim = new THREE.DirectionalLight(0x7f9fe0, 0.55);
  rim.position.set(-55, 18, -70);
  scene.add(rim);

  const snowfall = snow ? createSnow(q.snowFlakes) : null;
  if (snowfall) scene.add(snowfall.group);
  const mist = createMist();
  scene.add(mist.group);

  // Post-processing lives in its own chunk (step 22); until it arrives (or on the saver tier) we render plain.
  let post = null;
  let postWanted = false; // set by setTier (main applies the graphics tier right away)
  let postLoading = null;
  let ratio = Math.min(window.devicePixelRatio, q.maxPixelRatio);
  const size = { w: 1, h: 1 };
  function ensurePost() {
    if (post || postLoading || !q.post) return;
    postLoading = import('./post.js').then(({ createPost }) => {
      post = createPost(renderer, scene, camera, q.post);
      post.setSize(size.w, size.h, renderer.getPixelRatio());
    }).catch((err) => console.error(err));
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    size.w = w; size.h = h;
    renderer.setSize(w, h, false);
    post?.setSize(w, h, renderer.getPixelRatio());
    const aspect = w / h;
    // Sky: crop to the screen aspect ("cover") instead of stretching it (the moon stays round on phones).
    if (scene.background?.isTexture) {
      const img = scene.background.image;
      const ta = img.width / img.height;
      const tex = scene.background;
      // keep the moon (drawn at 80% across) in frame on narrow screens
      if (aspect < ta) { tex.repeat.set(aspect / ta, 1); tex.offset.set((1 - aspect / ta) * 0.8, 0); }
      else { tex.repeat.set(1, ta / aspect); tex.offset.set(0, 1 - ta / aspect); }
    }
    // On narrow (portrait) screens, keep the whole board width visible.
    const viewH = aspect < 1.1 ? (VIEW_HEIGHT * 1.34) / Math.max(aspect, 0.42) : VIEW_HEIGHT * 1.3; // UI-13: the whole slab floats in view
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
  function frame(dt, t) {
    view.tick(dt);
    controls.update();
    snowfall?.update(dt, t);
    mist?.update(dt);
    for (const cb of frameCallbacks) cb(t, dt);
    renderer.info.reset();
    if (post && postWanted) post.render(dt);
    else renderer.render(scene, camera);
  }
  // Step 22: frame pacing. `every` = draw 1 frame in N (2 = 30 fps saver, 4 = behind an opaque screen);
  // a hidden tab draws nothing. `onTime(dt)` lets the governor watch real frame times.
  let every = 1;
  let idle = 1;
  let tick = 0;
  let acc = 0;
  let onTime = null;
  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    const raw = clock.getDelta();
    if (document.hidden) { acc = 0; return; }
    acc += raw;
    if (++tick % Math.max(every, idle) !== 0) return;
    const dt = acc;
    acc = 0;
    const t0 = performance.now();
    const n = Math.max(every, idle);
    frame(Math.min(dt, 0.05 * n), clock.elapsedTime); // throttled frames still keep game time
    onTime?.(dt, performance.now() - t0, n);
  }
  requestAnimationFrame(loop);

  // ---- view steps: 3 zoom levels (eased in the frame loop)
  const ZOOMS = [0.95, 1.55, 2.5];
  const easeV = new THREE.Vector3();
  let zoomIdx = 0;
  const view = {
    ZOOMS,
    get zoomLevel() { return zoomIdx; },
    zoomTo(i) { zoomIdx = Math.max(0, Math.min(ZOOMS.length - 1, i)); view.goalZoom = ZOOMS[zoomIdx]; },
    zoomStep(d) { view.goalZoom = Math.max(controls.minZoom, Math.min(controls.maxZoom, (view.goalZoom ?? camera.zoom) * (d > 0 ? 1.3 : 1 / 1.3))); },
    goalZoom: null,
    tick(dt) {
      if (view.goalTarget) { // MAP-2 C: ease to the new home view when the city grows
        const d = easeV.copy(view.goalTarget).sub(controls.target);
        if (d.length() < 0.05) view.goalTarget = null;
        d.multiplyScalar(Math.min(1, dt * 4));
        controls.target.add(d); camera.position.add(d); controls.update();
      }
      if (view.goalZoom != null) {
        camera.zoom += (view.goalZoom - camera.zoom) * Math.min(1, dt * 8);
        if (Math.abs(view.goalZoom - camera.zoom) < 0.003) { camera.zoom = view.goalZoom; view.goalZoom = null; }
        camera.updateProjectionMatrix();
      }
    },
  };
  // The starting view, for the "back to the usual view" button.
  const homeView = { pos: camera.position.clone(), target: controls.target.clone(), zoom: 1.05 };
  /** UI-13: fit the usual view to the open part of the city (grid cells minX..maxX, minZ..maxZ). */
  view.fit = ({ minX, maxX, minZ, maxZ, block }, { snap = false } = {}) => {
    // Work in the camera's ground axes (u = across the screen, v = up the screen) so the open blocks sit centred.
    const h = block / 2;
    const xs = [minX * block - h, (maxX + 1) * block - h]; const zs = [minZ * block - h, (maxZ + 1) * block - h];
    const us = []; const vs = [];
    for (const x of xs) for (const z of zs) { us.push((x - z) / Math.SQRT2); vs.push((x + z) / Math.SQRT2); }
    const u = (Math.min(...us) + Math.max(...us)) / 2; const v = (Math.min(...vs) + Math.max(...vs)) / 2;
    const off = homeView.pos.clone().sub(homeView.target);
    homeView.target.set((u + v) / Math.SQRT2, 0, (v - u) / Math.SQRT2);
    homeView.pos.copy(homeView.target).add(off);
    const full = 3 * block * Math.SQRT2;
    const need = Math.max(Math.max(...us) - Math.min(...us), (Math.max(...vs) - Math.min(...vs)) * 0.82);
    const portrait = camera.right - camera.left < camera.top - camera.bottom; // narrow screens: leave more margin
    homeView.zoom = Math.min(controls.maxZoom, 1.05 * (full / Math.max(need, full * 0.45)) * (portrait ? 0.82 : 1));
    controls.minZoom = Math.min(0.75, homeView.zoom * 0.8); // MAP-1: a bigger city can be zoomed out further
    Object.assign(panBox, { minX: (minX - 1) * block, maxX: (maxX + 1) * block, minZ: (minZ - 1) * block, maxZ: (maxZ + 1) * block });
    if (snap) view.reset();
    else { view.goalTarget = homeView.target.clone(); view.goalZoom = homeView.zoom; }
  };
  view.reset = () => {
    view.goalTarget = null;
    camera.position.copy(homeView.pos);
    controls.target.copy(homeView.target);
    view.goalZoom = homeView.zoom;
    controls.update();
  };

  return {
    view,
    renderer, scene, camera, controls, quality: q, hemi, moon,
    /** Step 22: apply a graphics tier (see render/perf.js TIERS). */
    setTier(tier) {
      ratio = Math.min(window.devicePixelRatio, q.maxPixelRatio, tier.pixelRatio);
      renderer.setPixelRatio(ratio);
      postWanted = !!(tier.post && q.post);
      if (postWanted) ensurePost();
      const map = Math.min(q.shadowMapSize, tier.shadow);
      if (moon.shadow.mapSize.x !== map) { moon.shadow.mapSize.set(map, map); moon.shadow.map?.dispose(); moon.shadow.map = null; }
      MATERIALS.glow.color.setScalar(postWanted ? q.glowBoost : Math.min(q.glowBoost, 1.5));
      snowfall?.setScale(tier.snow);
      every = tier.every ?? 1;
      resize();
    },
    /** Draw less while an opaque full-screen panel covers the scene (1 = normal). */
    setIdle(n) { idle = Math.max(1, n | 0); },
    onFrameTime(cb) { onTime = cb; },
    get drawEvery() { return Math.max(every, idle); },
    get postActive() { return !!(post && postWanted); },
    /** Step 20: 0 (light flurries) .. 1 (blizzard). */
    setWeather(k) { snowfall?.setIntensity(k); },
    onFrame(cb) { frameCallbacks.push(cb); },
    stop() { running = false; },
    /** Tests: advance one frame by hand while the loop is stopped. */
    step(dt = 0.05) { frame(dt, clock.elapsedTime + dt); },
  };
}

function flakeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(235,242,255,0.6)');
  grad.addColorStop(1, 'rgba(235,242,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

/** Two depth layers of snow (small far flakes, big near flakes) that drift with gusts of wind. */
function createSnow(count = 2600) {
  const area = { x: 120, y: 60, z: 120 };
  const map = flakeTexture();
  const group = new THREE.Group();
  const layers = [
    { n: Math.round(count * 0.7), size: 2.6, opacity: 0.7, speed: [1.5, 3] },
    { n: Math.round(count * 0.3), size: 5, opacity: 0.9, speed: [3, 5] },
  ].map((L) => {
    const pos = new Float32Array(L.n * 3);
    const speed = new Float32Array(L.n);
    for (let i = 0; i < L.n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * area.x;
      pos[i * 3 + 1] = Math.random() * area.y;
      pos[i * 3 + 2] = (Math.random() - 0.5) * area.z;
      speed[i] = L.speed[0] + Math.random() * (L.speed[1] - L.speed[0]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ size: L.size, sizeAttenuation: false, map, transparent: true, depthWrite: false, opacity: L.opacity, fog: false });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    group.add(points);
    return { ...L, pos, speed, geo, mat };
  });
  let storm = 0.35;
  let scale = 1; // step 22: fewer flakes on lower graphics tiers
  return {
    group,
    setScale(k) { scale = k; this.setIntensity(storm); },
    setIntensity(k) {
      storm = Math.max(0, Math.min(1, k));
      // Fewer flakes when calm (drawRange: no extra cost), all of them in a blizzard.
      for (const L of layers) { L.geo.setDrawRange(0, Math.round(L.n * (0.35 + storm * 0.65) * scale)); L.mat.opacity = L.opacity * (0.7 + storm * 0.3); }
    },
    update(dt, t) {
      const wind = 0.6 + storm * 1.6;
      const gust = (Math.sin(t * 0.27) * Math.sin(t * 0.11) * 3.5 + 0.6) * wind;
      dt *= 0.8 + storm * 0.7;
      for (const L of layers) {
        const { pos, speed } = L;
        const n = L.geo.drawRange.count === Infinity ? L.n : Math.min(L.n, L.geo.drawRange.count);
        for (let i = 0; i < n; i++) {
          const k = i * 3;
          pos[k + 1] -= speed[i] * dt;
          pos[k] += (Math.sin(t * 0.7 + i) * 0.8 + gust) * dt;
          if (pos[k + 1] < 0 || pos[k] > area.x / 2) {
            pos[k + 1] = area.y;
            pos[k] = (Math.random() - 0.5) * area.x - (gust > 0 ? 10 : 0);
            pos[k + 2] = (Math.random() - 0.5) * area.z;
          }
        }
        L.geo.attributes.position.needsUpdate = true;
      }
    },
  };
}

/** Night sky painted once into a texture: gradient, stars, a haloed moon and a faint aurora. */
function skyTexture() {
  const W = 1024; const H = 640;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#04070e');
  grad.addColorStop(0.55, '#0a1426');
  grad.addColorStop(1, '#16243c');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // Aurora: a few soft, translucent ribbons.
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    const y0 = 90 + i * 34;
    g.moveTo(-40, y0);
    for (let x = 0; x <= W + 40; x += 40) g.lineTo(x, y0 + Math.sin(x * 0.006 + i) * 40 + Math.sin(x * 0.017) * 12);
    g.strokeStyle = i === 1 ? 'rgba(90, 220, 170, 0.07)' : 'rgba(110, 170, 255, 0.05)';
    g.lineWidth = 46 - i * 10;
    g.filter = 'blur(14px)';
    g.stroke();
  }
  g.filter = 'none';
  // Stars, denser near the top.
  for (let i = 0; i < 420; i++) {
    const y = Math.pow(Math.random(), 1.6) * H * 0.8;
    const r = Math.random() < 0.08 ? 1.4 : 0.7;
    g.fillStyle = `rgba(230, 240, 255, ${0.25 + Math.random() * 0.6})`;
    g.fillRect(Math.random() * W, y, r, r);
  }
  // Moon with a halo.
  const mx = W * 0.8; const my = H * 0.17;
  const halo = g.createRadialGradient(mx, my, 10, mx, my, 120);
  halo.addColorStop(0, 'rgba(200, 220, 255, 0.35)');
  halo.addColorStop(1, 'rgba(200, 220, 255, 0)');
  g.fillStyle = halo;
  g.fillRect(mx - 130, my - 130, 260, 260);
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = '#e8eefa';
  g.beginPath(); g.arc(mx, my, 22, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(160, 175, 205, 0.5)';
  for (const [dx, dy, r] of [[-7, -4, 5], [6, 5, 4], [2, -9, 3]]) { g.beginPath(); g.arc(mx + dx, my + dy, r, 0, Math.PI * 2); g.fill(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Low drifting ground mist: a few huge translucent planes with a procedural cloud texture. */
function createMist() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0)';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * S; const y = Math.random() * S; const r = 20 + Math.random() * 50;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(220, 232, 248, 0.22)');
    grad.addColorStop(1, 'rgba(220, 232, 248, 0)');
    g.fillStyle = grad;
    // draw wrapped so the texture tiles seamlessly
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) g.fillRect(x - r + ox, y - r + oy, r * 2, r * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  const group = new THREE.Group();
  const layers = [0.3, 0.8].map((y, i) => {
    const mat = new THREE.MeshBasicMaterial({ map: tex.clone(), transparent: true, opacity: i === 0 ? 0.16 : 0.09, depthWrite: false, fog: false, color: 0x9fb4d0 });
    mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
    mat.map.repeat.set(2 + i, 2 + i);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(110, 110), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = y;
    plane.renderOrder = 1;
    group.add(plane);
    return { mat, speed: 0.004 + i * 0.003 };
  });
  return {
    group,
    update(dt) { for (const l of layers) { l.mat.map.offset.x += l.speed * dt; l.mat.map.offset.y += l.speed * 0.4 * dt; } },
  };
}
