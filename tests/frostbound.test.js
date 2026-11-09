// Energy, gear, abilities, threat forecast. No dice, no danger deck, no waste.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, startedGame, setSurvivors, patch } from './_helpers.js';
import { reduce, tryReduce } from '../src/core/reducer.js';
import * as act from '../src/core/actions.js';
import { ENERGY, FIGHT } from '../src/core/constants.js';
import { actionCost, spawnForecast, holderOf, apMax, sleepPlan, atkOf, fightPreview, killsPerAttack, gearOf } from '../src/core/selectors.js';
import { SURVIVORS } from '../src/content/survivors.js';
import { giveCard, setEnergy } from './_helpers.js';
import { spawnZombies } from '../src/core/rules/flow.js';
import { simulate } from '../src/ai/simulate.js';

const fb = (o = {}) => startedGame(o);
const me = (s) => s.team;
const ap = (s, id) => s.survivors[id].ap;
const setAp = (s, id, n) => { s.survivors[id].ap = n; };

test('the team starts full of energy; no danger deck, no waste, no dice', () => {
  const s = fb();
  assert.equal(s.danger, undefined);
  assert.equal(s.waste, undefined);
  assert.equal(s.team.survivors.length, 2, 'two survivors at the start');
  for (const id of s.team.survivors) assert.equal(ap(s, id), apMax(s, id));
  assert.equal(s.team.dice, undefined);
  assert.ok(!JSON.stringify(s).includes('"roll"'));
});

test('every survivor has a personal AP max (odd, 60..95); stronger abilities get less', () => {
  for (const sv of SURVIVORS) {
    assert.ok(sv.energy >= 60 && sv.energy <= 95 && sv.energy % 2 === 1, sv.id);
    assert.equal(sv.regen, undefined, sv.id);
  }
  const by = Object.fromEntries(SURVIVORS.map((x) => [x.id, x]));
  assert.ok(by['ambrose-lark'].energy > by['osei-vance'].energy, 'a plain tinkerer has more stamina than the surgeon');
});

test('gear: equip is free, swaps back to hand, changes personal stats, and is worn in plain sight', () => {
  let s = fb({ seed: 21 });
  s = setSurvivors(s, { 'corwin-daly': 'police' });
  s = patch(s, (x) => { x.locations.police.zombies = 3; });
  const bare = actionCost(s, 'corwin-daly', 'attack');
  let baton, shotgun, boots, guide;
  [s, baton] = giveCard(s, 'riot-baton');
  [s, shotgun] = giveCard(s, 'remington-870');
  [s, boots] = giveCard(s, 'winter-boots');
  [s, guide] = giveCard(s, 'survival-guide');
  const e0 = ap(s, 'corwin-daly');
  s = reduce(s, act.equip(baton));
  assert.equal(ap(s, 'corwin-daly'), e0, 'free');
  assert.equal(actionCost(s, 'corwin-daly', 'attack'), bare, 'melee always costs 15');
  assert.equal(atkOf(s, 'corwin-daly'), 16 + 8, 'the baton adds ATK');
  assert.equal(holderOf(s, baton), null, 'worn, not carried');
  s = reduce(s, act.equip(shotgun));
  assert.ok(holderOf(s, baton), 'the baton goes back where the shotgun was');
  assert.equal(killsPerAttack(s, 'corwin-daly'), 2);
  const r = reduce(s, act.attack('corwin-daly'));
  assert.equal(r.locations.police.zombies, 1 + r.log.findLast((e) => e.k === 'attack').drawn, 'kills 2 (the noise may draw one)');
  s = reduce(s, act.equip(boots));
  assert.equal(actionCost(s, 'corwin-daly', 'move', 'colony'), ENERGY.WALK[2] - 5);
  const wake = sleepPlan(s)['corwin-daly'].ap;
  s = reduce(s, act.equip(guide));
  assert.equal(sleepPlan(s)['corwin-daly'].ap, Math.min(apMax(s, 'corwin-daly'), wake + 10));
  const [s2, food] = giveCard(s, 'canned-beans');
  assert.equal(tryReduce(s2, act.equip(food)).error, 'notGear');
  assert.equal(gearOf(s).weapon.id, 'remington-870');
});

test('actions cost energy: odd numbers, modifiers, and not enough energy is illegal', () => {
  let s = fb({ seed: 5 });
  s = setSurvivors(s, { 'osei-vance': 'grocery', 'greta-vos': 'hospital' });
  s.day = 1;
  const search = () => ENERGY.SEARCH;
  const attack = () => FIGHT.MELEE_AP;
  assert.equal(actionCost(s, 'osei-vance', 'search'), search('osei-vance'));
  assert.equal(actionCost(s, 'greta-vos', 'search'), search('greta-vos'), 'search is 17 everywhere');
  s.locations.grocery.zombies = 2;
  assert.equal(actionCost(s, 'osei-vance', 'search'), search('osei-vance') + ENERGY.CROWDED);
  s.day = 3; // storm day: outside costs more
  assert.equal(actionCost(s, 'osei-vance', 'attack'), attack('osei-vance') + ENERGY.STORM);
  s.day = 1;
  setAp(s, 'greta-vos', 100);
  const after = reduce(s, act.search('greta-vos'));
  assert.equal(ap(after, 'greta-vos'), 100 - search('greta-vos'));
  const broke = structuredClone(s); setAp(broke, 'greta-vos', 5);
  assert.equal(tryReduce(broke, act.search('greta-vos')).error, 'notEnoughEnergy');
});

test('moving: costs energy, repeatable, and walking in among zombies is safe for now', () => {
  let s = fb({ seed: 6 });
  s = setSurvivors(s, { 'osei-vance': 'colony', 'greta-vos': 'colony' });
  setAp(s, 'osei-vance', 80);
  s = reduce(s, act.move('osei-vance', 'grocery'));
  assert.equal(ap(s, 'osei-vance'), 80 - ENERGY.COST.move - (s.day % 3 === 0 ? ENERGY.STORM : 0));
  s = reduce(s, act.move('osei-vance', 'school')); // a second move is fine
  s.locations.police.zombies = 2;
  s = reduce(s, act.move('greta-vos', 'police'));
  assert.equal(s.survivors['greta-vos'].wounds, 0);
  assert.ok(!s.log.some((e) => e.k === 'exposure'));
});

test('new abilities: cheaper moves, attacks and barricades, cold-proof nights, double junk', () => {
  let s = fb({ seed: 7 });
  s = setSurvivors(s, { 'maren-holt': 'colony', 'ilse-brandt': 'police', 'wren-okafor': 'school', 'bo-lindqvist': 'gas', 'corwin-daly': 'school' });
  assert.equal(actionCost(s, 'maren-holt', 'move', 'school'), ENERGY.WALK[0] - ENERGY.SKILLED);
  assert.equal(actionCost(s, 'ilse-brandt', 'attack'), FIGHT.MELEE_AP - ENERGY.SKILLED);
  assert.equal(actionCost(s, 'wren-okafor', 'barricade'), actionCost(s, 'corwin-daly', 'barricade') - ENERGY.SKILLED);
  s.day = 3; // storm
  assert.equal(actionCost(s, 'bo-lindqvist', 'barricade'), ENERGY.COST.barricade, 'no storm cost for Bo');
  assert.equal(actionCost(s, 'corwin-daly', 'barricade'), ENERGY.COST.barricade + ENERGY.STORM);
  s.day = 1;
  let junk; [s, junk] = giveCard(setSurvivors(s, { 'ezra-kade': 'colony' }), 'bedpan');
  s = setEnergy(s, 10);
  assert.equal(ap(reduce(s, act.playCard(junk)), 'ezra-kade'), 10 + 2 * ENERGY.JUNK);
});

test('sleep: bed 100% +15 HP, floor 70% +5, outside 40%; carry-over, cap, lower cap when badly hurt', () => {
  let s = fb({ seed: 12 });
  s = setSurvivors(s, { 'osei-vance': 'colony', 'greta-vos': 'colony', 'agnes-pell': 'colony', 'corwin-daly': 'school' });
  for (const id of s.team.survivors) { setAp(s, id, 0); s.survivors[id].hp = 50; }
  setAp(s, 'agnes-pell', 30); // the least tired at home sleeps on the floor (2 beds)
  const plan = sleepPlan(s);
  assert.equal(plan['osei-vance'].kind, 'bed');
  assert.equal(plan['osei-vance'].ap, apMax(s, 'osei-vance'));
  assert.equal(plan['agnes-pell'].kind, 'floor');
  assert.equal(plan['agnes-pell'].ap, Math.min(apMax(s, 'agnes-pell'), 30 + Math.round(apMax(s, 'agnes-pell') * 0.7)));
  assert.equal(plan['corwin-daly'].kind, 'outside');
  assert.equal(plan['corwin-daly'].ap, Math.round(apMax(s, 'corwin-daly') * 0.4));
  s.food = 20;
  const next = reduce(s, act.endTurn());
  if (next.phase !== 'gameOver') {
    assert.equal(next.survivors['osei-vance'].hp, 65);
    assert.equal(next.survivors['agnes-pell'].hp, 55);
    assert.equal(next.survivors['corwin-daly'].hp, 50 - FIGHT.NIGHT_BITE * next.locations.school.zombies, 'zombies bite outside sleepers');
  }
  const hurt = structuredClone(s); hurt.survivors['osei-vance'].wounds = 2;
  assert.equal(apMax(hurt, 'osei-vance'), SURVIVORS.find((x) => x.id === 'osei-vance').energy - ENERGY.HURT);
});

test('nap: +25 AP +5 HP at the colony, only before acting, then no more actions that day', () => {
  let s = fb({ seed: 12 });
  s = setSurvivors(s, { 'osei-vance': 'colony', 'greta-vos': 'school' });
  s.survivors['osei-vance'].hp = 80;
  assert.equal(tryReduce(s, act.nap('greta-vos')).error, 'mustBeInColony');
  const moved = reduce(s, act.move('osei-vance', 'school'));
  assert.equal(tryReduce(reduce(moved, act.move('osei-vance', 'colony')), act.nap('osei-vance')).error, 'alreadyActed');
  setAp(s, 'osei-vance', 30);
  const napped = reduce(s, act.nap('osei-vance'));
  assert.equal(ap(napped, 'osei-vance'), 55);
  assert.equal(napped.survivors['osei-vance'].hp, 85);
  assert.equal(tryReduce(napped, act.move('osei-vance', 'school')).error, 'napping');
});

test('guard duty: at the colony only, stops one colony zombie tonight, wakes at 50%', () => {
  let s = fb({ seed: 12 });
  s = setSurvivors(s, { 'osei-vance': 'colony', 'greta-vos': 'school' });
  assert.equal(tryReduce(s, act.setRest('greta-vos', 'guard')).error, 'mustBeInColony');
  assert.equal(spawnForecast(s).colony, 1);
  setAp(s, 'osei-vance', 0);
  s = reduce(s, act.setRest('osei-vance', 'guard'));
  assert.equal(spawnForecast(s).colony, undefined);
  assert.equal(sleepPlan(s)['osei-vance'].kind, 'guard');
  assert.equal(sleepPlan(s)['osei-vance'].ap, Math.round(apMax(s, 'osei-vance') * 0.5));
});

test('threat forecast equals what the colony phase spawns', () => {
  let s = fb({ seed: 13 });
  s = setSurvivors(s, { 'osei-vance': 'grocery', 'greta-vos': 'grocery' });
  const forecast = spawnForecast(s);
  assert.equal(forecast.grocery, 1);
  const c = structuredClone(s);
  assert.deepEqual(spawnZombies(c), forecast);
});

test('bots play whole frostbound games without illegal moves', () => {
  for (let seed = 1; seed <= 15; seed++) {
    const { state, errors } = simulate({ seed, scenarioId: ['beacon', 'stores', 'purge'][seed % 3] });
    assert.equal(errors.length, 0, JSON.stringify(errors[0]));
    assert.equal(state.phase, 'gameOver');
  }
  const { errors } = simulate({ seed: 2, chaos: 0.3 });
  assert.ok(errors.every((e) => e.error !== undefined), 'chaos bots only make rule errors');
});

test('melee: one zombie dies for sure; HP lost = ceil((ferocity − (AP left + ATK)) / 3) − armor', () => {
  let s = fb({ seed: 3 });
  s = setSurvivors(s, { 'corwin-daly': 'police', 'osei-vance': 'colony' });
  s.locations.police.zombies = 2;
  setAp(s, 'corwin-daly', 75);
  // AP left 60, ATK (7−3)×4 = 16 → 110 − 76 = 34 → 12 HP.
  assert.equal(fightPreview(s, 'corwin-daly').hp, 12);
  let r = reduce(s, act.attack('corwin-daly'));
  assert.equal(r.locations.police.zombies, 1);
  assert.equal(r.survivors['corwin-daly'].hp, 88);
  assert.equal(ap(r, 'corwin-daly'), 60);
  let vest; [s, vest] = giveCard(s, 'riot-vest');
  s = reduce(s, act.equip(vest, 'corwin-daly'));
  assert.equal(fightPreview(s, 'corwin-daly').hp, 9, 'armor saves 3');
  s.day = 22; // not a storm day
  assert.equal(fightPreview(s, 'corwin-daly').hp, Math.ceil((150 - 76) / 3) - 3, 'brutes from day 21');
  // Walking away from 2 zombies: 10 HP.
  r = reduce(s, act.move('corwin-daly', 'colony'));
  assert.equal(r.survivors['corwin-daly'].hp, 90);
  // HP 0 = dead.
  const weak = structuredClone(s); weak.survivors['corwin-daly'].hp = 5; weak.day = 1;
  assert.equal(reduce(weak, act.attack('corwin-daly')).survivors['corwin-daly'].alive, false);
});

test('guns: no HP lost, 10 AP and 1 ammo; noise may draw a zombie', () => {
  let s = fb({ seed: 3 });
  s = setSurvivors(s, { 'corwin-daly': 'police', 'osei-vance': 'colony' });
  s.locations.police.zombies = 3;
  let glock; [s, glock] = giveCard(s, 'glock-19');
  s = reduce(s, act.equip(glock, 'corwin-daly'));
  assert.equal(s.survivors['corwin-daly'].ammo, 6);
  const f = fightPreview(s, 'corwin-daly');
  assert.deepEqual([f.cost, f.hp, f.spawn], [10, 0, 0.4]);
  let drew = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const t = structuredClone(s); t.rng = seed;
    const r = reduce(t, act.attack('corwin-daly'));
    assert.equal(r.survivors['corwin-daly'].hp, 100);
    assert.equal(r.survivors['corwin-daly'].ammo, 5);
    if (r.locations.police.zombies === 3) drew++;
  }
  assert.ok(drew > 3 && drew < 25, `noise drew ${drew}/30`);
  s.survivors['corwin-daly'].ammo = 0;
  assert.equal(tryReduce(s, act.attack('corwin-daly')).error, 'noAmmo');
});
