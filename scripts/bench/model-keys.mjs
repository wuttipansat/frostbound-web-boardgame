// Every cached model geometry a city can need: build several cities (all stages, legacy town) at every zoom level.
const fakeCtx = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
globalThis.document ??= { createElement: () => ({ getContext: () => fakeCtx }) };
const { createBoard } = await import('../../src/render/board.js');
const { geometryCache } = await import('../../src/render/voxel.js');
const { createGame } = await import('../../src/core/state.js');
const { growCity } = await import('../../src/core/rules/city.js');
const { LEGACY_MAP } = await import('../../src/core/map.js');
export async function collect({ seeds = [1, 2, 3, 4, 5, 6], stages = 4 } = {}) {
  const board = createBoard();
  const zoomAll = () => { for (const z of [0.3, 0.6, 0.9]) board.setZoom(z); };
  zoomAll();
  // MAP-3: every colony wall level and slot building.
  for (let lv = 0; lv <= 4; lv++) { const L = Math.min(3, lv); board.setBase({ dorm: L, wall: L, greenhouse: L, workshop: L, infirmary: L, radio: L, crawler: lv }, { snap: true }); zoomAll(); }
  board.setBase({}, { snap: true });
  board.setMap(LEGACY_MAP, { snap: true }); zoomAll();
  for (const seed of seeds) {
    const s = createGame({ seed, players: 1 });
    board.setMap(s.map, { snap: true }); zoomAll();
    for (let i = 1; i < stages; i++) { growCity(s); board.setMap(JSON.parse(JSON.stringify(s.map))); zoomAll(); }
  }
  return geometryCache();
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const cache = await collect();
  let bytes = 0; let tris = 0;
  for (const { lit, glow } of cache.values()) for (const g of [lit, glow]) if (g) { for (const a of Object.values(g.attributes)) bytes += a.array.byteLength; bytes += g.index.array.byteLength; tris += g.index.count / 3; }
  console.log(JSON.stringify({ models: cache.size, MB: +(bytes / 1e6).toFixed(1), tris }));
}
