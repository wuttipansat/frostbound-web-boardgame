// Entry point: 3D stage + board + pieces + dice tray, wired to the UI controller.
import * as THREE from 'three';
import { createStage } from './render/stage.js';
import { createBoard } from './render/board.js';
import { createPieces } from './render/pieces.js';
import { createDiceTray } from './render/dice.js';
import { Tweens } from './render/tween.js';
import { createApp } from './ui/app.js';
import { c, t as tr } from './i18n/index.js';
import { LOCATION_IDS } from './core/constants.js';
import { ITEMS } from './content/items.js';
import { tryReduce } from './core/reducer.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

const stage = createStage($('scene'), { snow: params.get('snow') !== '0' });
const board = createBoard();
stage.scene.add(board.root);
const tweens = new Tweens();
const pieces = createPieces(board, tweens);
stage.scene.add(pieces.root);
const diceTray = createDiceTray($('dice'));

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
      span.textContent = `☠${z}`;
      labels[id].append(span);
    }
  }
}

// ---------------------------------------------------------------- app

// ---------------------------------------------------------------- exposure popups

const FX_ICON = { blank: '✓', wound: '🩸', frostbite: '❄', bite: '☠' };
const popups = [];
function exposureFx(survivorId, face) {
  const obj = pieces.survivorObject(survivorId);
  const fallback = obj ? obj.position.clone() : new THREE.Vector3();
  // The die tumbles in the tray first; the verdict then floats up over the survivor.
  diceTray.rollExposure(face).then(() => {
    const el = document.createElement('div');
    el.className = `fx-pop f-${face}`;
    el.textContent = `${FX_ICON[face]} ${c('survivors', survivorId, 'name')} · ${tr(`fx.${face}`)}`;
    $('fx-layer').appendChild(el);
    popups.push({ el, obj, fallback, ttl: 2.6 });
  });
}

const app = createApp({
  board, pieces, diceTray,
  fx: { exposure: exposureFx },
  dom: {
    topbar: $('topbar'), log: $('log'), loc: $('locpanel'), player: $('player'), modal: $('modal'), toasts: $('toasts'),
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
stage.onFrame(() => {
  const { clientWidth: w, clientHeight: h } = stage.renderer.domElement;
  for (const id of LOCATION_IDS) {
    v.copy(board.layout[id].label).project(stage.camera);
    labels[id].style.left = `${((v.x + 1) / 2) * w}px`;
    labels[id].style.top = `${((1 - v.y) / 2) * h}px`;
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

if (params.get('play')) {
  app.quickStart({
    seats: params.get('play'), scenarioId: params.get('scenario') ?? 'beacon',
    seed: Number(params.get('seed') ?? 1), lang: params.get('lang') ?? undefined,
  });
}
window.__frostbound = { stage, board, pieces, diceTray, tweens, app, tryReduce, itemType: (defId) => ITEMS[defId]?.type };
