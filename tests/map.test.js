import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce, tryReduce } from '../src/core/reducer.js';
import * as a from '../src/core/actions.js';
import { createGame } from '../src/core/state.js';
import { growCity } from '../src/core/rules/city.js';
import { mapRange, allReachable, outsideOf, roadDistance, START_MAP } from '../src/core/map.js';
import { walkCost } from '../src/core/selectors.js';
import { simulate } from '../src/ai/simulate.js';
import { startedGame, setSurvivors, setEnergy, patch } from './_helpers.js';

const key = (k) => k.split(',').map(Number);

test('map: stage 1 is the 3×3 town, every place a street away', () => {
  const s = createGame({ seed: 1 });
  assert.equal(s.map.stage, 1);
  assert.equal(Object.keys(s.map.blocks).length, 9);
  assert.ok(allReachable(s));
  for (const id of outsideOf(s)) assert.equal(walkCost(s, 'colony', id), 16);
});

test('map: growth keeps old blocks, stays connected, every place has a road (fuzz, stages 2–5)', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const s = createGame({ seed });
    for (let n = 2; n <= 5; n++) {
      const before = JSON.stringify(s.map.blocks);
      growCity(s);
      assert.equal(s.map.stage, n);
      for (const [k, b] of Object.entries(JSON.parse(before))) assert.deepEqual(s.map.blocks[k], b, `seed ${seed}: block ${k} kept`);
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
