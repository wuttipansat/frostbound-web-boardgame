// Entry point: 3D stage + board + pieces + dice tray, wired to the UI controller.
import * as THREE from 'three';
import { createStage } from './render/stage.js';
import { createBoard } from './render/board.js';
import { createPieces } from './render/pieces.js';
import { createDiceTray } from './render/dice.js';
import { Tweens } from './render/tween.js';
import { createAmbientParticles } from './render/particles.js';
import { loadQuality } from './render/quality.js';
import { createGovernor, TIERS } from './render/perf.js';
import { createApp } from './ui/app.js';
import { createCameraRig } from './render/camera.js';
import { createAtmosphere, atmosphereFor } from './render/atmosphere.js';
import { createFootprints } from './render/footprints.js';
import { PLAYER_COLORS } from './render/pieces.js';
import { createArtStudio } from './render/art.js';
import { icon } from './ui/icons.js';
import { installTooltips } from './ui/tooltip.js';
import { sound } from './audio/sound.js';
import { c, t as tr } from './i18n/index.js';
import { LOCATION_IDS } from './core/constants.js';
import { ITEMS } from './content/items.js';
import { SECRET_OBJECTIVES } from './content/objectives.js';
import { tryReduce } from './core/reducer.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

// One graphics quality; only the pixel ratio and particle counts adapt to the device.
const quality = loadQuality();
const boot = (p) => window.__boot?.(p); // loading bar in index.html (step 22)
boot(0.35);
const stage = createStage($('scene'), { snow: params.get('snow') !== '0', quality });
// Step 22: graphics tiers. Phones / small CPUs start one tier down; "auto" adapts to measured fps.
const savedGraphics = (() => { try { return JSON.parse(localStorage.getItem('frostbound.settings.v1') ?? '{}').graphics; } catch { return null; } })();
const governor = createGovernor({
  mode: params.get('gfx') ?? savedGraphics ?? 'auto',
  start: quality.maxPixelRatio < 2 ? 'medium' : 'high',
  onTier: (tier) => { stage.setTier(tier); document.body.dataset.gfx = tier.id; },
});
stage.setTier(TIERS[governor.tier]);
document.body.dataset.gfx = governor.tier;
// Only judge fps while every frame is drawn (not while throttled behind a screen or in saver mode).
stage.onFrameTime((dt, _ms, every) => { if (every === 1) governor.sample(dt); });
boot(0.55);
const board = createBoard();
stage.scene.add(board.root);
const tweens = new Tweens();
boot(0.7);
const pieces = createPieces(board, tweens);
stage.scene.add(pieces.root);
const diceTray = createDiceTray($('dice'));
const rig = createCameraRig(stage, { board, pieces });
// Step 20: living winter — weather/day-night/bonfire follow the game; footprints follow walkers.
const atmosphere = createAtmosphere(stage, board);
// Top of whatever solid is under a print (terrain drifts, road slabs); only a few rays per walk.
const ray = new THREE.Raycaster();
const solid = (o) => o.visible && o.isMesh && !o.material?.transparent;
const groundAt = (x, z) => {
  ray.set(new THREE.Vector3(x, 6, z), new THREE.Vector3(0, -1, 0));
  const hit = ray.intersectObject(board.root, true).find((h) => solid(h.object) && h.point.y < 2);
  return hit?.point.y ?? 0;
};
const footprints = createFootprints(quality.particleScale < 1 ? 40 : 60, groundAt);
stage.scene.add(footprints.mesh);
let lastRound = 0;
let overShown = false;
function updateWinter(state) {
  const a = atmosphereFor(state);
  atmosphere.set(a);
  sound.setWeather(a.storm, a.fire);
  document.body.dataset.mood = a.mood;
  if (!state || state.round < lastRound) footprints.clear();
  lastRound = state?.round ?? 0;
  footprints.setRound(lastRound);
  const over = state?.phase === 'gameOver';
  if (over && !overShown) rig.focus({ kind: 'over', at: 'colony' });
  overShown = over;
}
const particles = createAmbientParticles({ ...board.fx, scale: quality.particleScale });
// Portraits and item pictures, rendered lazily from the voxel models and cached.
const art = createArtStudio({ quality });
installTooltips();
stage.scene.add(particles.group);

// ---------------------------------------------------------------- location badges + hover name
// Step 15: no permanent name signs. Each location keeps a small zombie badge (only when zombies are there);
// the name shows over the building that is hovered, tapped or selected.

const labels = {};
for (const id of LOCATION_IDS) {
  const el = document.createElement('div');
  el.className = 'loc-label zbadge';
  $('labels').appendChild(el);
  labels[id] = el;
}
const nameTag = document.createElement('div');
nameTag.id = 'loc-name';
nameTag.setAttribute('aria-hidden', 'true');
$('labels').appendChild(nameTag);
let hoveredLoc = null;

function refreshLabels(state) {
  for (const id of LOCATION_IDS) {
    const z = state?.locations[id].zombies ?? 0;
    labels[id].replaceChildren();
    labels[id].classList.toggle('empty', !z);
    labels[id].dataset.loc = id;
    if (z) labels[id].append(icon('skull'), String(z));
    labels[id].setAttribute('aria-label', `${c('locations', id, 'name')}: ${z}`);
  }
}

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const SCENE_ICON = { move: 'move', attack: 'attack', search: 'search', barricade: 'barricade', clean: 'clean', lure: 'lure', play: 'check', contribute: 'crisis', deposit: 'goal' };

/** A short floating callout over where a scene happens: who (colour + face), what (icon), the result. */
function sceneCallout(ev, state) {
  const el = document.createElement('div');
  el.className = `scene-callout k-${ev.kind}`;
  const pIdx = state.players.findIndex((p) => p.id === ev.playerId);
  const dot = document.createElement('span');
  dot.className = 'dot';
  if (pIdx >= 0) dot.style.background = hex(PLAYER_COLORS[pIdx]);
  el.append(dot);
  if (ev.survivorId) el.append(art.portrait(ev.survivorId, 's', { cls: 'sc-face', alt: '' }));
  el.append(icon(SCENE_ICON[ev.kind] ?? 'check'));
  const res = document.createElement('b');
  const cardBacks = (n) => Array.from({ length: Math.min(n, 3) }, (_, i) => { const cb = document.createElement('i'); cb.className = 'card-back'; cb.style.setProperty('--k', i); return cb; });
  switch (ev.kind) {
    case 'move': res.append(c('locations', ev.to, 'name')); break;
    case 'attack': res.append(`−${ev.n}`, icon('skull')); break;
    case 'search': el.append(...cardBacks(ev.n)); res.append(tr('scene.cards', { n: ev.n })); break;
    case 'barricade': res.append(`+${ev.n}`); break;
    case 'clean': res.append(`−${ev.n}`, icon('waste')); break;
    case 'lure': res.append(`${ev.n}`, icon('skull'), ' → ', c('locations', ev.to, 'name')); break;
    case 'contribute': el.append(...cardBacks(1)); break;
    case 'play': case 'deposit': if (ev.card) { el.append(art.item(ev.card, 's', { cls: 'sc-item', alt: '' })); res.append(c('items', ev.card, 'name')); } break;
    default: break;
  }
  if (res.childNodes.length) el.append(res);
  return el;
}

/** Effects + callout for one scene of the presentation queue (see ui/director.js). */
function playScene(ev, state) {
  if (ev.kind === 'move' && board.layout[ev.from] && board.layout[ev.to]) footprints.walk(board.layout[ev.from].center, board.layout[ev.to].center, ev.duration ?? 1.2);
  if (ev.kind === 'exposure') { exposureFx(ev.survivorId, ev.face); return; }
  if (ev.kind === 'turn') return;
  if (ev.kind === 'attack' && ev.survivorId && ev.n) pieces.burstAt(ev.survivorId, [0x8e1b1b, 0xb3202a, 0x6f8a4e], 16, 1.2);
  if (!ev.watch) return; // your own move: the pieces' animation says enough
  const el = sceneCallout(ev, state);
  $('fx-layer').appendChild(el);
  const obj = ev.kind === 'move' && ev.survivorId ? pieces.survivorObject(ev.survivorId) : null;
  const lay = board.layout[ev.at] ?? board.layout.colony;
  popups.push({ el, obj, fallback: lay.label.clone(), y: obj ? 3.4 : 7, ttl: Math.max(0.8, ev.duration ?? 1.2) });
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
// The dice stage floats over the board while dice roll, holds the result, then fades away.
const diceStage = $('dice-stage');
let diceTimer = null;
let diceStarted = 0;
// Timers, not frames: the stage must also go away if rendering is paused. Never longer than 6 s.
function watchDice() {
  clearTimeout(diceTimer);
  diceTimer = setTimeout(() => {
    // Still rolling: keep watching. Settled: hold the result ~1.6 s so it can be read, then fade.
    if ((diceTray.busy || diceTray.exposureBusy) && performance.now() - diceStarted < 6000) watchDice();
    else diceTimer = setTimeout(() => diceStage.classList.remove('on'), 1600);
  }, 200);
}
function showDice() {
  diceStage.classList.add('on');
  diceStarted = performance.now();
  watchDice();
}
diceStage.addEventListener('click', () => { clearTimeout(diceTimer); diceStage.classList.remove('on'); });

function exposureFx(survivorId, face) {
  showDice();
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
  graphics: governor,
  aiFast: params.get('ai') === 'fast', // debug/testing: AI doesn't wait for animations
  sceneScale: Math.max(0.1, Math.min(20, Number(params.get('scenes') ?? 1) || 1)), // testing: slower scenes
  fx: { exposure: exposureFx, diceRoll: showDice },
  scene: { camera: rig, play: playScene },
  dom: {
    topbar: $('topbar'), phase: $('phase'), log: $('log'), diceStage: $('dice-stage'), loc: $('locpanel'), player: $('player'), modal: $('modal'), toasts: $('toasts'), tutorial: $('tutorial'),
    movePick: $('move-pick'),
    hint: $('hint'),
    playerRefs: { head: $('pp-head'), survivors: $('pp-survivors'), chips: $('pp-chips'), hand: $('pp-hand'), actions: $('pp-actions') },
    onRender: (state) => {
      updateWinter(state);
      refreshLabels(state);
      for (const [id, el] of Object.entries(labels)) el.classList.toggle('active', app?.ui.selLoc === id);
    },
  },
});
refreshLabels(null);
updateWinter(null);

// Step 22: behind an opaque full-screen panel (pass the device, draft, objective reveal) draw 1 frame in 4.
let coverCheck = 0;
stage.onFrame(() => {
  if (++coverCheck % 15) return;
  stage.setIdle(document.querySelector('.backdrop.pass, .draft-screen, .obj-reveal') ? 4 : 1);
});
stage.onFrame((t, dt) => {
  tweens.update(dt);
  rig.update(dt);
  atmosphere.update(dt);
  footprints.update(dt);
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
    v.copy(pos).setY(p.y ?? 3.1).project(stage.camera);
    p.el.style.left = `${((v.x + 1) / 2) * cw}px`;
    p.el.style.top = `${((1 - v.y) / 2) * ch}px`;
  }
});
const PANELS = ['topbar', 'pp-left', 'pp-hand', 'pp-actions', 'locpanel', 'log', 'pp-survivors'].map((id) => document.getElementById(id));
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
  // The name of the hovered (or selected) location, over its building, with its zombie count.
  const named = app?.state ? (hoveredLoc ?? app.ui.selLoc) : null;
  nameTag.classList.toggle('on', !!named);
  if (named) {
    const z = app.state.locations[named]?.zombies ?? 0;
    const key = `${named}:${z}:${document.documentElement.lang}`;
    if (nameTag.dataset.key !== key) {
      nameTag.dataset.key = key;
      nameTag.replaceChildren(c('locations', named, 'name'));
      if (z) { const zs = document.createElement('span'); zs.className = 'z'; zs.append(icon('skull'), String(z)); nameTag.append(zs); }
    }
    v.copy(board.layout[named].label).project(stage.camera);
    nameTag.style.left = `${((v.x + 1) / 2) * w}px`;
    nameTag.style.top = `${Math.max(((1 - v.y) / 2) * h, barBottom + 30)}px`;
  }
  for (const id of LOCATION_IDS) labels[id].classList.toggle('named', id === named);
  // The "who goes there" picker floats by the location's survivor pads.
  const mp = $('move-pick');
  const at = app?.ui.movePick;
  if (mp && at && !mp.classList.contains('hidden')) {
    const pads = board.layout[at].survivorSlots;
    v.set(0, 0, 0);
    for (const p of pads) v.add(p);
    v.divideScalar(pads.length || 1).setY(1.5).project(stage.camera);
    mp.style.left = `${Math.min(w - mp.offsetWidth / 2 - 8, Math.max(mp.offsetWidth / 2 + 8, ((v.x + 1) / 2) * w))}px`;
    mp.style.top = `${Math.min(h - 120, Math.max(barBottom + 40, ((1 - v.y) / 2) * h + 26))}px`;
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
  hoveredLoc = ev.pointerType === 'mouse' ? p.locationId : null;
  canvas.style.cursor = p.survivorId || p.locationId ? 'pointer' : 'grab';
});
canvas.addEventListener('pointerleave', () => { hoveredLoc = null; });
// While someone else's move plays: a click skips it, holding the pointer down plays it faster.
let holdTimer = 0;
let held = false;
canvas.addEventListener('pointerdown', (ev) => {
  downAt = [ev.clientX, ev.clientY];
  clearTimeout(holdTimer);
  if (app.watching) holdTimer = setTimeout(() => { held = true; app.sceneHold(true); }, 320);
});
canvas.addEventListener('pointerup', (ev) => {
  clearTimeout(holdTimer);
  if (held) { held = false; app.sceneHold(false); return; }
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
    const size = 0.075;
    const add = (model, x, z) => { const o = model.build({ size, jitter: 0 }); o.position.set(x, 0, z); g.add(o); };
    SURVIVORS.forEach((s, i) => add(survivorModelHD(s), (i % 10 - 4.5) * 3, Math.floor(i / 10) * 5.5 - 6));
    [0, 1, 2, 3, 4].forEach((v, i) => add(zombieModelHD(v), (i - 2) * 3.4, 5.5));
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

if (params.get('play')) {
  app.quickStart({
    seats: params.get('play'), scenarioId: params.get('scenario') ?? 'beacon',
    seed: Number(params.get('seed') ?? 1), lang: params.get('lang') ?? undefined,
  });
}
// Browsers only allow audio after a user gesture; UI buttons give a soft click.
window.addEventListener('pointerdown', () => sound.unlock());
document.addEventListener('click', (ev) => { if (ev.target.closest?.('button')) sound.play('ui'); });

window.__frostbound = { OBJECTIVES: SECRET_OBJECTIVES, rig, stage, atmosphere, footprints, groundAt, ray, board, pieces, diceTray, tweens, app, art, tryReduce, itemType: (defId) => ITEMS[defId]?.type };

// Step 22: the first frame is on screen — drop the loading screen. A hidden tab draws nothing and
// pauses the ambience.
boot(0.9);
requestAnimationFrame(() => requestAnimationFrame(() => boot(1)));
document.addEventListener('visibilitychange', () => sound.pause(document.hidden));
