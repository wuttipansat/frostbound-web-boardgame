// Generated artwork: character portraits (survivors + zombies) and item pictures, painted from the
// voxel models on the CPU (2D canvas, no extra WebGL context), lazily when the browser is idle, cached.
import { survivorModel, survivorModelHD, zombieModelV, zombieModelHD } from './characters.js';
import { SURVIVORS_BY_ID } from '../content/survivors.js';

export const ART_SIZES = { s: 64, l: 160 };

export const artKey = ({ kind, id, size, tier }) => `${kind}:${id}:${size}:${tier}`;

/**
 * Pure cache + job queue (no DOM): each key is rendered at most once; requests while pending just wait.
 * render(spec) -> result (string URL). schedule(fn) decides when the next job runs (idle callback in the
 * browser, manual pump in tests).
 */
/** URL of a survivor's pixel-art portrait sprite (relative, so it works under any base path). */
export const portraitUrl = (id) => `./portraits/${id}.png`;
/** URL of an item's pixel-art sprite. */
export const itemUrl = (id) => `./items/${id}.png`;

export class ArtCache {
  constructor(render, { schedule = null, now = () => Date.now() } = {}) {
    this.render = render;
    this.schedule = schedule;
    this.now = now;
    this.done = new Map();
    this.queue = [];
    this.queued = new Set();
    this.listeners = new Set();
    this.stats = { rendered: 0, totalMs: 0, maxMs: 0 };
    this.scheduled = false;
  }

  /** Cached result, or null after queueing the render. */
  get(spec) {
    const key = artKey(spec);
    if (this.done.has(key)) return this.done.get(key);
    if (!this.queued.has(key)) {
      this.queued.add(key);
      this.queue.push({ key, spec });
      this.kick();
    }
    return null;
  }

  onReady(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  kick() {
    if (this.scheduled || !this.schedule || !this.queue.length) return;
    this.scheduled = true;
    this.schedule(() => { this.scheduled = false; this.pump(); this.kick(); });
  }

  /** Render one queued job. Returns false when the queue is empty. */
  pump() {
    const job = this.queue.shift();
    if (!job) return false;
    const t0 = this.now();
    const url = this.render(job.spec);
    const ms = this.now() - t0;
    this.stats.rendered += 1;
    this.stats.totalMs += ms;
    this.stats.maxMs = Math.max(this.stats.maxMs, ms);
    this.done.set(job.key, url);
    this.queued.delete(job.key);
    for (const fn of this.listeners) fn(job.key, url);
    return true;
  }
}

// ---------------------------------------------------------------- CPU projection (pure, testable)

const toSRGB = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/**
 * Project a voxel BufferGeometry (quads of 4 vertices, as emitted by VoxelModel.buildGeometries with
 * greedy:false) into screen-space polygons for a 3/4 orthographic view, sorted back-to-front.
 * Back faces are dropped. Returns { quads: [{ pts:[[x,y]×4], depth, rgb:[r,g,b], normal }], bounds }.
 */
export function projectQuads(geo, { az = -0.5, el = 0.15, glow = false } = {}) {
  const pos = geo.attributes.position.array;
  const nrm = geo.attributes.normal.array;
  const col = geo.attributes.color.array;
  const ca = Math.cos(az); const sa = Math.sin(az); const ce = Math.cos(el); const se = Math.sin(el);
  // view direction (from the camera into the scene) in model space
  const view = [-sa * ce, -se, -ca * ce];
  const quads = [];
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (let q = 0; q < pos.length / 12; q++) {
    const i = q * 12;
    const n = [nrm[i], nrm[i + 1], nrm[i + 2]];
    if (n[0] * view[0] + n[1] * view[1] + n[2] * view[2] >= -1e-6) continue; // facing away
    const pts = [];
    let depth = 0; let r = 0; let g = 0; let b = 0;
    for (let k = 0; k < 4; k++) {
      const x = pos[i + k * 3]; const y = pos[i + k * 3 + 1]; const z = pos[i + k * 3 + 2];
      // rotate around Y by az, then tilt around X by el
      const rx = x * ca - z * sa;
      const rz = x * sa + z * ca;
      const ry = y * ce - rz * se;
      const dz = y * se + rz * ce;
      pts.push([rx, -ry]);
      depth += dz;
      r += col[i + k * 3]; g += col[i + k * 3 + 1]; b += col[i + k * 3 + 2];
      bounds.minX = Math.min(bounds.minX, rx); bounds.maxX = Math.max(bounds.maxX, rx);
      bounds.minY = Math.min(bounds.minY, -ry); bounds.maxY = Math.max(bounds.maxY, -ry);
    }
    quads.push({ pts, depth: depth / 4, rgb: [r / 4, g / 4, b / 4], normal: n, glow });
  }
  quads.sort((a, b) => a.depth - b.depth); // far (small depth) first
  return { quads, bounds };
}

// ---------------------------------------------------------------- browser studio

const ZOMBIE_TINTS = ['#3f5a32', '#5a2a2a', '#344a3a', '#4a2f3a', '#3a4a2a'];
// Cold rim light coming from the back-right of the view.
const RIM = [0.75, 0.25, -0.6];

export function createArtStudio({ quality }) {
  const hd = !!quality?.hd;
  const tier = quality?.id ?? 'low';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const out = document.createElement('canvas');
  // CPU-backed canvas: small images paint faster in software than through the GPU raster path.
  const g = out.getContext('2d', { willReadFrequently: true });
  const projCache = new Map();

  function modelFor(kind, id) {
    if (kind === 'survivor') return hd ? survivorModelHD(SURVIVORS_BY_ID[id]) : survivorModel(SURVIVORS_BY_ID[id]);
    if (kind === 'zombie') return hd ? zombieModelHD(Number(id)) : zombieModelV(Number(id));
    throw new Error(`no model for ${kind}`);
  }

  /** Projected quads per model (shared by both sizes). */
  function projected(kind, id) {
    const k = `${kind}:${id}`;
    if (!projCache.has(k)) {
      const { lit, glow } = modelFor(kind, id).buildGeometries({ size: 1, jitter: 0, greedy: false, ao: true });
      const view = kind === 'item' ? { az: 0.62, el: 0.52 } : { az: -0.5, el: 0.14 };
      const a = projectQuads(lit, view);
      const b = glow ? projectQuads(glow, { ...view, glow: true }) : { quads: [], bounds: a.bounds };
      const quads = a.quads.concat(b.quads).sort((x, y) => x.depth - y.depth);
      const bounds = {
        minX: Math.min(a.bounds.minX, b.bounds.minX), maxX: Math.max(a.bounds.maxX, b.bounds.maxX),
        minY: Math.min(a.bounds.minY, b.bounds.minY), maxY: Math.max(a.bounds.maxY, b.bounds.maxY),
      };
      projCache.set(k, { quads, bounds });
    }
    return projCache.get(k);
  }

  function background(kind, id, px) {
    if (kind === 'item') { g.clearRect(0, 0, px, px); return; }
    const tint = kind === 'zombie' ? ZOMBIE_TINTS[Number(id) % ZOMBIE_TINTS.length] : SURVIVORS_BY_ID[id].accent;
    const grad = g.createRadialGradient(px * 0.5, px * 0.36, px * 0.05, px * 0.5, px * 0.55, px * 0.78);
    grad.addColorStop(0, tint);
    grad.addColorStop(1, '#0b1424');
    g.fillStyle = grad;
    g.fillRect(0, 0, px, px);
    g.fillStyle = 'rgba(220, 235, 255, 0.10)';
    for (let i = 0; i < 18; i++) g.fillRect((i * 37) % px, (i * 53) % (px * 0.4), px / 40, px / 40);
  }

  function render({ kind, id, size }) {
    const px = Math.round(ART_SIZES[size] * dpr);
    out.width = px; out.height = px;
    background(kind, id, px);
    const { quads, bounds } = projected(kind, id);
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    let scale; let ox; let oy;
    if (kind === 'item') {
      scale = (px * 0.86) / Math.max(w, h);
      ox = px / 2 - (bounds.minX + w / 2) * scale;
      oy = px / 2 - (bounds.minY + h / 2) * scale;
    } else {
      // Bust: frame the top part of the figure (head and shoulders), slightly below centre.
      const bust = h * (kind === 'zombie' ? 0.6 : 0.55);
      scale = (px * 0.92) / Math.max(bust, w * 0.9);
      ox = px / 2 - (bounds.minX + w / 2) * scale;
      oy = px * 0.06 - bounds.minY * scale;
    }
    g.lineJoin = 'round';
    g.lineWidth = Math.max(0.6, scale * 0.06); // a hairline stroke in the fill colour hides AA seams
    for (const q of quads) {
      let [r, gg, b] = q.rgb;
      if (!q.glow) {
        const rim = Math.max(0, q.normal[0] * RIM[0] + q.normal[1] * RIM[1] + q.normal[2] * RIM[2]);
        r = r * 1.15 + rim * 0.10; gg = gg * 1.15 + rim * 0.16; b = b * 1.15 + rim * 0.28;
      }
      const style = `rgb(${Math.round(Math.min(1, toSRGB(r)) * 255)},${Math.round(Math.min(1, toSRGB(gg)) * 255)},${Math.round(Math.min(1, toSRGB(b)) * 255)})`;
      g.beginPath();
      g.moveTo(q.pts[0][0] * scale + ox, q.pts[0][1] * scale + oy);
      for (let k = 1; k < 4; k++) g.lineTo(q.pts[k][0] * scale + ox, q.pts[k][1] * scale + oy);
      g.closePath();
      g.fillStyle = style;
      g.strokeStyle = style;
      g.fill();
      g.stroke();
    }
    // Glowing voxels (eyes, flames, lit windows) get one soft additive halo pass.
    const glows = quads.filter((q) => q.glow);
    if (glows.length) {
      g.globalCompositeOperation = 'lighter';
      for (const q of glows) {
        const cx = ((q.pts[0][0] + q.pts[2][0]) / 2) * scale + ox;
        const cy = ((q.pts[0][1] + q.pts[2][1]) / 2) * scale + oy;
        const rr = scale * 1.6;
        const halo = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
        halo.addColorStop(0, 'rgba(255, 190, 110, 0.35)');
        halo.addColorStop(1, 'rgba(255, 190, 110, 0)');
        g.fillStyle = halo;
        g.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
      }
      g.globalCompositeOperation = 'source-over';
    }
    if (kind !== 'item') {
      // soft vignette so the bust sits in the frame
      const v = g.createRadialGradient(px / 2, px / 2, px * 0.35, px / 2, px / 2, px * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(5,10,20,0.55)');
      g.fillStyle = v;
      g.fillRect(0, 0, px, px);
    }
    return out.toDataURL('image/png');
  }

  const schedule = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 200 }) : setTimeout(fn, 16));
  const cache = new ArtCache(render, { schedule, now: () => performance.now() });

  /** <img> element for an artwork; shows a soft placeholder until the render is ready. */
  function img(spec, { cls = '', alt = '' } = {}) {
    const full = { tier, size: 's', ...spec };
    const el = document.createElement('img');
    el.className = `art art-${full.kind} art-${full.size} ${cls}`;
    el.alt = alt;
    el.decoding = 'async';
    el.dataset.art = artKey(full);
    const url = cache.get(full);
    if (url) el.src = url; else el.classList.add('pending');
    return el;
  }

  // When an image finishes, fill every waiting <img> with that key (no full UI re-render).
  cache.onReady((k, url) => {
    for (const el of document.querySelectorAll(`img[data-art="${CSS.escape(k)}"]`)) { el.src = url; el.classList.remove('pending'); }
  });

  return {
    cache,
    img,
    /** Survivor portraits are hand-made 64×64 pixel sprites (public/portraits/<id>.png), not renders. */
    portrait: (id, size = 's', { cls = '', alt = '' } = {}) => {
      const el = document.createElement('img');
      el.className = `art art-survivor art-${size} sprite ${cls}`;
      el.alt = alt;
      el.decoding = 'async';
      el.src = portraitUrl(id);
      return el;
    },
    zombie: (variant, size = 's', opts) => img({ kind: 'zombie', id: String(variant), size }, opts),
    /** Items are hand-made 64×64 pixel sprites (public/items/<id>.png). */
    item: (defId, size = 's', { cls = '', alt = '' } = {}) => {
      const el = document.createElement('img');
      el.className = `art art-item art-${size} sprite ${cls}`;
      el.alt = alt;
      el.decoding = 'async';
      el.src = itemUrl(defId);
      return el;
    },
    /** Warm the cache in the background (e.g. small portraits for the current players). */
    prefetch(specs) { for (const s of specs) cache.get({ tier, size: 's', ...s }); },
    get stats() { return { ...cache.stats, queued: cache.queue.length }; },
  };
}
