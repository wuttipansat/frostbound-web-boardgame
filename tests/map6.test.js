// MAP-6: a dying town with a centre: zones, outskirts, props in context, few lights.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/core/state.js';
import { growCity } from '../src/core/rules/city.js';
import { zoneOf, townOf, FILLER_BY_ZONE } from '../src/core/zones.js';
import { computeLayout, placePlan, blockPieces, districtOf, centerpieceOf, railLine } from '../src/render/board.js';

const grown = (seed, stages = 4) => { const s = createGame({ seed, players: 1 }); for (let i = 1; i < stages; i++) growCity(s); return s; };

test('town plan: stable per game; outskirts behind the colony, town ahead; stage 1 has no downtown', () => {
  for (const look of [1, 2, 3, 4, 5, 6]) {
    const { dx, dz } = townOf(look);
    const ahead = [Math.round(dx * 3), Math.round(dz * 3)]; const behind = [-ahead[0], -ahead[1]];
    assert.notEqual(zoneOf(...ahead, look), 'outskirts', `look ${look}: town ahead`);
    assert.equal(zoneOf(...behind, look), 'outskirts', `look ${look}: outskirts behind`);
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) if (x || z) assert.notEqual(zoneOf(x, z, look), 'commercial', `look ${look}: stage 1 is the edge of town`);
    assert.equal(zoneOf(2, 1, look), zoneOf(2, 1, look));
  }
});

test('new decoration blocks fit their zone', () => {
  for (const seed of [1, 2, 3, 4]) {
    const s = grown(seed);
    for (const [k, b] of Object.entries(s.map.blocks)) {
      const [bx, bz] = k.split(',').map(Number);
      if (b.kind === 'place' || b.kind === 'colony' || Math.max(Math.abs(bx), Math.abs(bz)) < 2) continue;
      assert.ok(FILLER_BY_ZONE[zoneOf(bx, bz, s.map.look)].includes(b.kind), `${seed} ${k}: ${b.kind} in ${zoneOf(bx, bz, s.map.look)}`);
    }
  }
});

test('props in context: washing lines by houses, benches and fountains in parks and squares, no shops or yards in the outskirts', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const s = grown(seed);
    const roads = new Set(s.map.roads); const layout = computeLayout(s.map); const rail = railLine(s.map);
    for (const [k, b] of Object.entries(s.map.blocks)) {
      if (b.kind === 'colony') continue;
      const [bx, bz] = k.split(',').map(Number);
      const d = districtOf(bx, bz, s.map.look);
      const cp = centerpieceOf(b.kind, d);
      if (cp?.[0] === 'fountain') assert.ok(d === 'downtown' || d === 'residential', `${k}: fountain in ${d}`);
      const plan = b.kind === 'place' ? layout[b.placeId].plan : placePlan(`${b.kind}@`, b.kind, bx, bz, roads, cp ? [cp[1], cp[2]] : [0, 0], b.front, rail);
      for (const [, , what] of blockPieces(b, bx, bz, plan, undefined, d)) {
        if (what === 'laundry') assert.equal(d, 'residential', `${k}: washing line`);
        if (what === 'bench') assert.ok(b.kind === 'park' || b.kind === 'plaza', `${k}: bench in a ${b.kind}`);
        if (d === 'outskirts') assert.ok(!['shop', 'yard', 'office', 'tower', 'cinema', 'garage', 'rows'].includes(what), `${k}: ${what} in the outskirts`);
      }
    }
  }
});

// ---------------------------------------------------------------- Part B: tiers, zones, resources (rules)
import { PLACE_RULES, TIER_STAGE, LOCATIONS, yieldsOf } from '../src/content/locations.js';
import { ITEMS } from '../src/content/items.js';
import { ORIGINALS, locDef } from '../src/core/map.js';
import { LOCATION_BUILDERS_HD } from '../src/render/buildings.js';

test('places land in a zone and tier that fit them; tier 3 never before stage 3', () => {
  let n = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const s = createGame({ seed, players: 1 });
    for (let stage = 2; stage <= 5; stage++) {
      const before = new Set(Object.keys(s.map.blocks));
      growCity(s);
      for (const [k, b] of Object.entries(s.map.blocks)) {
        if (before.has(k) || b.kind !== 'place') continue;
        const type = b.type ?? b.placeId; const rule = PLACE_RULES[type];
        assert.ok(rule, `${type} has rules`);
        assert.ok(TIER_STAGE[rule.tier] <= stage, `seed ${seed}: ${type} (tier ${rule.tier}) at stage ${stage}`);
        if (!ORIGINALS.includes(type)) { assert.ok(rule.zones.includes(zoneOf(...k.split(',').map(Number), s.map.look)), `seed ${seed}: ${type} at ${k}`); n++; }
      }
    }
  }
  assert.ok(n > 40);
});

test('every stage holds a food, a wood and a metal source; resource areas are the best source of theirs', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const s = createGame({ seed, players: 1 });
    for (let stage = 2; stage <= 5; stage++) {
      growCity(s);
      const types = Object.values(s.map.blocks).filter((b) => b.kind === 'place').map((b) => b.type ?? b.placeId);
      for (const r of ['food', 'wood', 'metal']) assert.ok(types.some((t) => yieldsOf(t, ITEMS)[r]), `seed ${seed} stage ${stage}: ${r}`);
    }
  }
  const share = (t, ids) => { const d = LOCATIONS[t].deck; const all = Object.values(d).reduce((a, b) => a + b, 0); return ids.reduce((a, id) => a + (d[id] ?? 0), 0) / all; };
  for (const t of Object.keys(LOCATIONS)) {
    if (t === 'colony') continue;
    if (t !== 'forest') assert.ok(share('forest', ['wood']) > share(t, ['wood']), `forest beats ${t} for wood`);
    if (t !== 'scrapyard') assert.ok(share('scrapyard', ['scrap', 'motor-junk', 'scrap-plate']) > share(t, ['scrap', 'motor-junk', 'scrap-plate']), `scrapyard beats ${t} for metal`);
  }
});

test('new place types have a model and Thai text; an unknown type from a save falls back to a shop', async () => {
  const th = (await import('../src/i18n/content.th.js')).default;
  for (const t of Object.keys(PLACE_RULES)) { assert.ok(LOCATION_BUILDERS_HD[t], `${t} model`); assert.ok(th.locations[t]?.name, `${t} th`); }
  const s = createGame({ seed: 1, players: 1 });
  s.locations.grocery.type = 'removed-type';
  assert.equal(locDef(s, 'grocery').id, 'grocery');
});
