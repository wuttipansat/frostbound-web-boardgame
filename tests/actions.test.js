import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce, tryReduce } from '../src/core/reducer.js';
import * as a from '../src/core/actions.js';
import { startedGame, setSurvivors, setDice, giveCard, patch, player, findSeed } from './_helpers.js';

function setup(placements, dice = [6, 6, 6], opts = {}) {
  let s = startedGame(opts);
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, placements);
  s = setDice(s, pid, dice);
  return { s, pid };
}

test('only the active player can act, and only in the turn phase', () => {
  const { s, pid } = setup({ 'corwin-daly': 'police' });
  const other = s.players.find((p) => p.id !== pid).id;
  assert.equal(tryReduce(s, a.endTurn(other)).error, 'notYourTurn');
  const crossroads = patch(s, (x) => { x.phase = 'crossroads'; });
  assert.equal(tryReduce(crossroads, a.search(pid, 'corwin-daly', 0)).error, 'wrongPhase');
});

test('attack: needs zombies and a die >= attack value; kills one and rolls exposure', () => {
  let { s, pid } = setup({ 'corwin-daly': 'police' }, [2, 3]);
  assert.equal(tryReduce(s, a.attack(pid, 'corwin-daly', 1)).error, 'noZombiesHere');
  s = patch(s, (x) => { x.locations.police.zombies = 2; });
  assert.equal(tryReduce(s, a.attack(pid, 'corwin-daly', 0)).error, 'dieTooLow');
  const after = reduce(s, a.attack(pid, 'corwin-daly', 1));
  assert.equal(after.locations.police.zombies, 1);
  assert.equal(after.totalKills, 1);
  assert.equal(player(after, pid).kills, 1);
  assert.ok(player(after, pid).dice[1].used);
  assert.equal(after.lastExposure.survivorId, 'corwin-daly');
  assert.equal(after.lastExposure.cause, 'attack');
  assert.equal(tryReduce(after, a.attack(pid, 'corwin-daly', 1)).error, 'dieUsed');
});

test('attack abilities: sniper skips exposure, bouncer kills two', () => {
  let { s, pid } = setup({ 'ilse-brandt': 'police', 'teodor-rusu': 'grocery' });
  s = patch(s, (x) => { x.locations.police.zombies = 2; x.locations.grocery.zombies = 3; });
  const sniped = reduce(s, a.attack(pid, 'ilse-brandt', 0));
  assert.equal(sniped.lastExposure, s.lastExposure, 'no exposure roll');
  const smashed = reduce(s, a.attack(pid, 'teodor-rusu', 0));
  assert.equal(smashed.locations.grocery.zombies, 1);
  assert.equal(smashed.totalKills, 2);
});

test('search: not in colony, draws from location deck, specialists draw two', () => {
  let { s, pid } = setup({ 'hattie-moss': 'grocery', 'corwin-daly': 'colony', 'agnes-pell': 'school' }, [1, 6, 6]);
  assert.equal(tryReduce(s, a.search(pid, 'corwin-daly', 1)).error, 'cannotSearchColony');
  assert.equal(tryReduce(s, a.search(pid, 'hattie-moss', 0)).error, 'dieTooLow');
  const hand = player(s, pid).hand.length;
  const deck = s.locations.grocery.deck.length;
  const r = reduce(s, a.search(pid, 'hattie-moss', 1));
  assert.equal(player(r, pid).hand.length, hand + 2);
  assert.equal(r.locations.grocery.deck.length, deck - 2);
  const r2 = reduce(s, a.search(pid, 'agnes-pell', 2));
  assert.equal(player(r2, pid).hand.length, hand + 1, 'library specialist only doubles at the library');
  const empty = patch(s, (x) => { x.locations.grocery.deck = []; });
  assert.equal(tryReduce(empty, a.search(pid, 'hattie-moss', 1)).error, 'deckEmpty');
});

test('barricade: any die, limited by free slots; zombies smash barricades first', () => {
  let { s, pid } = setup({ 'nia-calloway': 'police', 'corwin-daly': 'colony' }, [1, 1, 1]);
  let r = reduce(s, a.barricade(pid, 'nia-calloway', 0));
  assert.equal(r.locations.police.barricades, 2, 'locksmith places two');
  r = reduce(r, a.barricade(pid, 'nia-calloway', 1));
  assert.equal(r.locations.police.barricades, 3, 'capped at the 3 zombie slots');
  assert.equal(tryReduce(r, a.barricade(pid, 'nia-calloway', 2)).error, 'noBarricadeSpace');
  r = reduce(r, a.barricade(pid, 'corwin-daly', 2));
  assert.equal(r.locations.colony.barricades, 1);
});

test('clean: in colony only, removes 3 waste (janitor 5)', () => {
  let { s, pid } = setup({ 'wren-okafor': 'colony', 'corwin-daly': 'police' }, [1, 1]);
  s = patch(s, (x) => { x.waste = 7; });
  assert.equal(tryReduce(s, a.clean(pid, 'corwin-daly', 0)).error, 'mustBeInColony');
  assert.equal(reduce(s, a.clean(pid, 'wren-okafor', 0)).waste, 2);
  s = setSurvivors(s, pid, { 'corwin-daly': 'colony' });
  assert.equal(reduce(s, a.clean(pid, 'corwin-daly', 0)).waste, 4);
});

test('lure: moves zombies from your location to another', () => {
  let { s, pid } = setup({ 'lio-fontaine': 'school' }, [1]);
  s = patch(s, (x) => { x.locations.school.zombies = 3; });
  assert.equal(tryReduce(s, a.lure(pid, 'lio-fontaine', 0, 'school')).error, 'sameLocation');
  const r = reduce(s, a.lure(pid, 'lio-fontaine', 0, 'library'));
  assert.equal(r.locations.school.zombies, 1);
  assert.equal(r.locations.library.zombies, 2);
});

test('move: free, once per survivor per turn, respects slots, exposure unless fuel/trucker', () => {
  let { s, pid } = setup({ 'corwin-daly': 'colony', 'maren-holt': 'colony' });
  let r = reduce(s, a.move(pid, 'corwin-daly', 'hospital'));
  assert.equal(r.survivors['corwin-daly'].location, 'hospital');
  assert.equal(r.lastExposure.cause, 'move');
  assert.equal(tryReduce(r, a.move(pid, 'corwin-daly', 'library')).error, 'alreadyMoved');

  const trucker = reduce(s, a.move(pid, 'maren-holt', 'gas'));
  assert.equal(trucker.lastExposure, s.lastExposure);

  let [withFuel, fuel] = giveCard(s, pid, 'jerry-can');
  const fueled = reduce(withFuel, a.move(pid, 'corwin-daly', 'gas', fuel));
  assert.equal(fueled.lastExposure, s.lastExposure);
  assert.ok(!player(fueled, pid).hand.includes(fuel));
  assert.equal(fueled.waste, withFuel.waste + 1);
  let [withFood, food] = giveCard(s, pid, 'canned-beans');
  assert.equal(tryReduce(withFood, a.move(pid, 'corwin-daly', 'gas', food)).error, 'needFuel');

  // Hospital has 3 slots.
  const full = patch(s, (x) => {
    for (const [i, id] of ['agnes-pell', 'rafael-quist', 'greta-vos'].entries()) {
      x.survivors[id] = { id, owner: x.players[1].id, location: 'hospital', wounds: 0, frostbite: false, alive: true, moved: false, i };
    }
  });
  assert.equal(tryReduce(full, a.move(pid, 'corwin-daly', 'hospital')).error, 'locationFull');
});

test('playing cards: food, medicine, tools, weapon, junk', () => {
  let { s, pid } = setup({ 'corwin-daly': 'police' }, [1, 6]);
  s = patch(s, (x) => { x.survivors['corwin-daly'].wounds = 1; x.locations.police.zombies = 1; });
  let food, med, tool, gun, junk;
  [s, food] = giveCard(s, pid, 'rice-sack');
  [s, med] = giveCard(s, pid, 'antibiotics');
  [s, tool] = giveCard(s, pid, 'duct-tape');
  [s, gun] = giveCard(s, pid, 'riot-baton');
  [s, junk] = giveCard(s, pid, 'bedpan');

  const fed = reduce(s, a.playCard(pid, food));
  assert.equal(fed.food, s.food + 2);
  assert.equal(fed.waste, s.waste + 1);

  const healed = reduce(s, a.playCard(pid, med, { targetSurvivorId: 'corwin-daly' }));
  assert.equal(healed.survivors['corwin-daly'].wounds, 0);
  assert.equal(tryReduce(healed, a.playCard(pid, tool, { targetSurvivorId: 'nobody' })).error, 'noSuchSurvivor');

  const shot = reduce(s, a.playCard(pid, gun, { targetSurvivorId: 'corwin-daly' }));
  assert.equal(shot.locations.police.zombies, 0);
  assert.equal(shot.totalKills, 1);
  assert.equal(shot.lastExposure, s.lastExposure, 'weapons never trigger exposure');

  // The baton killed the only zombie, so the free slot can be barricaded.
  const boarded = reduce(shot, a.playCard(pid, tool, { targetSurvivorId: 'corwin-daly' }));
  assert.equal(boarded.locations.police.barricades, 1);

  const rerolled = reduce(s, a.playCard(pid, junk, { dieIndex: 0 }));
  assert.ok(!player(rerolled, pid).hand.includes(junk));
  assert.ok(player(rerolled, pid).dice[0].v >= 1 && player(rerolled, pid).dice[0].v <= 6);
});

test('contribute is face-down and removes the card from hand', () => {
  let { s, pid } = setup({ 'corwin-daly': 'police' });
  let uid;
  [s, uid] = giveCard(s, pid, 'jerry-can');
  const r = reduce(s, a.contribute(pid, uid));
  assert.deepEqual(r.crisis.contributions.at(-1), { uid, playerId: pid });
  assert.ok(!player(r, pid).hand.includes(uid));
  assert.ok(!JSON.stringify(r.log.at(-1)).includes('jerry'), 'card identity not logged');
});

test('deposit (beacon scenario) needs a survivor in the colony and the right item', () => {
  let { s, pid } = setup({ 'corwin-daly': 'police' });
  let fuel, food;
  [s, fuel] = giveCard(s, pid, 'jerry-can');
  [s, food] = giveCard(s, pid, 'rice-sack');
  assert.equal(tryReduce(s, a.deposit(pid, fuel)).error, 'mustBeInColony');
  s = setSurvivors(s, pid, { 'corwin-daly': 'colony' });
  assert.equal(tryReduce(s, a.deposit(pid, food)).error, 'wrongItemType');
  assert.equal(reduce(s, a.deposit(pid, fuel)).scenario.deposited, 1);
  const stores = setup({ 'corwin-daly': 'colony' }, [6], { scenarioId: 'stores' });
  let [st, f2] = giveCard(stores.s, stores.pid, 'jerry-can');
  assert.equal(tryReduce(st, a.deposit(stores.pid, f2)).error, 'scenarioHasNoDeposit');
});

test('healer ability: once per turn, same location only', () => {
  let { s, pid } = setup({ 'osei-vance': 'colony', 'corwin-daly': 'colony' });
  s = patch(s, (x) => { x.survivors['corwin-daly'].wounds = 2; });
  const r = reduce(s, a.useAbility(pid, 'osei-vance', 'corwin-daly'));
  assert.equal(r.survivors['corwin-daly'].wounds, 1);
  assert.equal(tryReduce(r, a.useAbility(pid, 'osei-vance', 'corwin-daly')).error, 'abilityUsed');
  assert.equal(tryReduce(s, a.useAbility(pid, 'corwin-daly', 'corwin-daly')).error, 'noActiveAbility');
});

test('end turn passes to the next seat; last turn triggers the colony phase', () => {
  let s = startedGame();
  const order = [];
  for (let i = 0; i < s.players.length; i++) {
    order.push(s.activePlayerId);
    s = reduce(s, a.endTurn(s.activePlayerId));
    if (s.phase === 'crossroads') s = reduce(s, a.resolveCrossroads(s.activePlayerId, 1));
  }
  assert.equal(new Set(order).size, s.players.length);
  assert.ok(s.round === 2 || s.phase === 'gameOver');
  assert.ok(s.reports.colony);
});

test('findSeed helper sanity: a move can roll any exposure face', () => {
  const { s, pid } = setup({ 'corwin-daly': 'colony' });
  for (const face of ['blank', 'wound', 'frostbite', 'bite']) {
    const r = findSeed(s, (x) => reduce(x, a.move(pid, 'corwin-daly', 'school')), (x) => x.lastExposure.face === face);
    assert.equal(r.lastExposure.face, face);
  }
});
