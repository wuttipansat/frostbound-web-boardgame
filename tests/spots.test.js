// GAME-1: small search spots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/core/state.js';
import { growCity } from '../src/core/rules/city.js';
import { reduce, serialize, deserialize } from '../src/core/reducer.js';
import * as act from '../src/core/actions.js';
import { draftPick } from '../src/core/actions.js';
import { RULES, ENERGY } from '../src/core/constants.js';
import { isSpot, roadDistance } from '../src/core/map.js';
import { actionCost, walkCost } from '../src/core/selectors.js';
import { restock } from '../src/core/rules/flow.js';
import { SPOT_RULES } from '../src/content/locations.js';
import { simulate } from '../src/ai/simulate.js';

const started = (seed = 3) => { let s = createGame({ seed, players: 1 }); s = reduce(s, draftPick(s.team.draftOptions.slice(0, RULES.TEAM_START))); s = structuredClone(s); s.phase = 'turn'; s.pendingCrossroads = null; return s; };

test('spots: a few near the colony at the start, 2–4 per growth, never on a place, stable as the city grows', () => {
  const s = createGame({ seed: 5, players: 1 });
  assert.equal(Object.keys(s.map.spots).length, SPOT_RULES.START.length);
  let before = JSON.stringify(s.map.spots);
  for (let i = 0; i < 3; i++) {
    const n0 = Object.keys(s.map.spots).length; growCity(s); const n1 = Object.keys(s.map.spots).length;
    assert.ok(n1 - n0 >= SPOT_RULES.PER_GROWTH[0] && n1 - n0 <= SPOT_RULES.PER_GROWTH[1], `${n1 - n0} new spots`);
    const old = JSON.parse(before); for (const [id, sp] of Object.entries(old)) assert.deepEqual(s.map.spots[id], sp, `${id} unchanged`);
    before = JSON.stringify(s.map.spots);
  }
  for (const [id, sp] of Object.entries(s.map.spots)) {
    const b = s.map.blocks[sp.block]; assert.ok(b && b.kind !== 'place' && b.kind !== 'colony', id);
    assert.ok(isSpot(s, id)); assert.ok(s.locations[id].deck.length >= 2 && s.locations[id].deck.length <= 4);
  }
  assert.equal(Object.keys(createGame({ seed: 5, players: 1, fullTown: true }).map.spots ?? {}).length, 0, 'the old town has none');
});

test('spots: walking uses the road to their block; a search is cheaper, draws, empties the spot for good', () => {
  let s = started();
  const id = Object.keys(s.map.spots)[0]; const sv = s.team.survivors[0];
  assert.equal(walkCost(s, 'colony', id), Math.min(ENERGY.WALK_CAP, ENERGY.WALK_BASE + ENERGY.WALK_BLOCK * roadDistance(s, 'colony', id)));
  s.survivors[sv].location = id; s.survivors[sv].ap = 200;
  const place = Object.keys(s.locations).find((l) => l !== 'colony' && !isSpot(s, l));
  const spotCost = actionCost(s, sv, 'search');
  s.survivors[sv].location = place; const placeCost = actionCost(s, sv, 'search'); s.survivors[sv].location = id;
  assert.ok(spotCost < placeCost, `${spotCost} < ${placeCost}`);
  while (s.locations[id].deck.length) { s.survivors[sv].pack = []; s.survivors[sv].acted = false; s = reduce(s, act.search(sv)); }
  assert.equal(s.locations[id].deck.length, 0);
  s.day = 5; restock(s);
  assert.equal(s.locations[id].deck.length, 0, 'never restocked');
});

test('spots: a save round trip keeps them; the bot plays with them without illegal actions', () => {
  const s = createGame({ seed: 9, players: 1 }); growCity(s);
  const back = deserialize(serialize(s));
  assert.deepEqual(back.map.spots, s.map.spots);
  for (const seed of [1, 2, 3]) { const { errors } = simulate({ scenarioId: 'crawler', seed, difficulty: 'normal' }); assert.equal(errors.length, 0, `seed ${seed}`); }
});
