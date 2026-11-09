import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUTORIAL, DONE, advanceTutorial, eventForAction, tutorialVisible } from '../src/ui/tutorial.js';
import { sound, soundForLog, SOUND_NAMES } from '../src/audio/sound.js';
import { EN_STRINGS, TH_STRINGS } from '../src/i18n/index.js';
import { simulate } from '../src/ai/simulate.js';

test('tutorial: learn by doing — each step waits for the real action', () => {
  let i = advanceTutorial(0, 'next'); // welcome -> move
  assert.equal(TUTORIAL[i].id, 'move');
  assert.equal(advanceTutorial(i, 'next'), i, 'must actually move');
  i = advanceTutorial(i, 'move');
  assert.equal(TUTORIAL[i].id, 'actions');
  assert.equal(advanceTutorial(i, 'next'), i, 'must actually spend a die');
  i = advanceTutorial(i, 'dieAction');
  assert.equal(TUTORIAL[i].id, 'card');
  assert.equal(TUTORIAL[advanceTutorial(i, 'contribute')].id, 'endTurn');
  i = advanceTutorial(i, 'card');
  assert.equal(TUTORIAL[i].id, 'endTurn');
  i = advanceTutorial(i, 'endTurn');
  assert.equal(TUTORIAL[i].id, 'colony');
  assert.equal(advanceTutorial(i, 'next'), DONE);
});

test('tutorial: ending the turn early jumps to the colony step; skip ends it; colony dismissal finishes it', () => {
  assert.equal(TUTORIAL[advanceTutorial(1, 'endTurn')].id, 'colony');
  assert.equal(advanceTutorial(2, 'skip'), DONE);
  assert.equal(advanceTutorial(5, 'colonyDone'), DONE);
  assert.equal(advanceTutorial(DONE, 'next'), DONE);
});

test('tutorial visibility and action mapping', () => {
  assert.equal(tutorialVisible(0, { canAct: true, colonyShowing: false }), true);
  assert.equal(tutorialVisible(0, { canAct: false, colonyShowing: false }), false);
  const colony = TUTORIAL.findIndex((s) => s.id === 'colony');
  assert.equal(tutorialVisible(colony, { canAct: false, colonyShowing: true }), true);
  assert.equal(tutorialVisible(colony, { canAct: true, colonyShowing: false }), false);
  assert.equal(eventForAction({ type: 'SEARCH' }), 'dieAction');
  assert.equal(eventForAction({ type: 'MOVE' }), 'move');
  assert.equal(eventForAction({ type: 'END_TURN' }), 'endTurn');
  assert.equal(eventForAction({ type: 'CONTRIBUTE' }), 'contribute');
  assert.equal(eventForAction({ type: 'PLAY_CARD' }), 'card');
});

test('every tutorial step has a title and text in English and Thai', () => {
  for (const s of TUTORIAL) {
    for (const k of [`tut.${s.id}.title`, `tut.${s.id}.text`]) {
      assert.ok(EN_STRINGS[k], k);
      assert.ok(TH_STRINGS[k], `th ${k}`);
    }
  }
});

test('sound: every sound a real game asks for exists, and playing without audio is a safe no-op', () => {
  const asked = new Set();
  for (let seed = 1; seed <= 5; seed++) {
    const { state } = simulate({ scenarioId: 'purge', seed, chaos: 0.3 });
    for (const e of state.log) { const n = soundForLog(e); if (n) asked.add(n); }
  }
  for (const n of asked) assert.ok(SOUND_NAMES.includes(n), n);
  for (const n of ['ui', 'error', 'flip', 'crisis:ok', 'crisis:fail', 'exposure:bite']) assert.ok(SOUND_NAMES.includes(n), n);
  assert.doesNotThrow(() => { sound.unlock(); sound.play('attack'); sound.setAmbient(true); sound.setEnabled(false); });
});
