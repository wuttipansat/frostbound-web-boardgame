// Entry point: 3D stage + board + pieces + dice tray, wired to the UI controller.
import * as THREE from 'three';
import { createStage } from './render/stage.js';
import { createBoard } from './render/board.js';
import { createPieces } from './render/pieces.js';
import { createDiceTray } from './render/dice.js';
import { Tweens } from './render/tween.js';
import { createAmbientParticles } from './render/particles.js';
import { loadQuality } from './render/quality.js';
import { createApp } from './ui/app.js';
import { createArtStudio } from './render/art.js';
import { icon } from './ui/icons.js';
import { installTooltips } from './ui/tooltip.js';
import { sound } from './audio/sound.js';
import { c, t as tr } from './i18n/index.js';
import { LOCATION_IDS } from './core/constants.js';
import { ITEMS } from './content/items.js';
import { tryReduce } from './core/reducer.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

// Graphics tier (Low / Medium / High) decides model resolution, lighting and post-processing.
const quality = loadQuality();
document.documentElement.dataset.quality = quality.id;
const stage = createStage($('scene'), { snow: params.get('snow') !== '0', quality });
const board = createBoard({ quality });
stage.scene.add(board.root);
const tweens = new Tweens();
const pieces = createPieces(board, tweens, { hd: quality.hd });
stage.scene.add(pieces.root);
const diceTray = createDiceTray($('dice'), { hd: quality.hd });
const particles = createAmbientParticles({ ...board.fx, scale: quality.particleScale });
// Portraits and item pictures, rendered lazily from the voxel models and cached.
const art = createArtStudio({ quality });
installTooltips();
stage.scene.add(particles.group);

// ---------------------------------------------------------------- location labels

const labels = {};
for (const id of LOCATION_IDS) {
  const el = document.createElement('div');
  el.className = 'loc-label';
  $('labels').appendChild(el);
  labels[id] = el;
}
function refreshLabels(state) {
  for (const id of LOCATION_IDS) {
    const z = state?.locations[id].zombies ?? 0;
    labels[id].innerHTML = '';
    labels[id].append(c('locations', id, 'name'));
    if (z) {
      const span = document.createElement('span');
      span.className = 'z';
      span.append(icon('skull'), String(z));
      labels[id].append(span);
    }
  }
}

// ---------------------------------------------------------------- app

// ---------------------------------------------------------------- exposure popups

const FX_ICON = { blank: 'check', wound: 'heal', frostbite: 'snowflake', bite: 'skull' };
const FX_BURST = {
  blank: [0xf2f6fc],
  wound: [0xb3202a, 0xe0605a],
  frostbite: [0x9fd4ff, 0xe8f6ff],
  bite: [0x5a0f12, 0x8e1b1b, 0x6f8a4e],
};
const popups = [];
function exposureFx(survivorId, face) {
  const obj = pieces.survivorObject(survivorId);
  const fallback = obj ? obj.position.clone() : new THREE.Vector3();
  // The die tumbles in the tray first; the verdict then floats up over the survivor.
  diceTray.rollExposure(face).then(() => {
    pieces.burstAt(survivorId, FX_BURST[face], face === 'bite' ? 30 : 18, face === 'bite' ? 1.5 : 1.1);
    const el = document.createElement('div');
    el.className = `fx-pop f-${face}`;
    el.append(art.portrait(survivorId, 's', { cls: 'fx-face', alt: '' }), icon(FX_ICON[face]), ` ${c('survivors', survivorId, 'name')} · ${tr(`fx.${face}`)}`);
    $('fx-layer').appendChild(el);
    popups.push({ el, obj, fallback, ttl: 2.6 });
  });
}

const app = createApp({
  board, pieces, diceTray, art,
  aiFast: params.get('ai') === 'fast', // debug/testing: AI doesn't wait for animations
  quality: quality.id,
  fx: { exposure: exposureFx },
  dom: {
    topbar: $('topbar'), log: $('log'), loc: $('locpanel'), player: $('player'), modal: $('modal'), toasts: $('toasts'), tutorial: $('tutorial'),
    playerRefs: { head: $('pp-head'), survivors: $('pp-survivors'), chips: $('pp-chips'), hand: $('pp-hand'), actions: $('pp-actions') },
    onRender: (state) => {
      refreshLabels(state);
      for (const [id, el] of Object.entries(labels)) el.classList.toggle('active', app?.ui.selLoc === id);
    },
  },
});
refreshLabels(null);

stage.onFrame((t, dt) => {
  tweens.update(dt);
  board.update(t);
  pieces.update(t, dt);
  particles.update(dt, stage.renderer.getPixelRatio() * stage.camera.zoom);
  app.tick(dt);
});

const v = new THREE.Vector3();
stage.onFrame((_t, dt) => {
  const { clientWidth: cw, clientHeight: ch } = stage.renderer.domElement;
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    if ((p.ttl -= dt) <= 0) { p.el.remove(); popups.splice(i, 1); continue; }
    const pos = p.obj?.parent ? p.obj.position : p.fallback;
    v.copy(pos).setY(3.1).project(stage.camera);
    p.el.style.left = `${((v.x + 1) / 2) * cw}px`;
    p.el.style.top = `${((1 - v.y) / 2) * ch}px`;
  }
});
const PANELS = ['topbar', 'player', 'locpanel', 'log'].map((id) => document.getElementById(id));
stage.onFrame(() => {
  const { clientWidth: w, clientHeight: h } = stage.renderer.domElement;
  const rects = PANELS.filter((el) => el && !el.classList.contains('hidden') && el.offsetWidth).map((el) => el.getBoundingClientRect());
  const barBottom = document.getElementById('topbar').getBoundingClientRect().bottom;
  for (const id of LOCATION_IDS) {
    v.copy(board.layout[id].label).project(stage.camera);
    const x = ((v.x + 1) / 2) * w;
    // Labels hang above their anchor (translate -100%): keep the whole pill below the top bar.
    const y = Math.max(((1 - v.y) / 2) * h, barBottom + 30);
    labels[id].style.left = `${x}px`;
    labels[id].style.top = `${y}px`;
    // Label box (it hangs above its anchor, centred): fade it if it touches any panel.
    const lw = labels[id].offsetWidth; const lh = labels[id].offsetHeight;
    const box = { left: x - lw / 2, right: x + lw / 2, top: y - lh, bottom: y };
    const covered = rects.some((r) => box.left < r.right && box.right > r.left && box.top < r.bottom && box.bottom > r.top);
    labels[id].classList.toggle('covered', covered);
  }
});

// ---------------------------------------------------------------- picking

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const canvas = stage.renderer.domElement;
function pick(ev) {
  const r = canvas.getBoundingClientRect();
  pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, stage.camera);
  const survivorId = pieces.pick(raycaster);
  const locationId = raycaster.intersectObjects(board.pickTargets, false)[0]?.object.userData.locationId ?? null;
  return { survivorId, locationId };
}
let downAt = null;
canvas.addEventListener('pointermove', (ev) => {
  const p = pick(ev);
  board.setHovered(p.locationId);
  canvas.style.cursor = p.survivorId || p.locationId ? 'pointer' : 'grab';
});
canvas.addEventListener('pointerdown', (ev) => { downAt = [ev.clientX, ev.clientY]; });
canvas.addEventListener('pointerup', (ev) => {
  if (!downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 6) return;
  app.onBoardPick(pick(ev));
});

// ---------------------------------------------------------------- dev / screenshot helpers
// ?play=HHA  quick-starts a game (H = human seat, A = AI seat); ?scenario=, ?seed=, ?lang=th

// ---------------------------------------------------------------- dev: character line-up (?lineup)

if (params.has('lineup')) {
  import('./render/characters.js').then(({ survivorModel, survivorModelHD, zombieModel, zombieModelHD }) => import('./content/survivors.js').then(({ SURVIVORS }) => {
    board.root.visible = false;
    pieces.root.visible = false;
    const g = new THREE.Group();
    const ground = new THREE.Mesh(new THREE.BoxGeometry(36, 1, 22), new THREE.MeshLambertMaterial({ color: 0xe9f0f8 }));
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    g.add(ground);
    const size = quality.hd ? 0.075 : 0.15;
    const add = (model, x, z) => { const o = model.build({ size, jitter: quality.hd ? 0 : 0.05 }); o.position.set(x, 0, z); g.add(o); };
    SURVIVORS.forEach((s, i) => add(quality.hd ? survivorModelHD(s) : survivorModel(s), (i % 10 - 4.5) * 3, Math.floor(i / 10) * 5.5 - 6));
    [0, 1, 2, 3, 4].forEach((v, i) => add(quality.hd ? zombieModelHD(v) : zombieModel(v % 3), (i - 2) * 3.4, 5.5));
    const front = new THREE.DirectionalLight(0xffe6c8, 1.8);
    front.position.set(10, 25, 60);
    g.add(front);
    stage.scene.add(g);
    stage.camera.position.set(0, 45, 100);
    stage.controls.target.set(0, 1, 0);
    stage.camera.zoom = Number(params.get('zoom') ?? 3.1);
    stage.camera.updateProjectionMatrix();
    stage.controls.update();
    for (const id of ['player', 'topbar', 'labels', 'modal', 'tutorial']) document.getElementById(id)?.classList.add('hidden');
  }));
}

// After a graphics change the page reloads; pick the autosaved game straight back up.
try {
  if (sessionStorage.getItem('frostbound.resume')) {
    sessionStorage.removeItem('frostbound.resume');
    app.continueGame();
  }
} catch { /* storage unavailable */ }

if (params.get('play')) {
  app.quickStart({
    seats: params.get('play'), scenarioId: params.get('scenario') ?? 'beacon',
    seed: Number(params.get('seed') ?? 1), lang: params.get('lang') ?? undefined,
  });
}
// Browsers only allow audio after a user gesture; UI buttons give a soft click.
window.addEventListener('pointerdown', () => sound.unlock());
document.addEventListener('click', (ev) => { if (ev.target.closest?.('button')) sound.play('ui'); });

window.__frostbound = { stage, board, pieces, diceTray, tweens, app, art, tryReduce, itemType: (defId) => ITEMS[defId]?.type };
