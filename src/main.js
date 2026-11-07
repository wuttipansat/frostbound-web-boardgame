// Step 3 entry point: voxel board + animated pieces + dice tray, driven by bots playing a real game.
import * as THREE from 'three';
import { createStage } from './render/stage.js';
import { createBoard } from './render/board.js';
import { createPieces, PLAYER_COLORS } from './render/pieces.js';
import { createDiceTray } from './render/dice.js';
import { Tweens } from './render/tween.js';
import { createGame } from './core/state.js';
import { reduce } from './core/reducer.js';
import { pendingActors, survivorsAt, getPlayer } from './core/selectors.js';
import { botAction } from './ai/simpleBot.js';
import { mulberry } from './ai/simulate.js';
import { LOCATIONS } from './content/locations.js';
import { LOCATION_IDS, PHASES } from './core/constants.js';
import { describe } from './ui/logText.js';
import { survivorModel, zombieModel } from './render/characters.js';
import { CHAR_VOXEL } from './render/pieces.js';
import { SURVIVORS } from './content/survivors.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- scene

const stage = createStage($('scene'), { snow: params.get('snow') !== '0' });
const board = createBoard();
stage.scene.add(board.root);
const tweens = new Tweens();
const pieces = createPieces(board, tweens);
stage.scene.add(pieces.root);
const diceTray = createDiceTray($('dice'));
stage.onFrame((t, dt) => {
  tweens.update(dt);
  board.update(t);
  pieces.update(t, dt);
});

// ---------------------------------------------------------------- game (bots drive it in this demo)

let seed = Number(params.get('seed') ?? 7);
let state;
let logSeen = 0;
let rng;

function newGame() {
  rng = mulberry(seed * 7919 + 13); // seeded so a given ?seed always plays the same demo game
  state = createGame({
    players: ['Ana', 'Ben', 'Chai', 'Dara'].map((name) => ({ name, isAI: true })),
    scenarioId: params.get('scenario') ?? 'purge', seed: seed++,
  });
  // Draft instantly so the board starts populated.
  while (state.phase === PHASES.DRAFT) state = reduce(state, botAction(state, pendingActors(state)[0], { random: rng }));
  logSeen = 0;
  $('ticker').innerHTML = '';
  pieces.sync(state, { animate: false });
  refresh();
}

function step() {
  if (state.phase === PHASES.GAME_OVER) { newGame(); return; }
  const actor = pendingActors(state)[0];
  state = reduce(state, botAction(state, actor, { random: rng }));
  pieces.sync(state);
  refresh();
}

// ---------------------------------------------------------------- HUD

function refresh() {
  const active = state.activePlayerId ? getPlayer(state, state.activePlayerId) : null;
  const idx = active ? state.players.indexOf(active) : 0;
  const color = `#${PLAYER_COLORS[idx].toString(16).padStart(6, '0')}`;
  $('turn-text').innerHTML = state.phase === PHASES.GAME_OVER
    ? `Game over · ${state.result.reason}`
    : `<span class="swatch" style="color:${color};background:${color}"></span>Round ${state.round} · ${active?.name}'s turn`;
  $('dice-owner').textContent = active ? `${active.name}'s dice` : 'Dice';
  if (active) diceTray.sync(active.dice, `${active.id}:${state.round}`);

  const fresh = state.log.slice(logSeen).map((e) => describe(e, state)).filter(Boolean);
  logSeen = state.log.length;
  for (const line of fresh) {
    const div = document.createElement('div');
    div.textContent = line;
    $('ticker').prepend(div);
  }
  while ($('ticker').children.length > 4) $('ticker').lastChild.remove();

  for (const id of LOCATION_IDS) {
    const z = state.locations[id].zombies;
    labels[id].innerHTML = `${LOCATIONS[id].name}${z ? `<span class="z">☠${z}</span>` : ''}`;
  }
  if (selected) select(selected);
}

// Auto-play: one action at a time, waiting for animations to settle in between.
let playing = params.get('autoplay') !== '0';
let wait = 0;
stage.onFrame((_t, dt) => {
  if (!playing) return;
  if (pieces.busy || diceTray.busy) { wait = 0.25; return; }
  wait -= dt;
  if (wait <= 0) { step(); wait = 0.55; }
});
function setPlaying(on) {
  playing = on;
  $('btn-play').textContent = on ? '❚❚ Pause' : '▶ Auto-play';
  $('btn-play').classList.toggle('on', on);
}
$('btn-play').addEventListener('click', () => setPlaying(!playing));
$('btn-step').addEventListener('click', () => { setPlaying(false); step(); });
$('btn-new').addEventListener('click', () => newGame());
$('btn-roll').addEventListener('click', () => {
  const active = getPlayer(state, state.activePlayerId);
  if (!active) return;
  diceTray.sync(active.dice.map((d) => ({ ...d, v: 1 + Math.floor(Math.random() * 6) })), `show:${Math.random()}`);
});

// ---------------------------------------------------------------- labels & picking

const labels = {};
for (const id of LOCATION_IDS) {
  const el = document.createElement('div');
  el.className = 'loc-label';
  $('labels').appendChild(el);
  labels[id] = el;
}
const v = new THREE.Vector3();
stage.onFrame(() => {
  const { clientWidth: w, clientHeight: h } = stage.renderer.domElement;
  for (const id of LOCATION_IDS) {
    v.copy(board.layout[id].label).project(stage.camera);
    labels[id].style.left = `${((v.x + 1) / 2) * w}px`;
    labels[id].style.top = `${((1 - v.y) / 2) * h}px`;
  }
});

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
  if (!downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 5) return;
  select(pick(ev));
});

let selected = null;
function select(id) {
  selected = id;
  board.setSelected(id);
  for (const [lid, el] of Object.entries(labels)) el.classList.toggle('active', lid === id);
  const info = $('info');
  if (!id) { info.classList.add('hidden'); return; }
  const def = LOCATIONS[id];
  const loc = state.locations[id];
  const here = survivorsAt(state, id).length;
  info.innerHTML = `
    <h2>${def.name}</h2>
    <p class="blurb">${def.blurb}</p>
    <div class="stats">
      <div class="stat warm"><b>${here}/${def.survivorSlots ?? '∞'}</b><span>survivors</span></div>
      <div class="stat danger"><b>${loc.zombies}/${def.zombieSlots}</b><span>zombies</span></div>
      <div class="stat"><b>${loc.deck ? loc.deck.length : loc.barricades}</b><span>${loc.deck ? 'cards left' : 'barricades'}</span></div>
    </div>`;
  info.classList.remove('hidden');
}

// ---------------------------------------------------------------- character line-up (?lineup)

function showLineup() {
  board.root.visible = false;
  pieces.root.visible = false;
  for (const id of ['turn', 'dice-panel', 'labels']) $(id).classList.add('hidden');
  const g = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.BoxGeometry(34, 1, 20), new THREE.MeshLambertMaterial({ color: 0xe9f0f8 }));
  ground.position.y = -0.5;
  ground.receiveShadow = true;
  g.add(ground);
  const add = (model, x, z) => {
    const obj = model.build({ size: CHAR_VOXEL });
    obj.position.set(x, 0, z);
    g.add(obj);
  };
  SURVIVORS.forEach((s, i) => add(survivorModel(s), (i % 10 - 4.5) * 3, Math.floor(i / 10) * 5.5 - 6));
  [0, 1, 2, 0, 1].forEach((v, i) => add(zombieModel(v), (i - 2) * 3.4, 5.5));
  const front = new THREE.DirectionalLight(0xffe6c8, 1.8);
  front.position.set(10, 25, 60);
  g.add(front);
  stage.scene.add(g);
  stage.camera.position.set(0, 45, 100);
  stage.controls.target.set(0, 1, 0);
  stage.camera.zoom = 3.1;
  stage.camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- boot

newGame();
setPlaying(playing);
for (let i = 0; i < Number(params.get('advance') ?? 0); i++) step();
if (params.get('advance')) pieces.sync(state, { animate: false });
if (params.get('select')) select(params.get('select'));
if (params.get('focus') && board.layout[params.get('focus')]) {
  const delta = board.layout[params.get('focus')].center.clone().sub(stage.controls.target);
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
if (params.has('lineup')) { setPlaying(false); showLineup(); stage.controls.update(); }

window.__frostbound = { stage, board, pieces, diceTray, tweens, get state() { return state; }, step, select, setPlaying };
