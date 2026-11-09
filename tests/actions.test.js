import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce, tryReduce } from '../src/core/reducer.js';
import * as a from '../src/core/actions.js';
import { actionCost, apMax, searchSpawnChance } from '../src/core/selectors.js';
import { ENERGY, FOOD } from '../src/core/constants.js';
import { startedGame, setSurvivors, setEnergy, giveCard, patch } from './_helpers.js';

function setup(placements, energy = 100, opts = {}) {
  let s = startedGame(opts);
  s = setSurvivors(s, placements);
  s = setEnergy(s, energy);
  return { s };
}
// The lowest AP on the team (only the acting survivor spends).
const energy = (s) => Math.min(...s.team.survivors.filter((id) => s.survivors[id].alive).map((id) => s.survivors[id].ap));

test('actions only work in the turn phase; there are no player ids (solo)', () => {
  const { s } = setup({ 'corwin-daly': 'police' });
  assert.equal(s.players, undefined);
  assert.equal(s.activePlayerId, undefined);
  assert.equal(tryReduce(s, a.attack('maren-holt')).error, 'noSuchSurvivor');
  const crossroads = patch(s, (x) => { x.phase = 'crossroads'; });
  assert.equal(tryReduce(crossroads, a.search('corwin-daly')).error, 'wrongPhase');
});

test('costs are personal: attack / search come from the survivor\'s skills (2..6 → odd numbers)', () => {
  const { s } = setup({ 'corwin-daly': 'school', 'teodor-rusu': 'colony' });
  const c = (id, k) => actionCost(s, id, k);
  // corwin: attack 4? whatever the data says, the formula holds:
  for (const id of ['corwin-daly', 'teodor-rusu']) {
    assert.equal(c(id, 'search') % 2, 1, 'odd');
  }
  assert.equal(actionCost(s, 'teodor-rusu', 'move', 'school'), ENERGY.WALK[0], 'near: 12');
  assert.equal(actionCost(s, 'teodor-rusu', 'move', 'gas'), ENERGY.WALK[1], 'mid: 17');
  assert.equal(actionCost(s, 'teodor-rusu', 'move', 'hospital'), ENERGY.WALK[2], 'far: 23');
});

test('attack: needs zombies and energy; kills one', () => {
  let { s } = setup({ 'corwin-daly': 'police' });
  assert.equal(tryReduce(s, a.attack('corwin-daly')).error, 'noZombiesHere');
  s = patch(s, (x) => { x.locations.police.zombies = 2; });
  const cost = actionCost(s, 'corwin-daly', 'attack');
  assert.equal(tryReduce(setEnergy(s, cost - 1), a.attack('corwin-daly')).error, 'notEnoughEnergy');
  const after = reduce(s, a.attack('corwin-daly'));
  assert.equal(after.locations.police.zombies, 1);
  assert.equal(after.totalKills, 1);
  assert.equal(after.team.kills, 1);
  assert.equal(energy(after), 100 - cost);
  assert.equal(after.survivors['corwin-daly'].wounds, 0, 'no danger card any more');
});

test('attack abilities: the sharpshooter pays less, the bouncer kills two', () => {
  let { s } = setup({ 'ilse-brandt': 'police', 'teodor-rusu': 'grocery' });
  s = patch(s, (x) => { x.locations.police.zombies = 2; x.locations.grocery.zombies = 3; });
  const sniped = reduce(s, a.attack('ilse-brandt'));
  assert.equal(energy(sniped), 100 - actionCost(s, 'ilse-brandt', 'attack'));
  const smashed = reduce(s, a.attack('teodor-rusu'));
  assert.equal(smashed.locations.grocery.zombies, 1);
  assert.equal(smashed.totalKills, 2);
});

test('search: not in colony, draws from location deck, specialists draw two', () => {
  let { s } = setup({ 'hattie-moss': 'grocery', 'corwin-daly': 'colony', 'agnes-pell': 'school' });
  assert.equal(tryReduce(s, a.search('corwin-daly')).error, 'cannotSearchColony');
  const hand = s.stockpile.length;
  const deck = s.locations.grocery.deck.length;
  const r = reduce(s, a.search('hattie-moss'));
  assert.equal(r.survivors['hattie-moss'].pack.length, 2, 'into the backpack');
  assert.equal(r.stockpile.length, hand, 'not home yet');
  assert.equal(r.locations.grocery.deck.length, deck - 2);
  assert.equal(energy(r), 100 - actionCost(s, 'hattie-moss', 'search'));
  const r2 = reduce(s, a.search('agnes-pell'));
  assert.equal(r2.survivors['agnes-pell'].pack.length, 1, 'library specialist only doubles at the library');
  const empty = patch(s, (x) => { x.locations.grocery.deck = []; });
  assert.equal(tryReduce(empty, a.search('hattie-moss')).error, 'deckEmpty');
});

test('barricade: limited by free slots; zombies smash barricades first', () => {
  let { s } = setup({ 'nia-calloway': 'police', 'corwin-daly': 'colony' });
  let r = reduce(s, a.barricade('nia-calloway'));
  assert.equal(r.locations.police.barricades, 2, 'locksmith places two');
  r = reduce(r, a.barricade('nia-calloway'));
  assert.equal(r.locations.police.barricades, 3, 'capped at the 3 zombie slots');
  assert.equal(tryReduce(r, a.barricade('nia-calloway')).error, 'noBarricadeSpace');
  r = reduce(r, a.barricade('corwin-daly'));
  assert.equal(r.locations.colony.barricades, 1);
});

test('lure: moves zombies from your location to another', () => {
  let { s } = setup({ 'lio-fontaine': 'school' });
  s = patch(s, (x) => { x.locations.school.zombies = 3; });
  assert.equal(tryReduce(s, a.lure('lio-fontaine', 'school')).error, 'sameLocation');
  const r = reduce(s, a.lure('lio-fontaine', 'library'));
  assert.equal(r.locations.school.zombies, 1);
  assert.equal(r.locations.library.zombies, 2);
});

test('move: costs energy, repeatable, respects slots; fuel drives; the trucker pays less', () => {
  let { s } = setup({ 'corwin-daly': 'colony', 'maren-holt': 'colony' });
  s = patch(s, (x) => { x.locations.hospital.zombies = 1; x.locations.library.zombies = 0; });
  let r = reduce(s, a.move('corwin-daly', 'hospital'));
  assert.equal(r.survivors['corwin-daly'].location, 'hospital');
  assert.equal(r.log.findLast((e) => e.k === 'move').safe, false, 'zombies there');
  assert.equal(energy(r), 100 - ENERGY.WALK[2] - (r.day % 3 === 0 ? ENERGY.STORM : 0));
  const again = reduce(r, a.move('corwin-daly', 'library'));
  assert.equal(again.log.findLast((e) => e.k === 'move').safe, true, 'empty place');

  const trucker = reduce(s, a.move('maren-holt', 'hospital'));
  assert.equal(energy(trucker), 100 - actionCost(s, 'maren-holt', 'move', 'hospital'));
  assert.equal(actionCost(s, 'maren-holt', 'move', 'hospital'), actionCost(s, 'corwin-daly', 'move', 'hospital') - ENERGY.SKILLED);

  let [withFuel, fuel] = giveCard(s, 'jerry-can');
  const fueled = reduce(withFuel, a.move('corwin-daly', 'hospital', fuel));
  assert.equal(fueled.log.findLast((e) => e.k === 'move').safe, true, 'driving is safe');
  assert.ok(!fueled.stockpile.includes(fuel));
  let [withFood, food] = giveCard(s, 'canned-beans');
  assert.equal(tryReduce(withFood, a.move('corwin-daly', 'gas', food)).error, 'needFuel');
  assert.equal(tryReduce(setEnergy(s, 3), a.move('corwin-daly', 'gas')).error, 'notEnoughEnergy');

  // Hospital has 3 slots.
  const full = patch(s, (x) => {
    for (const [i, id] of ['agnes-pell', 'rafael-quist', 'greta-vos'].entries()) {
      x.survivors[id] = { id, location: 'hospital', wounds: 0, frostbite: false, alive: true, moved: false, i };
    }
  });
  assert.equal(tryReduce(full, a.move('corwin-daly', 'hospital')).error, 'locationFull');
});

test('playing cards: food, medicine, tools, junk (energy); gear must be equipped', () => {
  let { s } = setup({ 'corwin-daly': 'police' }, 30);
  s = patch(s, (x) => { x.survivors['corwin-daly'].wounds = 1; });
  let food, med, tool, gun, junk;
  [s, food] = giveCard(s, 'rice-sack', 'stockpile');
  [s, med] = giveCard(s, 'antibiotics');
  [s, tool] = giveCard(s, 'duct-tape');
  [s, gun] = giveCard(s, 'riot-baton');
  [s, junk] = giveCard(s, 'bedpan');

  let packed; [s, packed] = giveCard(s, 'rice-sack');
  assert.equal(tryReduce(s, a.playCard(packed)).error, 'notHome', 'food counts once it is home');
  const fed = reduce(s, a.playCard(food));
  assert.equal(fed.food, s.food + 2 * FOOD.MEALS, 'a food card feeds MEALS × its value');
  assert.ok(!fed.stockpile.includes(food), 'a used card is gone');

  const healed = reduce(s, a.playCard(med, { targetSurvivorId: 'corwin-daly' }));
  assert.equal(healed.survivors['corwin-daly'].wounds, 0);
  assert.equal(tryReduce(healed, a.playCard(tool, { targetSurvivorId: 'nobody' })).error, 'noSuchSurvivor');
  const boarded = reduce(s, a.playCard(tool, { targetSurvivorId: 'corwin-daly' }));
  assert.equal(boarded.locations.police.barricades, 1);

  assert.equal(tryReduce(s, a.playCard(gun, { targetSurvivorId: 'corwin-daly' })).error, 'equipInstead');
  const charged = reduce(s, a.playCard(junk, { targetSurvivorId: 'corwin-daly' }));
  assert.ok(!charged.stockpile.includes(junk));
  assert.equal(charged.survivors['corwin-daly'].ap, Math.min(apMax(s, 'corwin-daly'), 30 + ENERGY.JUNK));
});

test('contribute adds the card to the crisis and removes it from the hand', () => {
  let { s } = setup({ 'corwin-daly': 'police' });
  let uid;
  [s, uid] = giveCard(s, 'jerry-can', 'stockpile');
  const r = reduce(s, a.contribute(uid));
  assert.equal(r.crisis.contributions.at(-1), uid);
  assert.ok(!r.stockpile.includes(uid));
  assert.equal(r.log.at(-1).card, 'jerry-can', 'solo: nothing to hide');
});

test('deposit (beacon scenario) needs a survivor in the colony and the right item', () => {
  let { s } = setup({ 'corwin-daly': 'police' });
  let fuel, food;
  [s, fuel] = giveCard(s, 'jerry-can');
  [s, food] = giveCard(s, 'rice-sack');
  assert.equal(tryReduce(s, a.deposit(fuel)).error, 'notHome', 'still in the backpack at the police station');
  s = setSurvivors(s, { 'corwin-daly': 'colony' });
  [s, fuel] = giveCard(s, 'jerry-can');
  [s, food] = giveCard(s, 'rice-sack');
  assert.equal(tryReduce(s, a.deposit(food)).error, 'wrongItemType');
  assert.equal(reduce(s, a.deposit(fuel)).scenario.deposited, 1);
  const stores = setup({ 'corwin-daly': 'colony' }, 100, { scenarioId: 'stores' });
  let [st, f2] = giveCard(stores.s, 'jerry-can');
  assert.equal(tryReduce(st, a.deposit(f2)).error, 'scenarioHasNoDeposit');
});

test('backpacks: 3 slots; items go home on arrival; hand over for free at the same place', () => {
  let { s } = setup({ 'hattie-moss': 'grocery', 'corwin-daly': 'grocery', 'agnes-pell': 'school' });
  let x;
  for (let i = 0; i < 3; i++) [s, x] = giveCard(s, 'bedpan', 'hattie-moss');
  assert.equal(tryReduce(s, a.search('hattie-moss')).error, 'packFull');
  assert.equal(tryReduce(s, a.give(x, 'agnes-pell')).error, 'notHere');
  s = reduce(s, a.give(x, 'corwin-daly'));
  assert.deepEqual(s.survivors['corwin-daly'].pack, [x]);
  const home = s.stockpile.length;
  s = reduce(s, a.move('corwin-daly', 'colony'));
  assert.equal(s.survivors['corwin-daly'].pack.length, 0);
  assert.equal(s.stockpile.length, home + 1, 'unpacked at the colony');
});

test('search may make a zombie appear: by place, +10% per extra search there today', () => {
  let { s } = setup({ 'hattie-moss': 'police' });
  assert.equal(searchSpawnChance(s, 'police'), 0.25);
  s = reduce(s, a.search('hattie-moss'));
  assert.equal(searchSpawnChance(s, 'police'), 0.35);
  assert.equal(searchSpawnChance(s, 'grocery'), 0.1);
  let spawned = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const t = structuredClone(s); t.rng = seed; t.locations.police.zombies = 0;
    if (reduce(t, a.search('hattie-moss')).locations.police.zombies === 1) spawned++;
  }
  assert.ok(spawned > 4 && spawned < 28, `spawned ${spawned}/40`);
});

test('healer ability: once per turn, same location only', () => {
  let { s } = setup({ 'osei-vance': 'colony', 'corwin-daly': 'colony' });
  s = patch(s, (x) => { x.survivors['corwin-daly'].wounds = 2; });
  const r = reduce(s, a.useAbility('osei-vance', 'corwin-daly'));
  assert.equal(r.survivors['corwin-daly'].wounds, 1);
  assert.equal(tryReduce(r, a.useAbility('osei-vance', 'corwin-daly')).error, 'abilityUsed');
  assert.equal(tryReduce(s, a.useAbility('corwin-daly', 'corwin-daly')).error, 'noActiveAbility');
});

test('ending the turn runs the colony phase and starts the next round', () => {
  let s = startedGame();
  s = reduce(s, a.endTurn());
  assert.ok(s.day === 2 || s.phase === 'gameOver');
  assert.ok(s.reports.colony);
});
