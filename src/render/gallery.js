// VOXEL-2: a model gallery for review (dev only, loaded on demand): every model alone at its close-up level.
import * as THREE from 'three';
import { geometriesFor, groupOf } from './voxel.js';
import * as city from './city.js';
import * as props from './props.js';
import { LOCATION_BUILDERS_HD, treeModelHD } from './buildings.js';

const L0 = (key, make) => ['lod0', key, 0.15, () => city.lod(0, key, make)];
const P = (key, make, size = 0.1) => ['prop', key, size, make];
/** [sheet, label, kind, size, make] */
export function galleryList() {
  const out = [];
  for (const t of ['grocery', 'police', 'mall', 'hardware', 'military', 'factory', 'forest', 'scrapyard', 'farmhouse']) out.push(['places', t, ...L0(`place-${t}`, LOCATION_BUILDERS_HD[t]).slice(1)]);
  for (const k of ['lot', 'dock', 'tow', 'triage', 'busloop', 'schoolyard', 'garden', 'convoy', 'siding', 'truckyard', 'logs', 'wrecks', 'foodvan', 'laststand', 'shelter', 'looted']) out.push(['grounds', k, ...L0(`b5-${k}`, () => city.groundsPiece(k)).slice(1)]);
  for (const [k, mk] of [['playground', city.playground], ['pharmacy', city.pharmacy], ['impound', city.impound], ['graveyard', city.graveyard], ['diner', city.diner], ['watertower', city.waterTower], ['substation', city.substation]]) out.push(['companions', k, ...L0(`b5-${k}`, mk).slice(1)]);
  const L1 = (key, make) => ['lod1', key, 0.3, () => city.lod(1, key, make)];
  for (const [n, f, k] of [[4, city.suburbanHouse, 'sub'], [2, city.mixedUse, 'mixed'], [1, city.midrise, 'mid'], [2, city.workshop, 'work']]) for (let v = 0; v < n; v++) out.push(['buildings', `${k}-${v}`, ...L1(`b5-${k}-${v}`, () => f(v)).slice(1)]);
  for (let v = 0; v < city.COTTAGE_VARIANTS; v++) out.push(['outskirts', `cottage-${v}`, ...L0(`cottage-${v}`, () => city.cottage(v)).slice(1)]);
  for (let v = 0; v < 3; v++) out.push(['outskirts', `field-${v}`, ...L0(`b5-b7-field-${v}`, () => city.fieldPiece(v)).slice(1)]);
  out.push(['outskirts', 'pond', ...L0('b5-b7-pond-0', () => city.pondPiece()).slice(1)]);
  for (const [k, mk, s] of [['car', () => props.carModel(1), 0.15], ['bus', () => props.vehicleModel('bus', 1), 0.15], ['cab', () => props.vehicleModel('cab'), 0.15], ['snowheap', () => props.snowHeapModel(0)], ['sandbags', props.sandbagModel], ['woodpile', props.woodpileModel], ['scrapheap', props.scrapHeapModel], ['crates', props.cratesModel], ['barrier', props.barrierModel], ['fishing', props.fishingModel], ['boat', props.boatModel], ['generator', city.generatorModel], ['nameboard', () => city.nameBoard('HOSPITAL', true)], ['placesign', () => city.placeSign('LIBRARY')], ['parapet', props.bridgeParapetModel], ['birch', () => props.birchModel(1), 0.25], ['pine', () => treeModelHD(0, 1), 0.25]]) out.push(['props', k, ...P(`gal-${k}`, mk, s).slice(1)]);
  return out;
}
/** Show one model alone (board and pieces hidden): returns its size so the caller can frame it. */
export function showModel(f, i, turn = 0) {
  const [, , key, size, make] = galleryList()[i];
  f.__gallery?.removeFromParent();
  f.board.root.visible = false; if (f.pieces?.root) f.pieces.root.visible = false;
  const g = groupOf(geometriesFor(key, { size, jitter: 0 }, make));
  const holder = new THREE.Group(); holder.add(g); holder.rotation.y = turn;
  f.stage.scene.add(holder); f.__gallery = holder;
  // Alone on the backdrop: no particles, no post-processing blur, only the lights.
  for (const o of f.stage.scene.children) if (!o.isLight && o !== holder) o.visible = false;
  f.stage.setTier?.({ id: 'saver', pixelRatio: 1, post: false, shadow: 2048, snow: 0, every: 1 });
  // (the camera's zoom is capped: scale the model to fill the frame instead)
  let box = new THREE.Box3().setFromObject(holder); const s0 = box.getSize(new THREE.Vector3());
  holder.scale.setScalar(16 / Math.max(s0.x, s0.y * 1.3, s0.z));
  box = new THREE.Box3().setFromObject(holder); const c = box.getCenter(new THREE.Vector3());
  return { c: [c.x, c.y, c.z], s: 16 };
}
