// Renderer, orthographic "diorama" camera with limited orbit/zoom/pan, lighting, fog and snowfall.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { P } from './palette.js';
import { MATERIALS } from './voxel.js';
import { QUALITY_TIERS } from './quality.js';

const VIEW_HEIGHT = 62; // world units visible vertically at zoom 1
const PAN_LIMIT = 24;

export function createStage(canvas, { snow = true, quality = { id: 'low', ...QUALITY_TIERS.low } } = {}) {
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
  scene.background = q.sky ? skyTexture() : new THREE.Color(P.night);
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
  moon.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
  // Tight to the plateau (radius 46) to keep shadow texels dense.
  Object.assign(moon.shadow.camera, { left: -49, right: 49, top: 49, bottom: -49, near: 20, far: 170 });
  if (q.softShadows) moon.shadow.radius = 3;
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.04;
  scene.add(moon);
  scene.add(moon.target);

  // Cold rim light from behind the board: outlines silhouettes against the dark.
  if (q.hd) {
    const rim = new THREE.DirectionalLight(0x7f9fe0, 0.55);
    rim.position.set(-55, 18, -70);
    scene.add(rim);
  }

  const snowfall = snow ? createSnow(q.snowFlakes) : null;
  if (snowfall) scene.add(snowfall.group);
  const mist = q.mist ? createMist() : null;
  if (mist) scene.add(mist.group);

  // Post-processing (Medium / High): bloom -> grade + vignette (+ tilt-shift) -> tone map.
  let composer = null;
  let bloom = null;
  let grade = null;
  if (q.post) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    // Threshold above 1.0: only boosted glow voxels (fire, windows, eyes) bloom, not firelit snow.
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), q.post.bloom, 0.5, 1.05);
    composer.addPass(bloom);
    grade = new ShaderPass(GradeShader);
    grade.uniforms.uTilt.value = q.post.tiltShift ? 1 : 0;
    composer.addPass(grade);
    composer.addPass(new OutputPass());
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    if (composer) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      bloom.setSize(Math.round(w / 2), Math.round(h / 2));
      grade.uniforms.uResolution.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    }
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
    snowfall?.update(dt, t);
    mist?.update(dt);
    for (const cb of frameCallbacks) cb(t, dt);
    renderer.info.reset();
    if (composer) composer.render(dt);
    else renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  return {
    renderer, scene, camera, controls, quality: q,
    onFrame(cb) { frameCallbacks.push(cb); },
    stop() { running = false; },
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
    return { ...L, pos, speed, geo };
  });
  return {
    group,
    update(dt, t) {
      const gust = Math.sin(t * 0.27) * Math.sin(t * 0.11) * 3.5 + 0.6;
      for (const L of layers) {
        const { pos, speed } = L;
        for (let i = 0; i < L.n; i++) {
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

/** Colour grade (cool shadows, warm highlights, a touch of saturation), vignette, optional tilt-shift. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTilt: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTilt;
    uniform vec2 uResolution;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (uTilt > 0.5) {
        // Miniature look: blur grows towards the top and bottom of the frame.
        float amt = smoothstep(0.22, 0.5, abs(vUv.y - 0.55)) * 2.5;
        if (amt > 0.01) {
          vec2 px = amt / uResolution;
          vec3 acc = c;
          acc += texture2D(tDiffuse, vUv + vec2( px.x,  0.0)).rgb;
          acc += texture2D(tDiffuse, vUv + vec2(-px.x,  0.0)).rgb;
          acc += texture2D(tDiffuse, vUv + vec2( 0.0,  px.y)).rgb;
          acc += texture2D(tDiffuse, vUv + vec2( 0.0, -px.y)).rgb;
          acc += texture2D(tDiffuse, vUv + px * 1.4).rgb;
          acc += texture2D(tDiffuse, vUv - px * 1.4).rgb;
          acc += texture2D(tDiffuse, vUv + vec2(px.x, -px.y) * 1.4).rgb;
          acc += texture2D(tDiffuse, vUv + vec2(-px.x, px.y) * 1.4).rgb;
          c = acc / 9.0;
        }
      }
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      vec3 cool = c * vec3(0.93, 0.98, 1.09);
      vec3 warm = c * vec3(1.07, 1.0, 0.9);
      c = mix(cool, warm, smoothstep(0.25, 0.9, l));
      c = mix(vec3(l), c, 1.1);
      float d = distance(vUv, vec2(0.5));
      c *= mix(1.0, 0.7, smoothstep(0.38, 0.85, d));
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};
