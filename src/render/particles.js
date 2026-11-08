// Ambient particle effects: campfire embers, chimney smoke, gate-torch sparks.
// One THREE.Points per effect with a tiny shader for per-particle size, colour and alpha.
import * as THREE from 'three';

const VERT = /* glsl */`
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  uniform float uScale;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale;
  }
`;
const FRAG = /* glsl */`
  varying float vAlpha;
  varying vec3 vColor;
  uniform float uSoft;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    // uSoft = 0 -> crisp square-ish voxel spark, 1 -> soft round puff
    float a = mix(step(d, 0.42), smoothstep(0.5, 0.0, d), uSoft);
    gl_FragColor = vec4(vColor, vAlpha * a);
  }
`;

class Emitter {
  constructor({ count, blending = THREE.NormalBlending, soft = 1, spawn, step }) {
    this.count = count;
    this.spawn = spawn;
    this.step = step;
    this.parts = Array.from({ length: count }, () => ({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), size: 1, color: new THREE.Color() }));
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(count * 3);
    this.size = new Float32Array(count);
    this.alpha = new Float32Array(count);
    this.col = new Float32Array(count * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending,
      uniforms: { uScale: { value: 1 }, uSoft: { value: soft } },
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    // Stagger initial lifetimes so the effect starts "warm".
    this.parts.forEach((q) => { this.spawn(q); q.life = Math.random() * q.max; });
  }

  update(dt, scale) {
    this.material.uniforms.uScale.value = scale;
    this.parts.forEach((q, i) => {
      q.life -= dt;
      if (q.life <= 0) this.spawn(q);
      this.step(q, dt);
      const k = Math.max(0, q.life / q.max); // 1 -> 0 over its life
      this.pos.set([q.p.x, q.p.y, q.p.z], i * 3);
      this.size[i] = q.sizeAt ? q.sizeAt(k) : q.size;
      this.alpha[i] = q.alphaAt ? q.alphaAt(k) : k;
      this.col.set([q.color.r, q.color.g, q.color.b], i * 3);
    });
    const g = this.points.geometry;
    for (const a of ['position', 'aSize', 'aAlpha', 'aColor']) g.attributes[a].needsUpdate = true;
  }
}

const rand = (a, b) => a + Math.random() * (b - a);

export function createAmbientParticles({ fire, chimneys = [], torches = [] }) {
  const group = new THREE.Group();
  group.name = 'particles';

  const EMBER = [new THREE.Color(0xffd04a), new THREE.Color(0xff8a2a), new THREE.Color(0xff5a1a)];
  const embers = new Emitter({
    count: 70, blending: THREE.AdditiveBlending, soft: 0.25,
    spawn: (q) => {
      q.max = rand(0.9, 2.2);
      q.life = q.max;
      q.p.set(fire.x + rand(-0.5, 0.5), fire.y + rand(0, 0.4), fire.z + rand(-0.5, 0.5));
      q.v.set(rand(-0.25, 0.25), rand(1.2, 2.6), rand(-0.25, 0.25));
      q.size = rand(2.5, 5);
      q.color.copy(EMBER[Math.floor(Math.random() * EMBER.length)]);
      q.seed = Math.random() * 10;
    },
    step: (q, dt) => {
      q.v.x += Math.sin((q.life + q.seed) * 6) * dt * 0.8; // flutter
      q.p.addScaledVector(q.v, dt);
      q.v.y *= 1 - dt * 0.4;
    },
  });
  embers.parts.forEach((q) => { q.alphaAt = (k) => Math.min(1, k * 2.2) * (0.6 + 0.4 * Math.sin(q.life * 30 + q.seed)); });

  const smokeColor = new THREE.Color(0x8a96a8);
  const smoke = chimneys.length ? new Emitter({
    count: 26 * chimneys.length, soft: 1,
    spawn: (q) => {
      const c = chimneys[Math.floor(Math.random() * chimneys.length)];
      q.max = rand(3, 5);
      q.life = q.max;
      q.p.set(c.x + rand(-0.15, 0.15), c.y, c.z + rand(-0.15, 0.15));
      q.v.set(rand(0.15, 0.45), rand(0.6, 0.9), rand(-0.1, 0.15)); // drift with the wind
      q.color.copy(smokeColor);
      q.base = rand(14, 22);
    },
    step: (q, dt) => { q.p.addScaledVector(q.v, dt); q.v.y *= 1 - dt * 0.15; },
  }) : null;
  smoke?.parts.forEach((q) => {
    q.sizeAt = (k) => q.base * (1.6 - k);
    q.alphaAt = (k) => Math.min(1, (1 - k) * 6) * k * 0.55;
  });

  const sparks = torches.length ? new Emitter({
    count: 6 * torches.length, blending: THREE.AdditiveBlending, soft: 0.3,
    spawn: (q) => {
      const c = torches[Math.floor(Math.random() * torches.length)];
      q.max = rand(0.4, 0.9);
      q.life = q.max;
      q.p.set(c.x + rand(-0.1, 0.1), c.y, c.z + rand(-0.1, 0.1));
      q.v.set(rand(-0.2, 0.2), rand(0.8, 1.5), rand(-0.2, 0.2));
      q.size = rand(2, 3.5);
      q.color.copy(EMBER[Math.floor(Math.random() * 2)]);
    },
    step: (q, dt) => q.p.addScaledVector(q.v, dt),
  }) : null;

  const emitters = [embers, smoke, sparks].filter(Boolean);
  for (const e of emitters) group.add(e.points);

  return {
    group,
    /** pixelScale: renderer pixel ratio × camera zoom, so particles scale with the view. */
    update(dt, pixelScale) { for (const e of emitters) e.update(dt, pixelScale); },
    get count() { return emitters.reduce((n, e) => n + e.count, 0); },
  };
}
