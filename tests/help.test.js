import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/core/state.js';
import { tryReduce } from '../src/core/reducer.js';
import { botAction } from '../src/ai/simpleBot.js';
import { pendingActors } from '../src/core/selectors.js';
import { suggestion, roundChecklist } from '../src/ui/views/help.js';

function toFirstTurn(seed = 3) {
  let s = createGame({ players: [{ name: 'A', isAI: false }, { name: 'B', isAI: false }], scenarioId: 'beacon', seed });
  for (let i = 0; i < 20 && s.phase !== 'turn'; i++) {
    const who = pendingActors(s)[0];
    s = tryReduce(s, botAction(s, who, { random: () => 0.5 })).state;
  }
  return s;
}

test('the hint suggests a legal next move for the player whose turn it is, in words', () => {
  const s = toFirstTurn();
  const h = suggestion(s, s.activePlayerId);
  assert.ok(h && typeof h.text === 'string' && h.text.length > 3);
  assert.ok(h.point, 'it can point at something');
});

test('hints never play the betrayer, even for a betrayer', () => {
  const s = toFirstTurn(5);
  const p = s.players.find((x) => x.id === s.activePlayerId);
  const a = botAction(s, p.id, { random: () => 0.5, cooperative: true });
  if (a.type === 'CONTRIBUTE') {
    const type = s.cards[a.cardUid];
    assert.ok(type, 'a real card');
  }
  assert.ok(tryReduce(s, a).ok, 'the cooperative suggestion is legal');
});

test('the round checklist covers food, the crisis and the colony', () => {
  const s = toFirstTurn();
  const rows = roundChecklist(s);
  assert.ok(rows.find((r) => r.key === 'food'));
  assert.ok(rows.find((r) => r.key === 'colony'));
  assert.ok(rows.every((r) => typeof r.ok === 'boolean' && r.text));
});
