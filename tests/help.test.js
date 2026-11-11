import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/core/state.js';
import { tryReduce } from '../src/core/reducer.js';
import { botAction } from '../src/ai/simpleBot.js';
import { suggestion, roundChecklist } from '../src/ui/views/help.js';

function toFirstTurn(seed = 3) {
  let s = createGame({ scenarioId: 'beacon', seed });
  for (let i = 0; i < 20 && s.phase !== 'turn'; i++) s = tryReduce(s, botAction(s, { random: () => 0.5 })).state;
  return s;
}

test('the hint suggests a legal next move, in words', () => {
  const s = toFirstTurn();
  const h = suggestion(s);
  assert.ok(h && typeof h.text === 'string' && h.text.length > 3);
  assert.ok(h.point, 'it can point at something');
  assert.ok(tryReduce(s, botAction(s, { random: () => 0.5 })).ok, 'the suggestion is legal');
});
test('the round checklist covers food, the crisis and the colony', () => {
  const s = toFirstTurn();
  const rows = roundChecklist(s);
  assert.ok(rows.find((r) => r.key === 'food'));
  assert.ok(rows.find((r) => r.key === 'colony'));
  assert.ok(rows.every((r) => typeof r.ok === 'boolean' && r.text));
});

test('help text: no day limit, naps, scouting or fog; the city map is explained (th + en)', async () => {
  const { TH_STRINGS, EN_STRINGS } = await import('../src/i18n/index.js');
  for (const dict of [TH_STRINGS, EN_STRINGS]) {
    const help = Object.entries(dict).filter(([k]) => k.startsWith('rules.') || k.startsWith('tut.')).map(([, v]) => v).join(' ');
    for (const word of ['40 วัน', '40 days', 'งีบ', 'Nap', 'nap ', 'สำรวจ', 'scout', 'หมอก', 'fog']) assert.ok(!help.includes(word), `help mentions "${word}"`);
    assert.ok(dict['rules.map.text'], 'map rules');
  }
});
