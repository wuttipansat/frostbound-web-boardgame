import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce } from '../src/core/reducer.js';
import * as a from '../src/core/actions.js';
import { colonyPhase, resolveCrisis, spawnZombies, endGame } from '../src/core/rules/flow.js';
import { addZombies } from '../src/core/rules/helpers.js';
import { foodNeeded, crisisRequirement } from '../src/core/selectors.js';
import { startedGame, setSurvivors, giveCard, patch, topDanger } from './_helpers.js';

/** A started solo game with the team placed as given. */
function team(placements, opts = {}) {
  return setSurvivors(startedGame(opts), placements);
}

test('food need: 1 per 2 colony residents incl. helpless; the cook saves 1', () => {
  let s = team({ 'corwin-daly': 'colony', 'agnes-pell': 'colony', 'greta-vos': 'colony', 'bo-lindqvist': 'school' });
  s = patch(s, (x) => { x.helpless = 2; });
  assert.equal(foodNeeded(s), 3); // 3 residents + 2 helpless = 5 -> 3
  s = setSurvivors(s, { 'corwin-daly': 'colony', 'agnes-pell': 'colony', 'pim-arunrat': 'colony', 'bo-lindqvist': 'school' });
  assert.equal(foodNeeded(s), 2);
});

test('colony phase pays food or adds escalating starvation', () => {
  let s = team({ 'corwin-daly': 'colony', 'greta-vos': 'colony' });
  s = patch(s, (x) => { x.helpless = 2; x.food = 5; x.morale = 8; x.crisis.contributions = []; });
  const fed = patch(s, (x) => { x.crisis = { id: 'whiteout', contributions: [] }; colonyPhase(x); });
  assert.equal(fed.reports.colony.fed, true);
  assert.equal(fed.food, 3);

  const starving = patch(s, (x) => { x.food = 0; x.starvation = 1; x.crisis = { id: 'empty-pantry', contributions: [] }; colonyPhase(x); });
  assert.equal(starving.starvation, 2);
  assert.ok(starving.log.some((e) => e.k === 'morale' && e.reason === 'starvation' && e.delta === -2));
});

test('every 10 waste costs 1 morale in the colony phase', () => {
  let s = team({ 'corwin-daly': 'police', 'greta-vos': 'police' });
  s = patch(s, (x) => { x.helpless = 0; x.waste = 23; x.morale = 8; colonyPhase(x); });
  assert.equal(s.reports.colony.wasteLoss, 2);
  assert.ok(s.log.some((e) => e.k === 'morale' && e.reason === 'waste' && e.delta === -2));
});

test('crisis: matching +1, others -1; tinkerer junk counts; failure applies effects', () => {
  let s = team({ 'ambrose-lark': 'colony', 'greta-vos': 'colony' });
  s = patch(s, (x) => { x.crisis = { id: 'whiteout', contributions: [] }; x.morale = 8; });
  assert.equal(crisisRequirement(s), 1);
  let fuel, junk, food, fuel2;
  [s, fuel] = giveCard(s, 'jerry-can');
  [s, junk] = giveCard(s, 'bedpan');
  [s, food] = giveCard(s, 'canned-beans');
  [s, fuel2] = giveCard(s, 'jerry-can');
  const run = (list) => patch(s, (x) => { x.crisis.contributions = list; x.result = resolveCrisis(x); });

  const ok = run([fuel, junk]);
  assert.equal(ok.result.score, 2);
  assert.equal(ok.result.success, true);
  assert.equal(ok.morale, 8, 'beat by 1: no bonus');
  assert.equal(run([fuel, junk, fuel2]).morale, 9, 'beat by 2+ gives a morale bonus');

  const noTinkerer = patch(setSurvivors(s, { 'greta-vos': 'colony' }), (x) => { x.crisis.contributions = [fuel, junk]; x.result = resolveCrisis(x); });
  assert.equal(noTinkerer.result.score, 0, 'junk counts against without Ambrose');

  const wrong = run([fuel, food]);
  assert.equal(wrong.result.score, 0);
  assert.equal(wrong.result.success, false);
  assert.equal(wrong.morale, 7, 'whiteout: -1 morale');
  assert.equal(wrong.locations.colony.zombies, 2, 'whiteout: 2 zombies at the colony');
  assert.equal(wrong.waste, s.waste + 2, 'contributed cards go to waste');
});

test('inspire adds morale when a crisis is averted', () => {
  let s = team({ 'kanya-srisuk': 'colony' });
  let fuel;
  [s, fuel] = giveCard(s, 'jerry-can');
  s = patch(s, (x) => { x.morale = 5; x.crisis = { id: 'whiteout', contributions: [fuel] }; resolveCrisis(x); });
  assert.equal(s.morale, 6);
});

test('spawning: ceil(n/2) outside, ceil(n/3) at colony; quiet guide reduces', () => {
  let s = team({ 'corwin-daly': 'school', 'agnes-pell': 'school', 'silas-thorn': 'library', 'greta-vos': 'library' });
  s = patch(s, (x) => { x.helpless = 2; x.spawns = spawnZombies(x); });
  assert.deepEqual(s.spawns, { school: 1, colony: 1 });
});

test('overrun: a full entrance kills the lowest-influence survivor; colony loses helpless first', () => {
  let s = team({ 'corwin-daly': 'school', 'dot-ferreira': 'school', 'greta-vos': 'colony' });
  s = patch(s, (x) => { x.locations.school.zombies = 3; x.morale = 8; addZombies(x, 'school', 1); });
  assert.equal(s.survivors['dot-ferreira'].alive, false);
  assert.equal(s.survivors['corwin-daly'].alive, true);

  s = patch(s, (x) => { x.locations.colony.zombies = 12; x.helpless = 1; addZombies(x, 'colony', 2); });
  assert.equal(s.helpless, 0);
  assert.equal(s.survivors['greta-vos'].alive, false);
});

test('barricades absorb zombies before they fill slots', () => {
  let s = startedGame();
  s = patch(s, (x) => { x.locations.gas.barricades = 2; addZombies(x, 'gas', 3); });
  assert.equal(s.locations.gas.barricades, 0);
  assert.equal(s.locations.gas.zombies, 1);
});

test('the game ends won or lost: there are no secret objectives', () => {
  const s = team({ 'corwin-daly': 'colony' });
  const won = patch(s, (x) => endGame(x, 'objectiveComplete'));
  assert.deepEqual(won.result, { reason: 'objectiveComplete', won: true });
  const lost = patch(s, (x) => endGame(x, 'timeOut'));
  assert.deepEqual(lost.result, { reason: 'timeOut', won: false });
});

test('scenario goal is checked in the colony phase; time running out ends the game', () => {
  let s = team({ 'corwin-daly': 'colony' });
  s = patch(s, (x) => { x.scenario.deposited = 2; x.food = 10; x.crisis = { id: 'whiteout', contributions: [] }; colonyPhase(x); });
  assert.equal(s.phase, 'gameOver');
  assert.equal(s.result.reason, 'objectiveComplete');

  let t = team({ 'corwin-daly': 'colony' });
  t = patch(t, (x) => { x.round = x.scenario.rounds; x.food = 10; x.crisis = { id: 'whiteout', contributions: [] }; colonyPhase(x); });
  assert.equal(t.result.reason, 'timeOut');
});

test('kills scenario goal', () => {
  let k = team({ 'corwin-daly': 'colony' }, { scenarioId: 'purge' });
  k = patch(k, (x) => { x.totalKills = 5; x.food = 10; x.crisis = { id: 'whiteout', contributions: [] }; colonyPhase(x); });
  assert.notEqual(k.result?.reason, 'objectiveComplete', 'needs 6');
  k = patch(k, (x) => { x.totalKills = 6; x.phase = 'turn'; x.crisis = { id: 'whiteout', contributions: [] }; colonyPhase(x); });
  assert.equal(k.result?.reason, 'objectiveComplete');
});

test('stockpile goal requires food AND a clear gate', () => {
  const base = (food, zombies) => {
    const f = team({ 'corwin-daly': 'school' }, { scenarioId: 'stores' });
    return patch(f, (x) => {
      const uid = Object.keys(x.cards)[0];
      x.cards[uid] = 'jerry-can';
      x.helpless = 0; x.food = food; x.locations.colony.zombies = zombies;
      x.crisis = { id: 'whiteout', contributions: [uid] };
      colonyPhase(x);
    });
  };
  assert.equal(base(6, 0).result?.reason, 'objectiveComplete');
  assert.equal(base(6, 3).result?.reason, 'objectiveComplete', 'exactly 3 zombies is allowed');
  assert.notEqual(base(6, 4).result?.reason, 'objectiveComplete', 'too many zombies at the gate');
  assert.notEqual(base(5, 0).result?.reason, 'objectiveComplete');
});

test('morale hitting 0 mid-turn ends the game immediately', () => {
  let s = team({ 'corwin-daly': 'colony' });
  s = patch(s, (x) => { x.morale = 1; x.locations.school.zombies = 1; });
  const r = reduce(topDanger(s, 'bite'), a.move('corwin-daly', 'school'));
  assert.equal(r.survivors['corwin-daly'].alive, false);
  assert.equal(r.phase, 'gameOver');
  assert.equal(r.result.reason, 'moraleCollapse');
  assert.throws(() => reduce(r, a.endTurn()), /gameOver/);
});
