// Step 2 entry point: renders the voxel board and connects location picking to a demo GameState.
import * as THREE from 'three';
import { createStage } from './render/stage.js';
import { createBoard } from './render/board.js';
import { createGame } from './core/state.js';
import { reduce } from './core/reducer.js';
import { pendingActors, survivorsAt } from './core/selectors.js';
import { botAction } from './ai/simpleBot.js';
import { LOCATIONS } from './content/locations.js';
import { LOCATION_IDS } from './core/constants.js';

const params = new URLSearchParams(location.search);

// Demo game: 4 bots play a few dozen actions so the board has some history.
function demoState() {
  let s = createGame({
    players: ['Ana', 'Ben', 'Chai', 'Dara'].map((name) => ({ name, isAI: true })),
    scenarioId: 'stores', seed: 7,
  });
  for (let i = 0; i < 40 && s.phase !== 'gameOver'; i++) {
    s = reduce(s, botAction(s, pendingActors(s)[0], { random: () => 0.5 }));
  }
  return s;
}

const state = demoState();
const stage = createStage(document.getElementById('scene'), { snow: params.get('snow') !== '0' });
const board = createBoard();
stage.scene.add(board.root);
stage.onFrame((t) => board.update(t));

// ---------------------------------------------------------------- labels

const labelLayer = document.getElementById('labels');
const labels = {};
for (const id of LOCATION_IDS) {
  const el = document.createElement('div');
  el.className = 'loc-label';
  labelLayer.appendChild(el);
  labels[id] = el;
}
function refreshLabels() {
  for (const id of LOCATION_IDS) {
    const z = state.locations[id].zombies;
    labels[id].innerHTML = `${LOCATIONS[id].name}${z ? `<span class="z">☠${z}</span>` : ''}`;
  }
}
refreshLabels();
const v = new THREE.Vector3();
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
function pick(ev) {
  const r = stage.renderer.domElement.getBoundingClientRect();
  pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, stage.camera);
  return raycaster.intersectObjects(board.pickTargets, false)[0]?.object.userData.locationId ?? null;
}

let downAt = null;
const canvas = stage.renderer.domElement;
canvas.addEventListener('pointermove', (ev) => {
  const id = pick(ev);
  board.setHovered(id);
  canvas.style.cursor = id ? 'pointer' : 'grab';
});
canvas.addEventListener('pointerdown', (ev) => { downAt = [ev.clientX, ev.clientY]; });
canvas.addEventListener('pointerup', (ev) => {
  // Treat as a click only if the pointer barely moved (otherwise it was an orbit drag).
  if (!downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 5) return;
  select(pick(ev));
});

const info = document.getElementById('info');
function select(id) {
  board.setSelected(id);
  for (const [lid, el] of Object.entries(labels)) el.classList.toggle('active', lid === id);
  if (!id) { info.classList.add('hidden'); return; }
  const def = LOCATIONS[id];
  const loc = state.locations[id];
  const here = survivorsAt(state, id).length;
  const slots = def.survivorSlots ?? '∞';
  info.innerHTML = `
    <h2>${def.name}</h2>
    <p class="blurb">${def.blurb}</p>
    <div class="stats">
      <div class="stat warm"><b>${here}/${slots}</b><span>survivors</span></div>
      <div class="stat danger"><b>${loc.zombies}/${def.zombieSlots}</b><span>zombies</span></div>
      <div class="stat"><b>${loc.deck ? loc.deck.length : '—'}</b><span>${loc.deck ? 'cards left' : `barricades ${loc.barricades}`}</span></div>
    </div>`;
  info.classList.remove('hidden');
}

if (params.get('select')) select(params.get('select'));
// Camera framing via URL (handy for screenshots): ?focus=colony&zoom=2.5
if (params.get('focus') && board.layout[params.get('focus')]) {
  const c = board.layout[params.get('focus')].center;
  const delta = c.clone().sub(stage.controls.target);
  stage.controls.target.add(delta);
  stage.camera.position.add(delta);
}
if (params.get('zoom')) { stage.camera.zoom = Number(params.get('zoom')); stage.camera.updateProjectionMatrix(); }
if (params.get('azimuth')) {
  const a = THREE.MathUtils.degToRad(Number(params.get('azimuth')));
  const off = stage.camera.position.clone().sub(stage.controls.target);
  const r = Math.hypot(off.x, off.z);
  stage.camera.position.set(stage.controls.target.x + Math.sin(a) * r, stage.camera.position.y, stage.controls.target.z + Math.cos(a) * r);
}
stage.controls.update();

// Debug/testing handle.
window.__frostbound = { stage, board, state, select };
