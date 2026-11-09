import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce } from '../src/core/reducer.js';
import * as a from '../src/core/actions.js';
import { colonyPhase, resolveCrisis, spawnZombies, endGame } from '../src/core/rules/flow.js';
import { addZombies } from '../src/core/rules/helpers.js';
import { foodNeeded, foodDays, crisisRequirement, crisisScore } from '../src/core/selectors.js';
import { startedGame, setSurvivors, giveCard, patch } from './_helpers.js';

/** A started solo game with the team placed as given. */
function team(placements, opts = {}) {
  return setSurvivors(startedGame(opts), placements);
}

test('food need: everyone at the colony eats 1; the cook saves 1', () => {
  let s = team({ 'corwin-daly': 'colony', 'agnes-pell': 'colony', 'greta-vos': 'colony', 'nia-calloway': 'colony', 'osei-vance': 'colony', 'bo-lindqvist': 'school' });
  assert.equal(foodNeeded(s), 5);
  s = setSurvivors(s, { 'corwin-daly': 'colony', 'agnes-pell': 'colony', 'pim-arunrat': 'colony', 'nia-calloway': 'colony', 'osei-vance': 'colony', 'bo-lindqvist': 'school' });
  assert.equal(foodNeeded(s), 4);
  s.food = 9;
  assert.equal(foodDays(s), 2);
});

test('going hungry: −15 HP for those left out, morale −1, half AP the next day', () => {
  let s = team({ 'corwin-daly': 'colony', 'greta-vos': 'colony', 'agnes-pell': 'colony', 'nia-calloway': 'school' });
  s = patch(s, (x) => { x.food = 5; x.morale = 8; x.crisis.contributions = []; });
  const fed = patch(s, (x) => { x.crisis = { id: 'whiteout', contributions: [] }; colonyPhase(x); });
  assert.equal(fed.reports.colony.fed, true);
  assert.equal(fed.food, 2);

  const hungry = patch(s, (x) => {
    x.food = 1; x.crisis = { id: 'empty-pantry', contributions: [] };
    for (const id of x.team.survivors) x.survivors[id].ap = 0;
    colonyPhase(x);
  });
  assert.equal(hungry.reports.colony.hungry.length, 2, '3 at home, 1 food');
  assert.ok(hungry.log.some((e) => e.k === 'morale' && e.reason === 'starvation' && e.delta === -1));
  const [a] = hungry.reports.colony.hungry;
  const fedOne = ['corwin-daly', 'greta-vos', 'agnes-pell'].find((id) => !hungry.reports.colony.hungry.includes(id));
  assert.equal(hungry.survivors[a].hp, 100 - 15 + 15, 'lost 15, then slept in a bed (+15)');
  assert.ok(hungry.survivors[a].ap < hungry.survivors[fedOne].ap, 'half AP after a hungry night');
}

);

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
  assert.equal(wrong.waste, undefined, 'no waste pile');
});

test('daily crisis: +1 item needed every 10 days; the score is visible while handing in', () => {
  let s = team({ 'corwin-daly': 'colony', 'greta-vos': 'colony' });
  s = patch(s, (x) => { x.crisis = { id: 'whiteout', contributions: [] }; });
  for (const [day, need] of [[1, 1], [10, 1], [11, 2], [21, 3], [31, 4]]) assert.equal(crisisRequirement(patch(s, (x) => { x.day = day; })), need, `day ${day}`);
  let fuel, food;
  [s, fuel] = giveCard(s, 'jerry-can');
  [s, food] = giveCard(s, 'canned-beans');
  s = reduce(s, a.contribute(fuel));
  assert.equal(crisisScore(s), 1);
  s = reduce(s, a.contribute(food));
  assert.equal(crisisScore(s), 0, 'a wrong item counts −1');
});

test('inspire adds morale when a crisis is averted', () => {
  let s = team({ 'kanya-srisuk': 'colony' });
  let fuel;
  [s, fuel] = giveCard(s, 'jerry-can');
  s = patch(s, (x) => { x.morale = 5; x.crisis = { id: 'whiteout', contributions: [fuel] }; resolveCrisis(x); });
  assert.equal(s.morale, 6);
});

test('spawning: ceil(n/2) outside, ceil(n/3) at colony; quiet guide reduces', () => {
  let s = team({ 'corwin-daly': 'school', 'agnes-pell': 'school', 'silas-thorn': 'library', 'greta-vos': 'library', 'nia-calloway': 'colony' });
  s = patch(s, (x) => { x.spawns = spawnZombies(x); });
  assert.deepEqual(s.spawns, { school: 1, colony: 1 });
});

test('overrun: a full entrance kills the lowest-influence survivor', () => {
  let s = team({ 'corwin-daly': 'school', 'dot-ferreira': 'school', 'greta-vos': 'colony' });
  s = patch(s, (x) => { x.locations.school.zombies = 3; x.morale = 8; addZombies(x, 'school', 1); });
  assert.equal(s.survivors['dot-ferreira'].alive, false);
  assert.equal(s.survivors['corwin-daly'].alive, true);

  s = patch(s, (x) => { x.locations.colony.zombies = 12; addZombies(x, 'colony', 1); });
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
  s = patch(s, (x) => { x.scenario.deposited = 8; x.food = 10; x.crisis = { id: 'whiteout', contributions: [] }; colonyPhase(x); });
  assert.equal(s.phase, 'gameOver');
  assert.equal(s.result.reason, 'objectiveComplete');

  let t = team({ 'corwin-daly': 'colony' });
  t = patch(t, (x) => { x.day = x.scenario.days; x.food = 10; x.crisis = { id: 'whiteout', contributions: [] }; colonyPhase(x); });
  assert.equal(t.result.reason, 'timeOut');
});

test('kills scenario goal', () => {
  let k = team({ 'corwin-daly': 'colony' }, { scenarioId: 'purge' });
  k = patch(k, (x) => { x.totalKills = 24; x.food = 10; x.crisis = { id: 'whiteout', contributions: [] }; colonyPhase(x); });
  assert.notEqual(k.result?.reason, 'objectiveComplete', 'needs 25');
  k = patch(k, (x) => { x.totalKills = 25; x.phase = 'turn'; x.crisis = { id: 'whiteout', contributions: [] }; colonyPhase(x); });
  assert.equal(k.result?.reason, 'objectiveComplete');
});

test('stockpile goal requires food AND a clear gate', () => {
  const base = (food, zombies) => {
    const f = team({ 'corwin-daly': 'school' }, { scenarioId: 'stores' });
    return patch(f, (x) => {
      const uid = Object.keys(x.cards)[0];
      x.cards[uid] = 'jerry-can';
      x.food = food; x.locations.colony.zombies = zombies;
      x.crisis = { id: 'whiteout', contributions: [uid] };
      colonyPhase(x);
    });
  };
  assert.equal(base(12, 0).result?.reason, 'objectiveComplete');
  assert.equal(base(12, 3).result?.reason, 'objectiveComplete', 'exactly 3 zombies is allowed');
  assert.notEqual(base(12, 4).result?.reason, 'objectiveComplete', 'too many zombies at the gate');
  assert.notEqual(base(11, 0).result?.reason, 'objectiveComplete');
});

test('morale hitting 0 mid-turn ends the game immediately', () => {
  let s = team({ 'corwin-daly': 'colony' });
  // A crossroads choice that costs the last point of morale ("Rations are rations.": morale −1).
  s = patch(s, (x) => { x.morale = 1; x.phase = 'crossroads'; x.pendingCrossroads = { cardId: 'xr-low-spirits', focusSurvivorId: 'corwin-daly' }; });
  const r = reduce(s, a.resolveCrossroads(1));
  assert.equal(r.phase, 'gameOver');
  assert.equal(r.result.reason, 'moraleCollapse');
  assert.throws(() => reduce(r, a.endTurn()), /gameOver/);
});
