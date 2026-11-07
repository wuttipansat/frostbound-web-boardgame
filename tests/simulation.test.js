// Fuzz test: whole games played by bots (some with random "chaos" choices),
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
    ...s.players.flatMap((p) => p.hand),
    ...Object.values(s.locations).flatMap((l) => l.deck ?? []),
    ...(s.crisis?.contributions.map((c) => c.uid) ?? []),
  ];
  for (const uid of zones) {
    assert.ok(!seen.has(uid), `duplicate card ${uid}`);
    assert.ok(s.cards[uid], `unknown card ${uid}`);
    seen.add(uid);
  }
  // Every living survivor belongs to exactly one player's list.
  const owned = s.players.flatMap((p) => p.survivors);
  assert.equal(new Set(owned).size, owned.length, 'no survivor owned twice');
  for (const sv of Object.values(s.survivors)) {
    assert.equal(owned.includes(sv.id), sv.alive, `${sv.id} ownership matches alive`);
  }
  for (const p of s.players) for (const d of p.dice) assert.ok(d.v >= 1 && d.v <= 6);
  if (s.phase === 'crossroads') assert.ok(s.pendingCrossroads);
  if (s.phase === 'vote') assert.ok(s.vote);
  assert.notEqual(s.phase, 'colony', 'colony phase never leaks between actions');
}

test('bot games run to completion across every scenario and player count', () => {
  let games = 0;
  for (const scenarioId of ['beacon', 'stores', 'purge']) {
    for (const players of [2, 3, 4, 5]) {
      for (let seed = 1; seed <= 6; seed++) {
        const { state, errors } = simulate({ players, scenarioId, seed, onStep: checkInvariants });
        assert.deepEqual(errors, [], `illegal bot actions in ${scenarioId}/${players}/${seed}`);
        assert.equal(state.phase, 'gameOver', `${scenarioId}/${players}/${seed} unfinished`);
        assert.ok(state.result.reason);
        games++;
      }
    }
  }
  assert.equal(games, 72);
});

test('chaotic games (random choices, votes, requests) keep every invariant', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const scenarioId = ['beacon', 'stores', 'purge'][seed % 3];
    const players = 2 + (seed % 4);
    const { state, errors } = simulate({ players, scenarioId, seed, chaos: 0.35, betrayer: 'always', onStep: checkInvariants });
    assert.deepEqual(errors, [], `illegal actions at seed ${seed}`);
    assert.equal(state.phase, 'gameOver');
    assert.deepEqual(JSON.parse(JSON.stringify(state)), state, 'state stays JSON-serializable');
  }
});

test('simulation is fully deterministic for a given seed', () => {
  const a = simulate({ players: 4, scenarioId: 'stores', seed: 99, chaos: 0.2 });
  const b = simulate({ players: 4, scenarioId: 'stores', seed: 99, chaos: 0.2 });
  assert.deepEqual(a.state, b.state);
});
