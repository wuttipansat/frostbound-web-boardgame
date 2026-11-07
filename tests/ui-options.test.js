import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickDie, survivorOptions, moveOption, cardOptions } from '../src/ui/options.js';
import { startedGame, setSurvivors, setDice, giveCard, patch } from './_helpers.js';
import { t, setLang, EN_STRINGS, TH_STRINGS, c } from '../src/i18n/index.js';
import { formatLog, describeEffects } from '../src/i18n/format.js';
import { simulate } from '../src/ai/simulate.js';
import { CRISES } from '../src/content/crises.js';
import { CROSSROADS } from '../src/content/crossroads.js';

test('pickDie prefers the cheapest sufficient die and honours a preferred die', () => {
  let s = startedGame();
  s = setDice(s, s.activePlayerId, [6, 3, 4]);
  assert.equal(pickDie(s, s.activePlayerId, 4), 2);
  assert.equal(pickDie(s, s.activePlayerId, 1), 1);
  assert.equal(pickDie(s, s.activePlayerId, 1, 0), 0);
  assert.equal(pickDie(patch(s, (x) => { x.players.find((p) => p.id === s.activePlayerId).dice.forEach((d) => { d.used = true; }); }), s.activePlayerId), null);
});

test('survivor options mirror the engine: enabled only when legal, with the reason otherwise', () => {
  let s = startedGame();
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, { 'corwin-daly': 'police' });
  s = setDice(s, pid, [2, 5]);
  s = patch(s, (x) => { x.locations.police.zombies = 1; });
  const opts = Object.fromEntries(survivorOptions(s, pid, 'corwin-daly').map((o) => [o.id, o]));
  assert.ok(opts.attack.ok);
  assert.equal(opts.attack.die, 1, 'attack needs 3+, so the 5 is used');
  assert.ok(opts.search.ok);
  assert.equal(opts.clean.ok, false);
  assert.equal(opts.clean.error, 'mustBeInColony');
  assert.ok(opts.lure.ok);
  const colony = setSurvivors(s, pid, { 'corwin-daly': 'colony' });
  const copt = Object.fromEntries(survivorOptions(colony, pid, 'corwin-daly').map((o) => [o.id, o]));
  assert.equal(copt.search.error, 'cannotSearchColony');
});

test('move and card options', () => {
  let s = startedGame();
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, { 'corwin-daly': 'colony' });
  assert.ok(moveOption(s, pid, 'corwin-daly', 'school').ok);
  assert.equal(moveOption(s, pid, 'corwin-daly', 'colony').error, 'sameLocation');
  let fuel; [s, fuel] = giveCard(s, pid, 'jerry-can');
  assert.equal(moveOption(s, pid, 'corwin-daly', 'school', true).fuel, fuel);
  const fuelOpts = cardOptions(s, pid, fuel);
  assert.deepEqual(fuelOpts.map((o) => o.id), ['contribute', 'deposit'], 'fuel is used when moving, not played');
  assert.ok(fuelOpts.find((o) => o.id === 'deposit').ok);
  let gun; [s, gun] = giveCard(s, pid, 'tire-iron');
  assert.equal(cardOptions(s, pid, gun, { survivorId: 'corwin-daly' })[0].error, 'noZombiesHere');
});

test('every English UI key has a Thai translation', () => {
  const missing = Object.keys(EN_STRINGS).filter((k) => !(k in TH_STRINGS));
  assert.deepEqual(missing, []);
});

test('t() interpolates and switches language; content falls back to English', () => {
  setLang('en');
  assert.equal(t('hud.turn', { name: 'Ana' }), "Ana's turn");
  setLang('th');
  assert.equal(t('hud.turn', { name: 'Ana' }), 'ตาของ Ana');
  assert.equal(c('locations', 'police', 'name'), 'สถานีตำรวจ');
  assert.equal(c('survivors', 'maren-holt', 'name'), 'Maren Holt', 'names fall back to English');
  setLang('en');
  assert.equal(c('locations', 'police', 'name'), 'Police Station');
});

test('every log entry from real games formats in both languages without placeholders left over', () => {
  for (const lang of ['en', 'th']) {
    setLang(lang);
    for (let seed = 1; seed <= 6; seed++) {
      const { state } = simulate({ players: 4, scenarioId: 'purge', seed, chaos: 0.3, betrayer: 'always' });
      for (const e of state.log) {
        const line = formatLog(e, state);
        if (line == null) continue;
        assert.ok(!/\{\w+\}/.test(line), `${lang}: ${e.k} -> ${line}`);
        assert.ok(!line.includes('undefined'), `${lang}: ${e.k} -> ${line}`);
      }
    }
  }
  setLang('en');
});

test('effects of every crisis and crossroads card describe cleanly', () => {
  for (const lang of ['en', 'th']) {
    setLang(lang);
    for (const cr of CRISES) assert.ok(!/\{\w+\}|undefined/.test(describeEffects(cr.fail)), cr.id);
    for (const x of CROSSROADS) for (const ch of x.choices) assert.ok(!/\{\w+\}|undefined/.test(describeEffects(ch.effects)), x.id);
  }
  setLang('en');
});
