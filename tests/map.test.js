import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce, tryReduce } from '../src/core/reducer.js';
import * as a from '../src/core/actions.js';
import { createGame } from '../src/core/state.js';
import { growCity } from '../src/core/rules/city.js';
import { mapRange, allReachable, outsideOf, roadDistance, START_MAP, isSpot } from '../src/core/map.js';
import { walkCost } from '../src/core/selectors.js';
import { simulate } from '../src/ai/simulate.js';
import { startedGame, setSurvivors, setEnergy, patch } from './_helpers.js';

const key = (k) => k.split(',').map(Number);

test('map: stage 1 is the 3×3 town with the colony, grocery and gas station; every place a street away', () => {
  const s = createGame({ seed: 1 });
  assert.equal(s.map.stage, 1);
  assert.equal(Object.keys(s.map.blocks).length, 9);
  assert.deepEqual(Object.keys(s.locations).filter((id) => !isSpot(s, id)).sort(), ['colony', 'gas', 'grocery']); // (GAME-1: plus a few search spots)
  assert.ok(allReachable(s));
  for (const id of outsideOf(s)) if (!isSpot(s, id)) assert.equal(walkCost(s, 'colony', id), 16);
});

test('map: growth keeps old blocks, stays connected, every place has a road (fuzz, stages 2–5)', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const s = createGame({ seed });
    for (let n = 2; n <= 5; n++) {
      const before = JSON.stringify(s.map.blocks);
      const places = () => Object.keys(s.locations).filter((id) => !isSpot(s, id)).length;
      const placesBefore = places();
      growCity(s);
      const gained = places() - placesBefore;
      assert.ok(gained >= 2 && gained <= 3, `seed ${seed} stage ${n}: ${gained} new places`);
      if (n === 2) for (const id of ['library', 'hospital']) assert.ok(s.locations[id], `seed ${seed}: ${id} at stage 2`);
      if (n === 3) for (const id of ['library', 'police', 'school', 'hospital']) assert.ok(s.locations[id], `seed ${seed}: ${id} by stage 3`);
      assert.equal(s.map.stage, n);
      // MAP-1d: old blocks never change (kind, place, front).
      for (const [k, b] of Object.entries(JSON.parse(before))) assert.deepEqual(s.map.blocks[k], b, `seed ${seed}: block ${k} kept`);
      for (const b of Object.values(s.map.blocks)) assert.ok(b.kind === 'colony' || b.front, 'every block has a front');
      // Connected to the colony (4-neighbour flood fill).
      const seen = new Set(['0,0']); const todo = ['0,0'];
      while (todo.length) {
        const [x, z] = key(todo.pop());
        for (const k of [`${x + 1},${z}`, `${x - 1},${z}`, `${x},${z + 1}`, `${x},${z - 1}`]) if (s.map.blocks[k] && !seen.has(k)) { seen.add(k); todo.push(k); }
      }
      assert.equal(seen.size, Object.keys(s.map.blocks).length, `seed ${seed} stage ${n}: connected`);
      for (const k of Object.keys(s.map.blocks)) assert.ok(Math.max(...key(k).map(Math.abs)) <= n + 1, 'within the outline + 1');
      assert.ok(allReachable(s), `seed ${seed} stage ${n}: every place by road`);
    }
    for (const id of outsideOf(s)) assert.ok(s.locations[id].deck.length > 0 && Number.isFinite(roadDistance(s, 'colony', id)));
  }
});

test('map: a city map always turns up within its stage range, and reading it at home grows the city', () => {
  for (let seed = 1; seed <= 40; seed++) {
    let s = setEnergy(setSurvivors(startedGame({ seed }), { 'corwin-daly': 'grocery' }), 100);
    for (let stage = 1; stage <= 3; stage++) {
      const [min, max] = mapRange(stage);
      let found = 0;
      for (let k = 1; k <= max && !found; k++) {
        s = patch(s, (x) => { x.survivors['corwin-daly'].ap = 100; x.survivors['corwin-daly'].pack = []; x.locations.grocery.zombies = 0; x.searches = {}; if (x.locations.grocery.deck.length < 3) x.locations.grocery.deck.push('c0', 'c1', 'c2'); });
        s = reduce(s, a.search('corwin-daly'));
        if (s.survivors['corwin-daly'].pack.some((u) => s.cards[u] === 'city-map-piece')) found = k;
      }
      assert.ok(found >= min && found <= max, `seed ${seed} stage ${stage}: found on search ${found} (${min}–${max})`);
      const uid = s.survivors['corwin-daly'].pack.find((u) => s.cards[u] === 'city-map-piece');
      assert.equal(tryReduce(s, a.playCard(uid)).error, 'notHome');
      s = patch(s, (x) => { x.survivors['corwin-daly'].location = 'colony'; });
      s = reduce(s, a.playCard(uid));
      assert.equal(s.map.stage, stage + 1);
      s = patch(s, (x) => { x.survivors['corwin-daly'].location = 'grocery'; });
    }
  }
});

test('map: old saves without a map load as the stage-1 town', () => {
  const s = patch(setEnergy(setSurvivors(startedGame(), { 'corwin-daly': 'colony' }), 100), (x) => { delete x.map; delete x.unlocked; });
  assert.equal(tryReduce(s, a.move('corwin-daly', 'hospital')).ok, true);
  assert.equal(walkCost(s, 'colony', 'police'), 16);
  assert.equal(START_MAP.stage, 1);
});

test('map: a bot game with growth finishes', () => {
  const { state, errors } = simulate({ seed: 7, scenarioId: 'crawler', days: 25 });
  assert.equal(errors.length, 0);
  assert.ok(state.result);
});

test('map: an old block lays out the same after the city grows (stable fronts and chunk plans)', async () => {
  const { computeLayout, placePlan } = await import('../src/render/board.js');
  const s = createGame({ seed: 5 });
  growCity(s);
  const before = computeLayout(structuredClone(s.map));
  const plans = Object.fromEntries(Object.entries(s.map.blocks).filter(([, b]) => !b.placeId).map(([k, b]) => [k, placePlan(`${b.kind}@`, b.kind, ...key(k), new Set(s.map.roads), [1, 1], b.front).covered]));
  growCity(s); growCity(s);
  const after = computeLayout(structuredClone(s.map));
  for (const [id, L] of Object.entries(before)) assert.deepEqual(after[id].center.toArray(), L.center.toArray(), `${id} stays put`);
  for (const [k, cov] of Object.entries(plans)) {
    const b = s.map.blocks[k];
    assert.deepEqual(placePlan(`${b.kind}@`, b.kind, ...key(k), new Set(s.map.roads), [1, 1], b.front).covered, cov, `block ${k} keeps its chunk plan`);
  }
});
