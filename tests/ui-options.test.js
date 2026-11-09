import { test } from 'node:test';
import assert from 'node:assert/strict';
import { survivorOptions, moveOption, cardOptions } from '../src/ui/options.js';
import { actionCost } from '../src/core/selectors.js';
import { startedGame, setSurvivors, setEnergy, giveCard, patch } from './_helpers.js';
import { t, setLang, EN_STRINGS, TH_STRINGS, c } from '../src/i18n/index.js';
import { formatLog, describeEffects } from '../src/i18n/format.js';
import { simulate } from '../src/ai/simulate.js';
import { CRISES } from '../src/content/crises.js';
import { CROSSROADS } from '../src/content/crossroads.js';

test('survivor options mirror the engine: enabled only when legal, with the reason otherwise', () => {
  let s = startedGame();
  s = setSurvivors(s, { 'corwin-daly': 'police' });
  s = setEnergy(s, 100);
  s = patch(s, (x) => { x.locations.police.zombies = 1; });
  const opts = Object.fromEntries(survivorOptions(s, 'corwin-daly').map((o) => [o.id, o]));
  assert.ok(opts.attack.ok);
  assert.equal(opts.attack.cost, actionCost(s, 'corwin-daly', 'attack'), 'each option carries its energy cost');
  const tired = Object.fromEntries(survivorOptions(setEnergy(s, 5), 'corwin-daly').map((o) => [o.id, o]));
  assert.equal(tired.attack.error, 'notEnoughEnergy');
  assert.ok(opts.search.ok);
  assert.equal(opts.clean, undefined, 'no cleaning: there is no waste');
  assert.ok(opts.lure.ok);
  const colony = setSurvivors(s, { 'corwin-daly': 'colony' });
  const copt = Object.fromEntries(survivorOptions(colony, 'corwin-daly').map((o) => [o.id, o]));
  assert.equal(copt.search.error, 'cannotSearchColony');
});

test('move and card options', () => {
  let s = startedGame();
  s = setSurvivors(s, { 'corwin-daly': 'colony' });
  assert.ok(moveOption(s, 'corwin-daly', 'school').ok);
  assert.equal(moveOption(s, 'corwin-daly', 'colony').error, 'sameLocation');
  let fuel; [s, fuel] = giveCard(s, 'jerry-can');
  assert.equal(s.cards[moveOption(s, 'corwin-daly', 'school', true).fuel], 'jerry-can');
  assert.ok(fuel);
  const fuelOpts = cardOptions(s, fuel);
  assert.deepEqual(fuelOpts.map((o) => o.id), ['contribute', 'deposit'], 'fuel is used when moving, not played');
  assert.ok(fuelOpts.find((o) => o.id === 'deposit').ok);
  let gun; [s, gun] = giveCard(s, 'glock-19');
  assert.equal(cardOptions(s, gun).some((o) => o.id === 'equip'), false, 'gear: pick who wears it (cardTargets)');
});

test('every English UI key has a Thai translation', () => {
  const missing = Object.keys(EN_STRINGS).filter((k) => !(k in TH_STRINGS));
  assert.deepEqual(missing, []);
});

test('t() interpolates and switches language; content falls back to English', () => {
  setLang('en');
  assert.equal(t('colony.title', { n: 3 }).includes('3'), true);
  setLang('th');
  assert.equal(t('panel.team'), 'ทีมของคุณ');
  assert.equal(c('locations', 'police', 'name'), 'สถานีตำรวจ');
  assert.equal(c('survivors', 'maren-holt', 'name'), 'Maren Holt', 'names fall back to English');
  setLang('en');
  assert.equal(c('locations', 'police', 'name'), 'Police Station');
});

test('every log entry from real games formats in both languages without placeholders left over', () => {
  for (const lang of ['en', 'th']) {
    setLang(lang);
    for (let seed = 1; seed <= 6; seed++) {
      const { state } = simulate({ scenarioId: 'purge', seed, chaos: 0.3 });
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

import { describeTrigger } from '../src/i18n/format.js';
import { crossChoice } from '../src/i18n/index.js';
import * as THREE from 'three';

test('every crossroads card is translated to Thai, and triggers describe cleanly', () => {
  setLang('th');
  for (const x of CROSSROADS) {
    assert.notEqual(c('crossroads', x.id, 'title'), x.title, `${x.id} title`);
    assert.notEqual(c('crossroads', x.id, 'text'), x.text, `${x.id} text`);
    for (const i of [0, 1]) assert.notEqual(crossChoice(x.id, i), x.choices[i].label, `${x.id} choice ${i}`);
    assert.ok(!/\{\w+\}|undefined/.test(describeTrigger(x.trigger)), x.id);
  }
  setLang('en');
  assert.equal(crossChoice('xr-frozen-child', 0), 'Bring him home.');
});

test('starvation log shows how many went hungry, not the food needed', () => {
  setLang('en');
  const state = {};
  assert.equal(formatLog({ k: 'starvation', need: 3, tokens: 2 }, state), 'Not enough food! 2 went hungry (−15 HP, half AP tomorrow)');
  assert.equal(formatLog({ k: 'fed', need: 3, value: 2 }, state), 'The colony eats 3 food');
});
