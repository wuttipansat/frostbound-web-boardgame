import { test } from 'node:test';
import assert from 'node:assert/strict';
import { journalEntries, daySummary, highlights, journalLine, dayTotals } from '../src/ui/journal.js';
import { windGain, crackleChance } from '../src/audio/sound.js';
import { setLang } from '../src/i18n/index.js';

const state = () => ({
  round: 3,
  players: [{ id: 'p0', name: 'Ana' }, { id: 'p1', name: 'Ben' }],
  log: [
    { r: 1, k: 'search', playerId: 'p0', survivorId: 'maren', locationId: 'hospital', count: 2, card: { defId: 'secret' } },
    { r: 1, k: 'move', playerId: 'p0', survivorId: 'maren', from: 'colony', to: 'hospital' },
    { r: 1, k: 'attack', playerId: 'p1', survivorId: 'tank', locationId: 'police', killed: 2 },
    { r: 1, k: 'morale', delta: -1, value: 7 },
    { r: 2, k: 'death', survivorId: 'maren', playerId: 'p0', cause: 'bite', location: 'hospital' },
    { r: 2, k: 'morale', delta: -1, value: 6 },
    { r: 2, k: 'crisisResolved', crisisId: 'feverWard', required: 2, score: 0, success: false },
    { r: 2, k: 'exiled', playerId: 'p1' },
  ],
});

test('journal: public facts only, in order, one entry per notable event', () => {
  setLang?.('en');
  const j = journalEntries(state());
  assert.deepEqual(j.map((x) => x.key), ['search', 'kills', 'death', 'crisisFail', 'exiled']);
  const text = j.map(journalLine).join('\n');
  assert.ok(!/secret/i.test(text), 'never which card');
  assert.match(text, /^Day 1 — /);
});

test('day summary counts the round, quiet days say so', () => {
  assert.deepEqual(dayTotals(state(), 1), { deaths: 0, kills: 2, found: 2, morale: -1 });
  assert.match(daySummary(state(), 2), /1 lost/);
  assert.match(daySummary(state(), 3), /quiet/);
});

test('highlights keep the heaviest lines in story order', () => {
  const hl = highlights(state(), 2);
  assert.deepEqual(hl.map((x) => x.key), ['death', 'exiled']);
});

test('ambience follows the weather', () => {
  assert.ok(windGain(1) > windGain(0.2));
  assert.ok(crackleChance(0.05) < 0.1 && crackleChance(1.2) <= 0.9);
});
