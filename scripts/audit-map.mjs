// MAP audit: build cities for several seeds and stages in Node and look for things that are placed wrong:
// overlaps, floating / buried, over the void, on the railway, blocking an entrance, unstable between growth / reload.
//   node scripts/audit-map.mjs [seeds] [stages]   → docs/ref/audit/report.md (+ report.json)
import fs from 'node:fs';
const fakeCtx = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
globalThis.document ??= { createElement: () => ({ getContext: () => fakeCtx }) };
const { createBoard, blockPos, blockHalf, gridOf, GROUND, railLine, riverLine, BOARD, districtOf } = await import('../src/render/board.js');
// MAP-6: what may stand in which district (props in context); anything else is a finding.
const ZONE_RULES = [
  [/^laundry/, ['residential']], [/^(heap|sandbags)/, ['downtown']], [/^fountain/, ['downtown', 'residential']],
  [/^furn-(hydrant|newsbox|phone|busstop|bin)/, ['downtown', 'residential', 'industrial', 'colony']],
  [/^cottage/, ['outskirts']], [/^drift/, ['outskirts']], [/^b5-(tower|office|cinema|garage)/, ['downtown']], [/^container/, ['industrial']],
];
const { ROAD } = await import('../src/render/terrain.js');
const { PLACE_RULES, TIER_STAGE } = await import('../src/content/locations.js');
const { ORIGINALS } = await import('../src/core/map.js');
const { zoneOf } = await import('../src/core/zones.js');
const { createGame } = await import('../src/core/state.js');
const { growCity } = await import('../src/core/rules/city.js');

const SEEDS = +(process.argv[2] ?? 6); const STAGES = +(process.argv[3] ?? 4);
const RAIL_KINDS = /^(crossing|wagon|buffer)/;
const NO_CLASH = /^(apron|wires|tree)/;            // ground decals and tree clusters may touch others
const issues = [];
const note = (type, seed, stage, what, at) => issues.push({ type, seed, stage, what, at: at.map((v) => +v.toFixed(1)) });

function lineSegs(map) {
  const line = (c) => blockPos(c) - blockHalf(c);
  return map.roads.map((k) => { const [cx, cz, d] = k.split(','); return d === 'h' ? [line(+cx), line(+cz), line(+cx + 1), line(+cz)] : [line(+cx), line(+cz), line(+cx), line(+cz + 1)]; });
}
const dSeg = (x, z, [ax, az, bx, bz]) => { const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2))); return Math.hypot(x - ax - (bx - ax) * t, z - az - (bz - az) * t); };

function audit(board, map, seed, stage) {
  const has = (bx, bz) => !!map.blocks[`${bx},${bz}`];
  const segs = lineSegs(map);
  const onSlab = (x, z) => { const bx = gridOf(x); const bz = gridOf(z); return has(bx, bz) && Math.abs(x - blockPos(bx)) <= blockHalf(bx) - ROAD.half + 0.05 && Math.abs(z - blockPos(bz)) <= blockHalf(bz) - ROAD.half + 0.05; };
  const onRoad = (x, z) => segs.some((g) => dSeg(x, z, g) < ROAD.half + 0.05);
  const rail = railLine(map);
  const items = board.auditItems().filter((it) => isFinite(it.box.min.x));
  for (const it of items) {
    const c = it.box.getCenter(it.box.min.clone());
    const at = [c.x, c.z];
    if (it.kind.startsWith('place:')) continue;
    if (!onSlab(c.x, c.z) && !onRoad(c.x, c.z)) { note('over the void / off the ground', seed, stage, it.kind, at); continue; }
    const want = onSlab(c.x, c.z) ? GROUND : 0;
    if (!/^(pole|tree|wagon-lying|crossing|tlight|lamp|sign|bulb)/.test(it.kind) && Math.abs(it.box.min.y - want) > 0.2) note(it.box.min.y > want ? 'floating' : 'buried', seed, stage, `${it.kind} (base ${it.box.min.y.toFixed(2)}, ground ${want})`, at);
    const across = rail.axis === 'x' ? [it.box.min.z, it.box.max.z] : [it.box.min.x, it.box.max.x];
    const along = rail.axis === 'x' ? c.x : c.z;
    const railHere = has(...(rail.axis === 'x' ? [gridOf(along), rail.r] : [rail.r, gridOf(along)]));
    if (railHere && !RAIL_KINDS.test(it.kind) && across[0] < rail.c + 1.6 && across[1] > rail.c - 1.6) note('on the railway', seed, stage, it.kind, at);
    { // MAP-6: nothing stands on the river ice but its bridge parapets
      const rv = riverLine(map); const ac = rv.axis === 'x' ? [it.box.min.z, it.box.max.z] : [it.box.min.x, it.box.max.x];
      const al = rv.axis === 'x' ? c.x : c.z; const here = has(...(rv.axis === 'x' ? [gridOf(al), rv.r] : [rv.r, gridOf(al)]));
      if (here && !/^parapet/.test(it.kind) && ac[0] < rv.c + 2.2 && ac[1] > rv.c - 2.2) note('on the river', seed, stage, it.kind, at);
    }
  }
  for (const it of items) {
    const rule = ZONE_RULES.find(([re]) => re.test(it.kind)); if (!rule) continue;
    const c = it.box.getCenter(it.box.min.clone()); const d = districtOf(gridOf(c.x), gridOf(c.z), map.look);
    if (!rule[1].includes(d)) note('out of its zone', seed, stage, `${it.kind} in ${d}`, [c.x, c.z]);
  }
  // Places: in a zone and tier that fit them (a missing original may stand anywhere: it comes back where it can).
  for (const [k, b] of Object.entries(map.blocks)) {
    if (b.kind !== 'place' || !b.type || ORIGINALS.includes(b.type)) continue;
    const rule = PLACE_RULES[b.type]; const [bx, bz] = k.split(',').map(Number);
    if (!rule || !rule.zones.includes(zoneOf(bx, bz, map.look)) || TIER_STAGE[rule.tier] > stage) note('place out of its zone / tier', seed, stage, `${b.type} in ${zoneOf(bx, bz, map.look)}`, [blockPos(bx), blockPos(bz)]);
  }
  // Overlaps (top view), places included.
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i]; const b = items[j];
    if (NO_CLASH.test(a.kind) || NO_CLASH.test(b.kind)) continue;
    if (a.kind.startsWith('place:') && b.kind.startsWith('place:')) continue;
    const ox = Math.min(a.box.max.x, b.box.max.x) - Math.max(a.box.min.x, b.box.min.x);
    const oz = Math.min(a.box.max.z, b.box.max.z) - Math.max(a.box.min.z, b.box.min.z);
    const oy = Math.min(a.box.max.y, b.box.max.y) - Math.max(a.box.min.y, b.box.min.y);
    if (ox > 0.3 && oz > 0.3 && oy > 0.1) { const c = a.box.getCenter(a.box.min.clone()); note('overlap', seed, stage, `${a.kind} × ${b.kind}`, [c.x, c.z]); }
  }
  const onRoadAt = (x, z) => !onSlab(x, z) && onRoad(x, z);
  // Entrances: a door's sidewalk and the colony gates.
  const doors = Object.values(board.layout).flatMap((L) => (L.plan ? [[L.id, L.plan.c.clone().addScaledVector(L.plan.fwd, L.plan.edge + 1).addScaledVector(L.plan.side, L.plan.lat)]] : (L.gates ?? []).map((g) => ['gate', g])));
  for (const it of items) {
    if (it.kind.startsWith('place:') || /^(apron|lamp|tree|bulb)/.test(it.kind)) continue; // (bulbs hang overhead)
    const c = it.box.getCenter(it.box.min.clone());
    if (onRoadAt(c.x, c.z)) continue; // vehicles in the street don't block a door on the sidewalk
    for (const [id, d] of doors) if (Math.hypot(c.x - d.x, c.z - d.z) < 3) note('blocks an entrance', seed, stage, `${it.kind} at ${id}`, [c.x, c.z]);
  }
  return items;
}

const sig = (items, map, inBlocks) => items.filter((it) => inBlocks.has(`${gridOf((it.box.min.x + it.box.max.x) / 2)},${gridOf((it.box.min.z + it.box.max.z) / 2)}`) && /^(small|ruin|container|parking|fountain|place:)/.test(it.kind))
  .map((it) => `${it.kind}@${((it.box.min.x + it.box.max.x) / 2).toFixed(1)},${((it.box.min.z + it.box.max.z) / 2).toFixed(1)}`).sort().join('|');

const board = createBoard();
const counts = {};
for (let seed = 1; seed <= SEEDS; seed++) {
  const s = createGame({ seed, players: 1 });
  let prev = null;
  for (let stage = 1; stage <= STAGES; stage++) {
    if (stage > 1) growCity(s);
    const map = JSON.parse(JSON.stringify(s.map));
    board.setMap(map, { snap: true }); board.flush(); board.setZoom(0.9);
    const items = audit(board, map, seed, stage);
    counts[`${seed}/${stage}`] = items.length;
    // Stability: what stood in the old blocks is unchanged after growth; a reload gives the same city.
    if (prev && sig(items, map, prev.blocks) !== prev.sig) note('changed after growth', seed, stage, 'block pieces in old blocks differ', [0, 0]);
    prev = { blocks: new Set(Object.keys(map.blocks)), sig: sig(items, map, new Set(Object.keys(map.blocks))) };
  }
  const again = createBoard(); again.setMap(JSON.parse(JSON.stringify(s.map)), { snap: true }); again.flush(); again.setZoom(0.9);
  if (again.auditItems().length !== board.auditItems().length) note('differs after reload', seed, STAGES, `${again.auditItems().length} vs ${board.auditItems().length} items`, [0, 0]);
}
// Summary: group by type and what.
const byType = {};
for (const i of issues) { const k = `${i.type}: ${i.what.replace(/ \(base.*\)| at .*$/, '')}`; (byType[k] ??= []).push(i); }
const lines = Object.entries(byType).sort((a, b) => b[1].length - a[1].length).map(([k, v]) => `- ${v.length} × ${k} — e.g. seed ${v[0].seed} stage ${v[0].stage} at (${v[0].at})`);
if (!process.argv.includes('--no-write')) fs.mkdirSync('docs/ref/audit', { recursive: true });
if (!process.argv.includes('--no-write')) fs.writeFileSync('docs/ref/audit/report.json', JSON.stringify({ counts, issues }, null, 1));
if (!process.argv.includes('--no-write')) fs.writeFileSync('docs/ref/audit/report.md', `# Map audit (${SEEDS} seeds × ${STAGES} stages)\n\n${issues.length} findings.\n\n${lines.join('\n')}\n`);
console.log(`${issues.length} findings`); console.log(lines.slice(0, 40).join('\n'));
