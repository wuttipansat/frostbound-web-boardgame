import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce, tryReduce } from '../src/core/reducer.js';
import * as a from '../src/core/actions.js';
import { actionCost, energyMax } from '../src/core/selectors.js';
import { ENERGY } from '../src/core/constants.js';
import { startedGame, setSurvivors, setEnergy, giveCard, patch, topDanger } from './_helpers.js';

function setup(placements, energy = 100, opts = {}) {
  let s = startedGame(opts);
  s = setSurvivors(s, placements);
  s = setEnergy(s, energy);
  return { s };
}
const energy = (s) => s.team.energy;

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
  assert.equal(actionCost(s, 'corwin-daly', 'move', 'school'), ENERGY.COST.move);
});

test('attack: needs zombies and energy; kills one and draws a danger card bare-handed', () => {
  let { s } = setup({ 'corwin-daly': 'police' });
  assert.equal(tryReduce(s, a.attack('corwin-daly')).error, 'noZombiesHere');
  s = patch(s, (x) => { x.locations.police.zombies = 2; });
  const cost = actionCost(s, 'corwin-daly', 'attack');
  assert.equal(tryReduce(setEnergy(s, cost - 1), a.attack('corwin-daly')).error, 'notEnoughEnergy');
  const after = reduce(topDanger(s, 'safe'), a.attack('corwin-daly'));
  assert.equal(after.locations.police.zombies, 1);
  assert.equal(after.totalKills, 1);
  assert.equal(after.team.kills, 1);
  assert.equal(energy(after), 100 - cost);
  assert.equal(after.lastExposure.survivorId, 'corwin-daly');
  assert.equal(after.lastExposure.cause, 'attack');
});

test('attack abilities: sniper never draws, bouncer kills two', () => {
  let { s } = setup({ 'ilse-brandt': 'police', 'teodor-rusu': 'grocery' });
  s = patch(s, (x) => { x.locations.police.zombies = 2; x.locations.grocery.zombies = 3; });
  const sniped = reduce(s, a.attack('ilse-brandt'));
  assert.equal(sniped.lastExposure, s.lastExposure, 'no danger card');
  const smashed = reduce(topDanger(s, 'safe'), a.attack('teodor-rusu'));
  assert.equal(smashed.locations.grocery.zombies, 1);
  assert.equal(smashed.totalKills, 2);
});

test('search: not in colony, draws from location deck, specialists draw two', () => {
  let { s } = setup({ 'hattie-moss': 'grocery', 'corwin-daly': 'colony', 'agnes-pell': 'school' });
  assert.equal(tryReduce(s, a.search('corwin-daly')).error, 'cannotSearchColony');
  const hand = s.team.hand.length;
  const deck = s.locations.grocery.deck.length;
  const r = reduce(s, a.search('hattie-moss'));
  assert.equal(r.team.hand.length, hand + 2);
  assert.equal(r.locations.grocery.deck.length, deck - 2);
  assert.equal(energy(r), 100 - actionCost(s, 'hattie-moss', 'search'));
  const r2 = reduce(s, a.search('agnes-pell'));
  assert.equal(r2.team.hand.length, hand + 1, 'library specialist only doubles at the library');
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

test('clean: in colony only, removes 3 waste (janitor 5)', () => {
  let { s } = setup({ 'wren-okafor': 'colony', 'corwin-daly': 'police' });
  s = patch(s, (x) => { x.waste = 7; });
  assert.equal(tryReduce(s, a.clean('corwin-daly')).error, 'mustBeInColony');
  assert.equal(reduce(s, a.clean('wren-okafor')).waste, 2);
  s = setSurvivors(s, { 'corwin-daly': 'colony' });
  assert.equal(reduce(s, a.clean('corwin-daly')).waste, 4);
});

test('lure: moves zombies from your location to another', () => {
  let { s } = setup({ 'lio-fontaine': 'school' });
  s = patch(s, (x) => { x.locations.school.zombies = 3; });
  assert.equal(tryReduce(s, a.lure('lio-fontaine', 'school')).error, 'sameLocation');
  const r = reduce(s, a.lure('lio-fontaine', 'library'));
  assert.equal(r.locations.school.zombies, 1);
  assert.equal(r.locations.library.zombies, 2);
});

test('move: costs energy, repeatable, respects slots; a danger card only into zombies (unless fuel/trucker)', () => {
  let { s } = setup({ 'corwin-daly': 'colony', 'maren-holt': 'colony' });
  s = patch(s, (x) => { x.locations.hospital.zombies = 1; x.locations.library.zombies = 0; });
  let r = reduce(topDanger(s, 'safe'), a.move('corwin-daly', 'hospital'));
  assert.equal(r.survivors['corwin-daly'].location, 'hospital');
  assert.equal(r.lastExposure.cause, 'move');
  assert.equal(energy(r), 100 - ENERGY.COST.move - (r.round % 2 === 0 ? ENERGY.NIGHT : 0));
  const again = reduce(r, a.move('corwin-daly', 'library'));
  assert.deepEqual(again.lastExposure, r.lastExposure, 'empty place: no card');

  const trucker = reduce(s, a.move('maren-holt', 'hospital'));
  assert.equal(trucker.lastExposure, s.lastExposure);

  let [withFuel, fuel] = giveCard(s, 'jerry-can');
  const fueled = reduce(withFuel, a.move('corwin-daly', 'hospital', fuel));
  assert.equal(fueled.lastExposure, s.lastExposure);
  assert.ok(!fueled.team.hand.includes(fuel));
  assert.equal(fueled.waste, withFuel.waste + 1);
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
  [s, food] = giveCard(s, 'rice-sack');
  [s, med] = giveCard(s, 'antibiotics');
  [s, tool] = giveCard(s, 'duct-tape');
  [s, gun] = giveCard(s, 'riot-baton');
  [s, junk] = giveCard(s, 'bedpan');

  const fed = reduce(s, a.playCard(food));
  assert.equal(fed.food, s.food + 2);
  assert.equal(fed.waste, s.waste + 1);

  const healed = reduce(s, a.playCard(med, { targetSurvivorId: 'corwin-daly' }));
  assert.equal(healed.survivors['corwin-daly'].wounds, 0);
  assert.equal(tryReduce(healed, a.playCard(tool, { targetSurvivorId: 'nobody' })).error, 'noSuchSurvivor');
  const boarded = reduce(s, a.playCard(tool, { targetSurvivorId: 'corwin-daly' }));
  assert.equal(boarded.locations.police.barricades, 1);

  assert.equal(tryReduce(s, a.playCard(gun, { targetSurvivorId: 'corwin-daly' })).error, 'equipInstead');
  const charged = reduce(s, a.playCard(junk));
  assert.ok(!charged.team.hand.includes(junk));
  assert.equal(energy(charged), Math.min(energyMax(s), 30 + ENERGY.JUNK));
});

test('contribute adds the card to the crisis and removes it from the hand', () => {
  let { s } = setup({ 'corwin-daly': 'police' });
  let uid;
  [s, uid] = giveCard(s, 'jerry-can');
  const r = reduce(s, a.contribute(uid));
  assert.equal(r.crisis.contributions.at(-1), uid);
  assert.ok(!r.team.hand.includes(uid));
  assert.equal(r.log.at(-1).card, 'jerry-can', 'solo: nothing to hide');
});

test('deposit (beacon scenario) needs a survivor in the colony and the right item', () => {
  let { s } = setup({ 'corwin-daly': 'police' });
  let fuel, food;
  [s, fuel] = giveCard(s, 'jerry-can');
  [s, food] = giveCard(s, 'rice-sack');
  assert.equal(tryReduce(s, a.deposit(fuel)).error, 'mustBeInColony');
  s = setSurvivors(s, { 'corwin-daly': 'colony' });
  assert.equal(tryReduce(s, a.deposit(food)).error, 'wrongItemType');
  assert.equal(reduce(s, a.deposit(fuel)).scenario.deposited, 1);
  const stores = setup({ 'corwin-daly': 'colony' }, 100, { scenarioId: 'stores' });
  let [st, f2] = giveCard(stores.s, 'jerry-can');
  assert.equal(tryReduce(st, a.deposit(f2)).error, 'scenarioHasNoDeposit');
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
  assert.ok(s.round === 2 || s.phase === 'gameOver');
  assert.ok(s.reports.colony);
});

test('a move into zombies can draw any danger card', () => {
  const { s } = setup({ 'corwin-daly': 'colony' });
  const z = patch(s, (x) => { x.locations.school.zombies = 1; });
  for (const kind of ['safe', 'scratch', 'frost', 'startle', 'surrounded', 'bite']) {
    const r = reduce(topDanger(z, kind), a.move('corwin-daly', 'school'));
    assert.equal(r.lastExposure.danger, kind);
  }
});
