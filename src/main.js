// Entry point: 3D stage + board + pieces, wired to the UI controller.
import * as THREE from 'three';
import { createStage } from './render/stage.js';
import { createBoard } from './render/board.js';
import { createPieces } from './render/pieces.js';
import { Tweens } from './render/tween.js';
import { createAmbientParticles } from './render/particles.js';
import { loadQuality } from './render/quality.js';
import { createGovernor, TIERS } from './render/perf.js';
import { createApp } from './ui/app.js';
import { createCameraRig } from './render/camera.js';
import { createAtmosphere, atmosphereFor } from './render/atmosphere.js';
import { createFootprints } from './render/footprints.js';
import { createArtStudio } from './render/art.js';
import { icon } from './ui/icons.js';
import { installTooltips } from './ui/tooltip.js';
import { sound } from './audio/sound.js';
import { c, t as tr } from './i18n/index.js';
import { LOCATION_IDS, NEIGHBORS } from './core/constants.js';
import { ITEMS } from './content/items.js';
import { tryReduce } from './core/reducer.js';
import { actionCost, searchSpawnChance, isOverrun, isOpen } from './core/selectors.js';
import { LOCATIONS } from './content/locations.js';

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
board.onBounds = (b) => stage.view.fit(b, { snap: b.snap }); // UI-13: the usual view follows the open blocks
stage.scene.add(board.root);
const tweens = new Tweens();
boot(0.7);
const pieces = createPieces(board, tweens);
stage.scene.add(pieces.root);
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
  if (!state || state.day < lastRound) footprints.clear();
  lastRound = state?.day ?? 0;
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
  // UI-3: a small pin per place — zombies (red ring when overrun) and our people there. Details: tap → the place's card.
  for (const id of LOCATION_IDS) {
    const el = labels[id];
    el.replaceChildren();
    el.dataset.loc = id;
    el.className = 'loc-label pin';
    if (!state) { el.classList.add('empty'); continue; }
    if (!isOpen(state, id)) {
      // UI-13: a locked block is not drawn; only the next blocks to open (next to an open place) get a '?'.
      const next = (NEIGHBORS[id] ?? []).some((n) => isOpen(state, n));
      if (!next) { el.classList.add('empty'); continue; }
      el.classList.add('locked'); el.textContent = '?';
      el.setAttribute('aria-label', tr('loc.locked'));
      el.onclick = (ev) => { ev.stopPropagation(); app?.onBoardPick({ locationId: id }); };
      continue;
    }
    const z = state.locations[id].zombies;
    const people = Object.values(state.survivors).filter((v) => v.alive && v.location === id).length;
    el.classList.toggle('overrun', isOverrun(state, id));
    el.classList.toggle('ours', people > 0);
    el.classList.toggle('active', app?.ui.selLoc === id);
    { const nm = document.createElement('span'); nm.className = 'pn'; nm.textContent = c('locations', id, 'name'); el.append(nm); }
    if (z) { const b = document.createElement('span'); b.className = 'pz'; b.append(icon('skull'), String(z)); el.append(b); }
    if (people) { const b = document.createElement('span'); b.className = 'pp'; b.append(icon('person'), String(people)); el.append(b); }
    if (!z && !people) el.classList.add('quiet');
    el.setAttribute('aria-label', `${c('locations', id, 'name')}: ${z}`);
    el.onclick = (ev) => { ev.stopPropagation(); app?.onBoardPick({ locationId: id }); };
  }
}

const SCENE_ICON = { move: 'move', attack: 'attack', search: 'search', barricade: 'barricade', lure: 'lure', play: 'check', contribute: 'crisis', deposit: 'goal' };

/** A short floating callout over where a scene happens: who (face), what (icon), the result. */
function sceneCallout(ev, state) {
  const el = document.createElement('div');
  el.className = `scene-callout k-${ev.kind}`;
  if (ev.survivorId) el.append(art.portrait(ev.survivorId, 's', { cls: 'sc-face', alt: '' }));
  el.append(icon(SCENE_ICON[ev.kind] ?? 'check'));
  const res = document.createElement('b');
  const cardBacks = (n) => Array.from({ length: Math.min(n, 3) }, (_, i) => { const cb = document.createElement('i'); cb.className = 'card-back'; cb.style.setProperty('--k', i); return cb; });
  switch (ev.kind) {
    case 'move': res.append(c('locations', ev.to, 'name')); break;
    case 'attack': res.append(`−${ev.n}`, icon('skull')); if (ev.hp) { const d = document.createElement('em'); d.className = 'dmg'; d.textContent = `−${ev.hp} HP`; el.append(d); } if (ev.drawn) res.append(' ', tr('scene.noise')); break;
    case 'search': el.append(...cardBacks(ev.n)); res.append(tr('scene.cards', { n: ev.n })); if (ev.spawned) { const d = document.createElement('em'); d.className = 'dmg'; d.textContent = tr('scene.spawned'); el.append(d); } break;
    case 'craft': case 'give': if (ev.card) { el.append(art.item(ev.card, 's', { cls: 'sc-item', alt: '' })); res.append(c('items', ev.card, 'name')); } break;
    case 'build': el.append(icon('barricade')); res.append(tr(`bld.${ev.building}`), ev.level ? ` ${tr('scene.level', { n: ev.level })}` : ` +${ev.n} AP`); break;
    case 'unpack': el.append(...cardBacks(ev.n)); res.append(tr('scene.unpack', { n: ev.n })); break;
    case 'nap': el.append(icon('hourglass')); res.append(tr('act.nap')); break;
    case 'siege': {
      // The night attack: a row of skulls, the stopped ones crossed out, then the bites.
      const row = document.createElement('span'); row.className = 'siege-row';
      for (let i = 0; i < Math.min(ev.n, 12); i++) { const sk = icon('skull'); if (i < ev.k) sk.classList.add('stopped'); sk.style.setProperty('--i', i); row.append(sk); }
      el.append(row);
      res.append(tr('scene.siege', { n: ev.n, k: ev.k }));
      if (ev.hits) { const d = document.createElement('em'); d.className = 'dmg'; d.textContent = `−${ev.hits * 10} HP`; el.append(d); }
      break;
    }
    case 'barricade': res.append(`+${ev.n}`); break;
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

const FX_ICON = { blank: 'check', wound: 'heal', frostbite: 'snowflake', bite: 'skull', startle: 'exposure', surrounded: 'attack' };
const FX_BURST = {
  blank: [0xf2f6fc],
  wound: [0xb3202a, 0xe0605a],
  frostbite: [0x9fd4ff, 0xe8f6ff],
  bite: [0x5a0f12, 0x8e1b1b, 0x6f8a4e],
  startle: [0xffd27a, 0xf2f6fc],
  surrounded: [0x6f8a4e, 0x3d4a2a],
};
const popups = [];
function exposureFx(survivorId, face) {
  const obj = pieces.survivorObject(survivorId);
  const fallback = obj ? obj.position.clone() : new THREE.Vector3();
  // A danger card: the verdict floats up over the survivor (23b gives it a card flip).
  Promise.resolve().then(() => {
    pieces.burstAt(survivorId, FX_BURST[face], face === 'bite' ? 30 : 18, face === 'bite' ? 1.5 : 1.1);
    const el = document.createElement('div');
    el.className = `fx-pop f-${face}`;
    el.append(art.portrait(survivorId, 's', { cls: 'fx-face', alt: '' }), icon(FX_ICON[face]), ` ${c('survivors', survivorId, 'name')} · ${tr(`fx.${face}`)}`);
    $('fx-layer').appendChild(el);
    popups.push({ el, obj, fallback, ttl: 2.6 });
  });
}

const app = createApp({
  board, pieces, art,
  graphics: governor,
  sceneScale: Math.max(0.1, Math.min(20, Number(params.get('scenes') ?? 1) || 1)), // testing: slower scenes
  fx: { exposure: exposureFx },
  scene: { camera: rig, play: playScene },
  dom: {
    topbar: $('topbar'), phase: $('phase'), log: $('log'), loc: $('locpanel'), player: $('player'), modal: $('modal'), toasts: $('toasts'), tutorial: $('tutorial'),
    movePick: $('move-pick'),
    radial: (() => { const r = document.createElement('div'); r.id = 'radial'; r.className = 'hidden'; r.setAttribute('role', 'group'); document.body.append(r); return r; })(),
    hint: $('hint'),
    playerRefs: { head: $('pp-head'), survivors: $('pp-survivors'), chips: $('pp-chips'), hand: $('pp-hand'), actions: $('pp-actions') },
    onRender: (state) => {
      // While the night report is on screen, the board shows night.
      updateWinter(state && app?.ui.queue[0]?.type === 'colony' ? { ...state, time: 'night' } : state);
      refreshLabels(state);
      placeRing();
      document.getElementById('view-ctl')?.classList.toggle('hidden', !state || state.phase === 'draft' || state.phase === 'gameOver');
    },
  },
});
refreshLabels(null);
updateWinter(null);

// Step 16: view buttons (turn 90°, 3 zoom levels) and keys Q / E / + / −.
{
  const bar = document.createElement('div');
  bar.id = 'view-ctl';
  const btn = (ico, label, fn) => { const b = document.createElement('button'); b.className = 'btn round view-btn'; b.setAttribute('aria-label', label); b.setAttribute('tip', label); b.append(icon(ico)); b.onclick = fn; bar.append(b); };
  // UI-1: the camera moves freely; one small button brings the usual view back.
  btn('target', tr('view.reset'), () => stage.view.reset());
  document.body.append(bar);
  window.addEventListener('keydown', (ev) => {
    if (ev.target.closest?.('input, textarea')) return;
    if (ev.key === 'q' || ev.key === 'Q') stage.view.rotate(-1);
    else if (ev.key === 'e' || ev.key === 'E') stage.view.rotate(1);
    else if (ev.key === '+' || ev.key === '=') stage.view.zoomStep(1);
    else if (ev.key === '-') stage.view.zoomStep(-1);
  });
}

// Step 22: behind an opaque full-screen panel (the draft) draw 1 frame in 4.
let coverCheck = 0;
stage.onFrame(() => {
  if (++coverCheck % 15) return;
  stage.setIdle(document.querySelector('.draft-screen') ? 4 : 1);
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
/** UI-6: the action bar is fixed to the bottom edge; if the tapped place would sit under it, pan (no zoom) to it. */
let barFor = null;
function placeRing() {
  const at = app?.ui.selLoc ?? null;
  if (at === barFor) return;
  barFor = at;
  const rd = document.getElementById('radial');
  if (!at || !rd || rd.classList.contains('hidden')) return;
  const { clientHeight: h } = stage.renderer.domElement;
  v.copy(board.layout[at].center).project(stage.camera);
  if (((1 - v.y) / 2) * h > h - rd.offsetHeight - 70) rig.focus({ kind: 'select', at });
}
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
// ?play=1  quick-starts a solo game; ?scenario=, ?seed=, ?lang=th

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
    scenarioId: params.get('scenario') ?? 'crawler',
    seed: Number(params.get('seed') ?? 1), lang: params.get('lang') ?? undefined,
  });
}
// Browsers only allow audio after a user gesture; UI buttons give a soft click.
window.addEventListener('pointerdown', () => sound.unlock());
document.addEventListener('click', (ev) => { if (ev.target.closest?.('button')) sound.play('ui'); });

window.__frostbound = { rig, stage, atmosphere, footprints, groundAt, ray, board, pieces, tweens, app, art, tryReduce, itemType: (defId) => ITEMS[defId]?.type };

// Step 22: the first frame is on screen — drop the loading screen. A hidden tab draws nothing and
// pauses the ambience.
boot(0.9);
requestAnimationFrame(() => requestAnimationFrame(() => boot(1)));
document.addEventListener('visibilitychange', () => sound.pause(document.hidden));
