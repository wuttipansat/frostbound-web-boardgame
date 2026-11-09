// Wounds and deaths without a danger deck (until HP fights in rework step 6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startedGame, setSurvivors, patch } from './_helpers.js';
import { woundSurvivor } from '../src/core/rules/helpers.js';

test('3 wounds kill (stoic survives until 4); a death costs morale', () => {
  let s = startedGame();
  s = setSurvivors(s, { 'corwin-daly': 'colony', 'greta-vos': 'colony' });
  s = patch(s, (x) => { x.survivors['corwin-daly'].wounds = 2; x.survivors['greta-vos'].wounds = 2; x.morale = 8; });
  const r = patch(s, (x) => { woundSurvivor(x, 'corwin-daly'); woundSurvivor(x, 'greta-vos'); });
  assert.equal(r.survivors['corwin-daly'].alive, false);
  assert.equal(r.morale, 7);
  assert.ok(!r.team.survivors.includes('corwin-daly'));
  assert.equal(r.survivors['greta-vos'].alive, true);
  assert.equal(r.survivors['greta-vos'].wounds, 3);
});

test('a team that loses its last survivor recruits a replacement in the colony', () => {
  let s = startedGame();
  s = setSurvivors(s, { 'corwin-daly': 'school' });
  s = patch(s, (x) => { x.survivors['corwin-daly'].wounds = 2; });
  const deckBefore = s.survivorDeck.length;
  const r = patch(s, (x) => woundSurvivor(x, 'corwin-daly'));
  assert.equal(r.team.survivors.length, 1);
  assert.equal(r.survivors[r.team.survivors[0]].location, 'colony');
  assert.equal(r.survivorDeck.length, deckBefore - 1);
});
