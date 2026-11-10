import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce, tryReduce } from '../src/core/reducer.js';
import * as a from '../src/core/actions.js';
import { isOpen, frontier } from '../src/core/selectors.js';
import { ENERGY, START_OPEN } from '../src/core/constants.js';
import { startedGame, setSurvivors, setEnergy, patch } from './_helpers.js';

const game = (where) => setEnergy(setSurvivors(startedGame({ fog: true }), where), 100);

test('fog: the town starts with the colony, grocery and gas open', () => {
  const s = game({ 'corwin-daly': 'colony' });
  assert.deepEqual([...s.unlocked].sort(), [...START_OPEN].sort());
  assert.equal(tryReduce(s, a.move('corwin-daly', 'hospital')).error, 'locked');
  assert.equal(tryReduce(s, a.move('corwin-daly', 'grocery')).ok, true);
});

test('fog: scouting from an open place opens its locked neighbours for 25 AP', () => {
  let s = game({ 'corwin-daly': 'grocery' });
  assert.deepEqual(frontier(s, 'grocery').sort(), ['police', 'school']);
  const before = s.survivors['corwin-daly'].ap;
  s = reduce(s, a.scout('corwin-daly'));
  assert.ok(isOpen(s, 'police') && isOpen(s, 'school') && !isOpen(s, 'hospital'));
  assert.equal(before - s.survivors['corwin-daly'].ap, ENERGY.COST.scout + (s.day % 3 === 0 ? ENERGY.STORM : 0));
  assert.equal(tryReduce(s, a.scout('corwin-daly')).error, 'nothingToScout');
  const home = game({ 'corwin-daly': 'colony' });
  assert.equal(tryReduce(home, a.scout('corwin-daly')).error, 'scoutFromTown');
});

test('fog: old saves without `unlocked` keep the whole town open', () => {
  const s = patch(game({ 'corwin-daly': 'colony' }), (x) => { delete x.unlocked; });
  assert.equal(tryReduce(s, a.move('corwin-daly', 'hospital')).ok, true);
});
