// Fuzz test: whole solo games played by the bot (some with random "chaos" choices),
// checking structural invariants after every single action.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../src/ai/simulate.js';
import { LOCATIONS } from '../src/content/locations.js';
import { LOCATION_IDS } from '../src/core/constants.js';

function checkInvariants(s) {
  assert.ok(s.morale >= 0 && s.morale <= s.maxMorale, 'morale in range');
  assert.ok(s.food >= 0 && s.waste >= 0 && s.helpless >= 0, 'non-negative counters');
  for (const id of LOCATION_IDS) {
    const loc = s.locations[id];
    assert.ok(loc.zombies >= 0 && loc.barricades >= 0);
    assert.ok(loc.zombies + loc.barricades <= LOCATIONS[id].zombieSlots, `${id} zombie slots`);
  }
  // Each card instance lives in at most one zone.
  const seen = new Set();
  const zones = [
    ...s.team.hand,
    ...Object.values(s.team.gear).filter(Boolean),
    ...Object.values(s.locations).flatMap((l) => l.deck ?? []),
    ...(s.crisis?.contributions ?? []),
  ];
  for (const uid of zones) {
    assert.ok(!seen.has(uid), `duplicate card ${uid}`);
    assert.ok(s.cards[uid], `unknown card ${uid}`);
    seen.add(uid);
  }
  // Every living survivor is on the team, exactly once.
  const owned = s.team.survivors;
  assert.equal(new Set(owned).size, owned.length, 'no survivor listed twice');
  for (const sv of Object.values(s.survivors)) {
    assert.equal(owned.includes(sv.id), sv.alive, `${sv.id} team membership matches alive`);
  }
  assert.ok(s.team.energy >= 0 && s.team.energy <= 100, 'energy in range');
  if (s.phase === 'crossroads') assert.ok(s.pendingCrossroads);
  assert.notEqual(s.phase, 'colony', 'colony phase never leaks between actions');
}

test('bot games run to completion in every scenario', () => {
  let games = 0;
  for (const scenarioId of ['beacon', 'stores', 'purge']) {
    for (let seed = 1; seed <= 20; seed++) {
      const { state, errors } = simulate({ scenarioId, seed, onStep: checkInvariants });
      assert.deepEqual(errors, [], `illegal bot actions in ${scenarioId}/${seed}`);
      assert.equal(state.phase, 'gameOver', `${scenarioId}/${seed} unfinished`);
      assert.ok(state.result.reason);
      games++;
    }
  }
  assert.equal(games, 60);
});

test('chaotic games (random choices) keep every invariant', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const scenarioId = ['beacon', 'stores', 'purge'][seed % 3];
    const { state, errors } = simulate({ scenarioId, seed, chaos: 0.35, onStep: checkInvariants });
    assert.deepEqual(errors, [], `illegal actions at seed ${seed}`);
    assert.equal(state.phase, 'gameOver');
    assert.deepEqual(JSON.parse(JSON.stringify(state)), state, 'state stays JSON-serializable');
  }
});

test('simulation is fully deterministic for a given seed', () => {
  const a = simulate({ scenarioId: 'stores', seed: 99, chaos: 0.2 });
  const b = simulate({ scenarioId: 'stores', seed: 99, chaos: 0.2 });
  assert.deepEqual(a.state, b.state);
});
