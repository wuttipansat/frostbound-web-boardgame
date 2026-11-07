import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce } from '../src/core/reducer.js';
import * as a from '../src/core/actions.js';
import { colonyPhase, resolveCrisis, spawnZombies, endGame } from '../src/core/rules/flow.js';
import { addZombies } from '../src/core/rules/helpers.js';
import { foodNeeded, crisisRequirement } from '../src/core/selectors.js';
import { startedGame, setSurvivors, giveCard, patch } from './_helpers.js';

function twoPlayer(placements0, placements1, opts = {}) {
  let s = startedGame({ players: 2, ...opts });
  s = setSurvivors(s, 'p0', placements0);
  s = setSurvivors(s, 'p1', placements1);
  return s;
}

test('food need: 1 per 2 colony residents incl. helpless; the cook saves 1', () => {
  let s = twoPlayer({ 'corwin-daly': 'colony', 'agnes-pell': 'colony' }, { 'greta-vos': 'colony', 'bo-lindqvist': 'school' });
  s = patch(s, (x) => { x.helpless = 2; });
  assert.equal(foodNeeded(s), 3); // 3 residents + 2 helpless = 5 -> 3
  s = setSurvivors(s, 'p1', { 'pim-arunrat': 'colony', 'bo-lindqvist': 'school' });
  assert.equal(foodNeeded(s), 2);
});

test('colony phase pays food or adds escalating starvation', () => {
  let s = twoPlayer({ 'corwin-daly': 'colony' }, { 'greta-vos': 'colony' });
  s = patch(s, (x) => { x.helpless = 2; x.food = 5; x.morale = 8; x.crisis.contributions = []; });
  const fed = patch(s, (x) => { x.crisis = { id: 'whiteout', contributions: [] }; colonyPhase(x); });
  assert.equal(fed.reports.colony.fed, true);
  assert.equal(fed.food, 3);

  const starving = patch(s, (x) => { x.food = 0; x.starvation = 1; x.crisis = { id: 'empty-pantry', contributions: [] }; colonyPhase(x); });
  assert.equal(starving.starvation, 2);
  assert.ok(starving.log.some((e) => e.k === 'morale' && e.reason === 'starvation' && e.delta === -2));
});

test('every 10 waste costs 1 morale in the colony phase', () => {
  let s = twoPlayer({ 'corwin-daly': 'police' }, { 'greta-vos': 'police' });
  s = patch(s, (x) => { x.helpless = 0; x.waste = 23; x.morale = 8; colonyPhase(x); });
  assert.equal(s.reports.colony.wasteLoss, 2);
  assert.ok(s.log.some((e) => e.k === 'morale' && e.reason === 'waste' && e.delta === -2));
});

test('crisis: matching +1, others -1 (sabotage); tinkerer junk counts; failure applies effects', () => {
  let s = twoPlayer({ 'ambrose-lark': 'colony' }, { 'greta-vos': 'colony' });
  s = patch(s, (x) => { x.crisis = { id: 'whiteout', contributions: [] }; x.morale = 8; });
  assert.equal(crisisRequirement(s), 1);
  let fuel, junk, food;
  [s, fuel] = giveCard(s, 'p1', 'jerry-can');
  [s, junk] = giveCard(s, 'p0', 'bedpan');
  [s, food] = giveCard(s, 'p1', 'canned-beans');
  const contrib = (list) => patch(s, (x) => { x.crisis.contributions = list; });

  const ok = patch(contrib([{ uid: fuel, playerId: 'p1' }, { uid: junk, playerId: 'p0' }]), (x) => { x.result = resolveCrisis(x); });
  assert.equal(ok.result.score, 2);
  assert.equal(ok.result.success, true);
  assert.equal(ok.morale, 8, 'beat by 1: no bonus');
  let fuel2;
  [s, fuel2] = giveCard(s, 'p0', 'lamp-oil');
  const great = patch(s, (x) => {
    x.crisis.contributions = [{ uid: fuel, playerId: 'p1' }, { uid: junk, playerId: 'p0' }, { uid: fuel2, playerId: 'p0' }];
    resolveCrisis(x);
  });
  assert.equal(great.morale, 9, 'beat by 2+ gives a morale bonus');

  const sabotaged = patch(contrib([{ uid: fuel, playerId: 'p1' }, { uid: food, playerId: 'p1' }]), (x) => { x.result = resolveCrisis(x); });
  assert.equal(sabotaged.result.score, 0);
  assert.equal(sabotaged.result.success, false);
  assert.equal(sabotaged.morale, 7, 'whiteout: -1 morale');
  assert.equal(sabotaged.locations.colony.zombies, 2, 'whiteout: 2 zombies at the colony');
  assert.equal(sabotaged.waste, s.waste + 2, 'contributed cards go to waste');
});

test('inspire adds morale when a crisis is averted', () => {
  let s = twoPlayer({ 'kanya-srisuk': 'colony' }, { 'greta-vos': 'colony' });
  let fuel;
  [s, fuel] = giveCard(s, 'p0', 'jerry-can');
  s = patch(s, (x) => { x.morale = 5; x.crisis = { id: 'whiteout', contributions: [{ uid: fuel, playerId: 'p0' }] }; resolveCrisis(x); });
  assert.equal(s.morale, 6);
});

test('spawning: ceil(n/2) outside, ceil(n/3) at colony; quiet guide reduces', () => {
  let s = twoPlayer({ 'corwin-daly': 'school', 'agnes-pell': 'school' }, { 'silas-thorn': 'library', 'greta-vos': 'library' });
  s = patch(s, (x) => { x.helpless = 2; x.spawns = spawnZombies(x); });
  assert.deepEqual(s.spawns, { school: 1, colony: 1 });
});

test('overrun: a full entrance kills the lowest-influence survivor; colony loses helpless first', () => {
  let s = twoPlayer({ 'corwin-daly': 'school', 'dot-ferreira': 'school' }, { 'greta-vos': 'colony' });
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

test('objective completion: loyal players with met secret objectives win; betrayer loses', () => {
  let s = twoPlayer({ 'corwin-daly': 'colony' }, { 'greta-vos': 'colony' });
  s = patch(s, (x) => { x.players[0].objectiveId = 'pack-rat'; x.players[1].objectiveId = 'hollow-crown'; });
  [s] = giveCard(s, 'p0', 'bedpan'); [s] = giveCard(s, 'p0', 'bedpan');
  [s] = giveCard(s, 'p0', 'bedpan'); [s] = giveCard(s, 'p0', 'bedpan');
  const won = patch(s, (x) => endGame(x, 'objectiveComplete'));
  assert.deepEqual(won.result.winners, ['p0']);
  const fell = patch(s, (x) => { x.players[1].survivors.push('fake'); x.survivors.fake = { ...x.survivors['greta-vos'], id: 'fake' }; endGame(x, 'timeOut'); });
  assert.deepEqual(fell.result.winners, ['p1'], 'betrayer wins when the colony falls with 2 survivors');
});

test('scenario goal is checked in the colony phase; time running out ends the game', () => {
  let s = twoPlayer({ 'corwin-daly': 'colony' }, { 'greta-vos': 'colony' });
  s = patch(s, (x) => { x.scenario.deposited = 5; x.food = 10; x.crisis = { id: 'whiteout', contributions: [] }; colonyPhase(x); });
  assert.equal(s.phase, 'gameOver');
  assert.equal(s.result.reason, 'objectiveComplete');

  let t = twoPlayer({ 'corwin-daly': 'colony' }, { 'greta-vos': 'colony' });
  t = patch(t, (x) => { x.round = x.scenario.rounds; x.food = 10; x.crisis = { id: 'whiteout', contributions: [] }; colonyPhase(x); });
  assert.equal(t.result.reason, 'timeOut');
});

test('kills scenario goal', () => {
  let k = twoPlayer({ 'corwin-daly': 'colony' }, { 'greta-vos': 'colony' }, { scenarioId: 'purge' });
  k = patch(k, (x) => { x.totalKills = 11; x.food = 10; x.crisis = { id: 'whiteout', contributions: [] }; colonyPhase(x); });
  assert.notEqual(k.result?.reason, 'objectiveComplete', 'needs 6 + 3*2 = 12');
  k = patch(k, (x) => { x.totalKills = 12; x.phase = 'turn'; x.crisis = { id: 'whiteout', contributions: [] }; colonyPhase(x); });
  assert.equal(k.result?.reason, 'objectiveComplete');
});

test('stockpile goal requires food AND a clear gate', () => {
  const base = (food, zombies) => {
    let f = twoPlayer({ 'corwin-daly': 'school' }, { 'greta-vos': 'school' }, { scenarioId: 'stores' });
    return patch(f, (x) => { x.helpless = 0; x.food = food; x.locations.colony.zombies = zombies; x.crisis = { id: 'whiteout', contributions: [{ uid: Object.keys(x.cards)[0], playerId: 'p0' }] }; x.cards[Object.keys(x.cards)[0]] = 'jerry-can'; colonyPhase(x); });
  };
  assert.equal(base(8, 0).result?.reason, 'objectiveComplete');
  assert.equal(base(8, 3).result?.reason, 'objectiveComplete', 'exactly 3 zombies is allowed');
  assert.notEqual(base(8, 4).result?.reason, 'objectiveComplete', 'too many zombies at the gate');
  assert.notEqual(base(7, 0).result?.reason, 'objectiveComplete');
});

test('morale hitting 0 mid-turn ends the game immediately', () => {
  let s = startedGame();
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, { 'corwin-daly': 'colony' });
  s = patch(s, (x) => { x.morale = 1; x.survivors['corwin-daly'].wounds = 2; x.players.find((p) => p.id === pid).dice = [{ v: 6, used: false }]; x.locations.colony.zombies = 1; });
  for (let seed = 1; seed < 500; seed++) {
    const r = reduce(patch(s, (x) => { x.rng = seed; }), a.attack(pid, 'corwin-daly', 0));
    if (!r.survivors['corwin-daly'].alive) {
      assert.equal(r.phase, 'gameOver');
      assert.equal(r.result.reason, 'moraleCollapse');
      assert.throws(() => reduce(r, a.endTurn(pid)), /gameOver/);
      return;
    }
  }
  assert.fail('never died');
});

