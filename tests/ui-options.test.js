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

import { voteTargets } from '../src/ui/options.js';
import { describeTrigger } from '../src/i18n/format.js';
import { crossChoice } from '../src/i18n/index.js';
import { suspicion } from '../src/ai/simpleBot.js';
import { exposureDieModel, EXPOSURE_DIE_FACES } from '../src/render/characters.js';
import { exposureUpQuaternion } from '../src/render/dice.js';
import * as THREE from 'three';
import { reduce } from '../src/core/reducer.js';
import * as A from '../src/core/actions.js';

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

test('vote targets follow the engine (one call per round, never yourself or an exile)', () => {
  let s = startedGame({ players: 3 });
  const pid = s.activePlayerId;
  assert.equal(voteTargets(s, pid).length, 2);
  s = patch(s, (x) => { x.players.find((p) => p.id !== pid).exiled = true; });
  assert.equal(voteTargets(s, pid).length, 1);
  s = patch(s, (x) => { x.players.find((p) => p.id === pid).lastVoteRound = x.round; });
  assert.deepEqual(voteTargets(s, pid), []);
});

test('suspicion counts contributions to failed crises from the public log', () => {
  const s = { log: [
    { k: 'contribute', playerId: 'p1' }, { k: 'contribute', playerId: 'p1' }, { k: 'contribute', playerId: 'p0' },
    { k: 'crisisResolved', success: false },
    { k: 'contribute', playerId: 'p0' },
    { k: 'crisisResolved', success: true },
  ] };
  assert.deepEqual(suspicion(s), { p1: 2, p0: 0 });
});

test('exposure die: every face lands face-up with the right symbol on top', () => {
  const m = exposureDieModel();
  const colored = (pred) => [...m.voxels.values()].filter((v) => v.color !== 0x2b3442 && pred(v));
  assert.ok(colored((v) => v.y === 0).some((v) => v.color === 0x8e1b1b), 'bite face has a red background on -y');
  assert.ok(colored((v) => v.z === 6).some((v) => v.color === 0xd4352b), 'wound symbol on +z');
  for (const face of ['blank', 'wound', 'frostbite', 'bite']) {
    for (const alt of [false, true]) {
      const q = exposureUpQuaternion(face, alt);
      const key = alt && EXPOSURE_DIE_FACES[`${face}2`] ? `${face}2` : face;
      const up = new THREE.Vector3(...EXPOSURE_DIE_FACES[key]).applyQuaternion(q);
      assert.ok(up.y > 0.999, `${face}${alt ? ' alt' : ''}`);
    }
  }
});

test('a full exile vote round-trip through the engine produces the report the result modal reads', () => {
  let s = startedGame({ players: 3 });
  const [a0, a1, a2] = s.players.map((p) => p.id);
  s = patch(s, (x) => { x.activePlayerId = a0; });
  s = reduce(s, A.callVote(a0, a2));
  s = reduce(s, A.castVote(a1, true));
  assert.deepEqual(s.reports.vote, { targetId: a2, yes: 2, no: 0, passed: true });
  assert.ok(s.players.find((p) => p.id === a2).exiled);
});

test('starvation log shows the token count, not the food needed', () => {
  setLang('en');
  const state = { players: [] };
  assert.equal(formatLog({ k: 'starvation', need: 3, tokens: 1 }, state), 'Not enough food! Starvation 1');
  assert.equal(formatLog({ k: 'fed', need: 3, value: 2 }, state), 'The colony eats 3 food');
});
