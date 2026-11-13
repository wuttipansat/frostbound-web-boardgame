// GODOT-2: what the web board builds for a map, in a form the Godot port can compare with its own board:
// every instanced model (cache key + world matrices), every single model (places, colony, landmarks), the
// fingerprint of every merged mesh (terrain, streets, rails, river, rim, furniture, wires), the furniture calls,
// and the layout anchors. node scripts/godot/scene-dump.mjs -> godot/data/scenes/*.json
import fs from 'node:fs';
import * as THREE from 'three';

const fakeCtx = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
globalThis.document ??= { createElement: () => ({ getContext: () => fakeCtx }) };
const { createBoard } = await import('../../src/render/board.js');
const { geometryCache } = await import('../../src/render/voxel.js');
const { createGame } = await import('../../src/core/state.js');
const { growCity } = await import('../../src/core/rules/city.js');

const r3 = (v) => Math.round(v * 1000) / 1000 + 0; // (+0: no -0)
const mstr = (m) => m.elements.map(r3).join(',');
export function fingerprint(g) {
  const p = g.attributes.position; const c = g.attributes.color; const out = [p.count, g.index ? g.index.count : 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < p.count; i++) {
    out[2] += p.getX(i); out[3] += p.getY(i); out[4] += p.getZ(i); out[8] += p.getX(i) * p.getZ(i) * 0.01;
    if (c) { out[5] += c.getX(i); out[6] += c.getY(i); out[7] += c.getZ(i); }
  }
  return out.map((v, i) => (i < 2 ? v : Math.round(v * 100) / 100));
}

export function dumpScene(map) {
  const board = createBoard();
  const zoomAll = () => { for (const z of [0.3, 0.6, 0.9]) board.setZoom(z); };
  zoomAll();
  board.setMap(map, { snap: true }); zoomAll(); board.flush(); zoomAll();
  board.root.updateMatrixWorld(true);
  const geoKey = new Map();
  for (const [k, { lit, glow }] of geometryCache()) { if (lit) geoKey.set(lit, [k, 'lit']); if (glow) geoKey.set(glow, [k, 'glow']); }
  const lodOf = (o) => { for (let p = o; p; p = p.parent) if (p.userData?.lod !== undefined) return String(p.userData.lod); return 'all'; };
  const instances = {}; const models = []; const meshes = {}; const picks = {};
  const m = new THREE.Matrix4();
  board.root.traverse((o) => {
    if (o.userData?.locationId) { picks[o.userData.locationId] = [r3(o.position.x), r3(o.position.z), r3(o.geometry.parameters.radiusTop)]; return; }
    if (o.isInstancedMesh) {
      const gk = geoKey.get(o.geometry);
      if (gk && gk[1] === 'glow') return; // (the lit part names the instance set)
      const kind = gk ? gk[0] : (o.userData.kind ?? o.name ?? 'instanced');
      const k = `${kind}@${lodOf(o)}`;
      const list = (instances[k] ??= []);
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); list.push(mstr(m.clone().premultiply(o.matrixWorld))); }
      return;
    }
    if (o.isMesh || o.isLineSegments) {
      const gk = geoKey.get(o.geometry);
      if (gk) { if (gk[1] === 'lit' || !o.parent.children.some((c) => geoKey.get(c.geometry)?.[1] === 'lit')) models.push([gk[0], lodOf(o), mstr(o.matrixWorld)]); return; }
      if (o.geometry?.type === 'PlaneGeometry' || o.geometry?.type === 'CylinderGeometry') return; // halos, shadow
      const name = `${o.name || o.type}@${lodOf(o)}`;
      (meshes[name] ??= []).push(fingerprint(o.geometry));
    }
  });
  for (const list of Object.values(instances)) list.sort();
  models.sort((a, b) => (a.join() < b.join() ? -1 : 1));
  for (const list of Object.values(meshes)) list.sort((a, b) => (a.join() < b.join() ? -1 : 1));
  const furniture = board.auditItems().filter((d) => d.call).map((d) => d.call.map((v) => (typeof v === 'number' ? r3(v) : v)));
  const layout = {};
  for (const [id, L] of Object.entries(board.layout)) layout[id] = { center: [r3(L.center.x), r3(L.center.y), r3(L.center.z)], facing: r3(L.facing), hit: r3(L.hitRadius), zombies: L.zombieSlots.map((v) => [r3(v.x), r3(v.z)]), survivors: L.survivorSlots.map((v) => [r3(v.x), r3(v.z)]) };
  return { instances, models, meshes, furniture, layout, picks };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fs.mkdirSync('godot/data/scenes', { recursive: true });
  const cases = [[1, 1], [1, 3], [2, 5], [3, 4]];
  for (const [seed, stages] of cases) {
    const s = createGame({ seed, players: 1, scenarioId: 'crawler', days: 40 });
    for (let i = 1; i < stages; i++) growCity(s);
    const t0 = Date.now();
    const d = dumpScene(JSON.parse(JSON.stringify(s.map)));
    const f = `godot/data/scenes/seed${seed}-stage${stages}.json`;
    fs.writeFileSync(f, JSON.stringify({ seed, stages, map: s.map, ...d }));
    console.log(`${f}: ${Object.keys(d.instances).length} instance sets (${Object.values(d.instances).reduce((a, l) => a + l.length, 0)}), ${d.models.length} models, ${Object.keys(d.meshes).length} mesh kinds, ${d.furniture.length} furniture, ${Date.now() - t0} ms`);
  }
}
