import { test } from 'node:test';
import { RULES } from '../src/core/constants.js';
import assert from 'node:assert/strict';
import { reduce, tryReduce } from '../src/core/reducer.js';
import * as a from '../src/core/actions.js';
import { ITEMS } from '../src/content/items.js';
import { LOCATIONS } from '../src/content/locations.js';
import { foodNeeded, killsPerAttack, actionCost, holderOf, packSize } from '../src/core/selectors.js';
import { startedGame, setSurvivors, setEnergy, giveCard, patch } from './_helpers.js';

const turn = (placements, energy = 100, opts = {}) => {
  let s = startedGame(opts);
  s = setSurvivors(s, placements);
  s = setEnergy(s, energy);
  return { s };
};
const hand = (s) => s.stockpile;

test('items have tiers 1-3 and higher tiers are scarcer in the decks', () => {
  const copies = { 1: 0, 2: 0, 3: 0 };
  for (const loc of Object.values(LOCATIONS)) {
    for (const [id, n] of Object.entries(loc.deck ?? {})) copies[ITEMS[id].tier] += n;
  }
  assert.ok(Object.values(ITEMS).every((i) => [1, 2, 3].includes(i.tier)));
  assert.ok(copies[1] > copies[2] && copies[2] > copies[3] && copies[3] >= 1, JSON.stringify(copies));
});

test('weapons are worn: each attack kills the weapon\'s value, at the weapon\'s cost', () => {
  let { s } = turn({ 'corwin-daly': 'police' });
  s = patch(s, (x) => { x.locations.police.zombies = 3; });
  let glock, shotgun, rifle;
  [s, glock] = giveCard(s, 'glock-19');
  [s, shotgun] = giveCard(s, 'remington-870');
  [s, rifle] = giveCard(s, 'mosin-nagant');
  const bare = actionCost(s, 'corwin-daly', 'attack');
  let r = reduce(s, a.equip(shotgun));
  assert.equal(killsPerAttack(r, 'corwin-daly'), 2);
  assert.equal(actionCost(r, 'corwin-daly', 'attack'), 10, 'a shot costs 10');
  const shot = reduce(r, a.attack('corwin-daly'));
  assert.equal(shot.locations.police.zombies, 1 + shot.log.findLast((e) => e.k === 'attack').drawn, 'shotgun kills 2');
  r = reduce(r, a.equip(rifle));
  assert.equal(killsPerAttack(r, 'corwin-daly'), 1);
  assert.ok(bare > 10);
  assert.ok(holderOf(r, shotgun) && holderOf(r, glock));
});

test('tier scales medicine, tools and junk; motor junk is wild in a crisis', () => {
  let { s } = turn({ 'corwin-daly': 'police' }, 20);
  s = patch(s, (x) => { x.survivors['corwin-daly'].wounds = 1; x.survivors['corwin-daly'].frostbite = true; });
  let med, set, junk;
  [s, med] = giveCard(s, 'antibiotics');
  [s, set] = giveCard(s, 'socket-set', 'stockpile');
  [s, junk] = giveCard(s, 'motor-junk');
  const healed = reduce(s, a.playCard(med, { targetSurvivorId: 'corwin-daly' }));
  assert.equal(healed.survivors['corwin-daly'].wounds, 0);
  assert.equal(healed.survivors['corwin-daly'].frostbite, false);
  assert.equal(reduce(s, a.playCard(set)).locations.colony.barricades, 2);
  const re = reduce(s, a.playCard(junk, { targetSurvivorId: 'corwin-daly' }));
  assert.ok(!re.stockpile.includes(junk));
  assert.equal(re.survivors['corwin-daly'].ap, 20 + 24, 'motor junk = 2 × 12 energy');
  assert.equal(ITEMS['motor-junk'].wild, true);
});

test('survivor cards: a newcomer joins the team (+1 morale); a full team gives +2 morale instead', () => {
  let { s } = turn({ 'corwin-daly': 'colony' });
  s = patch(s, (x) => { x.morale = 5; });
  let card; [s, card] = giveCard(s, 'stranger-with-child');
  const r = reduce(s, a.playCard(card));
  assert.equal(r.team.survivors.length, 2);
  assert.equal(r.survivors[r.team.survivors[1]].location, 'colony');
  assert.equal(r.morale, 6);
  assert.ok(!r.stockpile.includes(card));
  let full = setSurvivors(s, { 'corwin-daly': 'colony', 'agnes-pell': 'colony', 'greta-vos': 'colony', 'bo-lindqvist': 'colony', 'nia-calloway': 'colony', 'osei-vance': 'colony' });
  let lone; [full, lone] = giveCard(full, 'lone-wanderer');
  const f = reduce(full, a.playCard(lone));
  assert.equal(f.team.survivors.length, 6, 'at most 6');
  assert.equal(f.morale, 7);
});

test('a blueprint draws one extra card when searching its location, then one goes back', () => {
  let { s } = turn({ 'maren-holt': 'police' });
  let bp; [s, bp] = giveCard(s, 'blueprint-police');
  assert.equal(tryReduce(s, a.playCard(bp)).error, 'equipInstead');
  s = reduce(s, a.equip(bp));
  const n = s.locations.police.deck.length;
  let r = reduce(s, a.search('maren-holt'));
  const pick = r.team.pick;
  assert.ok(pick.uids.length >= 3, 'a find (2–4) plus one'); // GAME-1
  assert.equal(tryReduce(r, a.endTurn()).error, 'pickPending');
  r = reduce(r, a.returnCard(pick.uids[0]));
  assert.equal(r.team.pick, null);
  assert.equal(r.locations.police.deck.length, n - (pick.uids.length - 1));
  assert.equal(r.locations.police.deck[0], pick.uids[0], 'returned to the bottom');
  assert.ok(r.survivors['maren-holt'].pack.includes(pick.uids[1]));
  assert.equal(r.survivors['maren-holt'].gear.book, bp);
  // Elsewhere the blueprint does nothing.
  let { s: s2 } = turn({ 'maren-holt': 'school' });
  let bp2; [s2, bp2] = giveCard(s2, 'blueprint-police');
  s2 = reduce(s2, a.equip(bp2));
  assert.equal(reduce(s2, a.search('maren-holt')).team.pick, null);
  // Only while equipped.
  let { s: s3 } = turn({ 'maren-holt': 'police' });
  [s3] = giveCard(s3, 'blueprint-police');
  assert.equal(reduce(s3, a.search('maren-holt')).team.pick, null);
});

test('books work while equipped (one book slot per survivor): cookbook saves food, field manual adds a barricade', () => {
  let { s } = turn({ 'corwin-daly': 'police', 'agnes-pell': 'colony', 'greta-vos': 'colony', 'bo-lindqvist': 'colony', 'nia-calloway': 'colony', 'osei-vance': 'colony' });
  const need = foodNeeded(s);
  let book; [s, book] = giveCard(s, 'winter-cookbook');
  assert.equal(foodNeeded(s), need, 'not while only in hand');
  s = reduce(s, a.equip(book));
  assert.equal(foodNeeded(s), need - 1);
  let manual; [s, manual] = giveCard(s, 'field-manual');
  s = reduce(s, a.equip(manual));
  assert.equal(foodNeeded(s), need, 'the cookbook went back to the hand');
  assert.equal(reduce(patch(s, (x) => { x.survivors['corwin-daly'].location = 'colony'; }), a.barricade('corwin-daly')).locations.colony.barricades, 2);
  assert.ok(holderOf(s, book));
});

test('step 8 items: consumables, gadgets, crafting', async () => {
  const { craft } = await import('../src/core/actions.js');
  let { s } = turn({ 'corwin-daly': 'police', 'agnes-pell': 'colony' });
  s = patch(s, (x) => { x.survivors['corwin-daly'].hp = 50; x.survivors['corwin-daly'].ap = 30; x.locations.police.zombies = 4; });
  let bandage, coffee, bomb, ammo, pack;
  [s, bandage] = giveCard(s, 'bandage');
  [s, coffee] = giveCard(s, 'coffee');
  [s, bomb] = giveCard(s, 'firebomb');
  assert.equal(reduce(s, a.playCard(bandage, { targetSurvivorId: 'corwin-daly' })).survivors['corwin-daly'].hp, 65);
  assert.equal(reduce(s, a.playCard(coffee, { targetSurvivorId: 'corwin-daly' })).survivors['corwin-daly'].ap, 50);
  const burnt = reduce(s, a.playCard(bomb, { targetSurvivorId: 'corwin-daly' }));
  assert.equal(burnt.locations.police.zombies, 1);
  [s, ammo] = giveCard(s, 'ammo', 'corwin-daly');
  assert.equal(tryReduce(s, a.playCard(ammo, { targetSurvivorId: 'corwin-daly' })).error, 'needGun');
  [s, pack] = giveCard(s, 'big-backpack', 'corwin-daly');
  s = reduce(s, a.equip(pack, 'corwin-daly'));
  assert.equal(packSize(s, 'corwin-daly'), RULES.PACK + 2);
  // Crafting: materials from the stockpile + AP, at the colony.
  let w; [s, w] = giveCard(s, 'wood', 'stockpile'); [s, w] = giveCard(s, 'wood', 'stockpile');
  assert.equal(tryReduce(s, craft('baseball-bat', 'agnes-pell')).error, 'needWorkshop');
  s = patch(s, (x) => { x.base.workshop = 1; });
  assert.equal(tryReduce(s, craft('baseball-bat', 'corwin-daly')).error, 'mustBeInColony');
  assert.equal(tryReduce(s, craft('sled', 'agnes-pell')).error, 'missingMaterials');
  const made = reduce(s, craft('baseball-bat', 'agnes-pell'));
  assert.ok(made.stockpile.some((u) => made.cards[u] === 'baseball-bat'));
  assert.ok(!made.stockpile.some((u) => made.cards[u] === 'wood'));
});

test('base upgrades: materials start a level, AP carries over, effects apply', async () => {
  const { build } = await import('../src/core/actions.js');
  const { nextLevel, bedCount, spawnForecast, sleepPlan } = await import('../src/core/selectors.js');
  let { s } = turn({ 'corwin-daly': 'colony', 'agnes-pell': 'colony' });
  assert.equal(tryReduce(s, build('dorm', 'corwin-daly')).error, 'missingMaterials');
  let w; [s, w] = giveCard(s, 'wood', 'stockpile'); [s, w] = giveCard(s, 'wood', 'stockpile');
  s = patch(s, (x) => { x.survivors['corwin-daly'].ap = 12; x.survivors['agnes-pell'].ap = 50; });
  assert.equal(tryReduce(s, build('dorm', 'corwin-daly')).error, 'notEnoughEnergy', 'a shift needs its full AP from one survivor');
  s = patch(s, (x) => { x.base.dorm = 0; x.building = { dorm: 12 }; for (const u of x.stockpile) if (x.cards[u] === 'wood') x.cards[u] = 'bedpan'; });
  s = reduce(s, build('dorm', 'agnes-pell'));
  assert.equal(s.base.dorm, 1);
  assert.equal(s.survivors['agnes-pell'].ap, 42, 'only the 8 AP that were left');
  assert.equal(bedCount(s), 4);
  // Wall and infirmary.
  const walled = patch(s, (x) => { x.base.wall = 1; x.base.infirmary = 2; });
  assert.equal(spawnForecast(walled).colony, undefined, 'the wall stops the 1 colony zombie');
  assert.equal(sleepPlan(walled)['corwin-daly'].hp, 15 + 10);
  // Greenhouse: +food at dawn.
  const green = patch(s, (x) => { x.base.greenhouse = 2; x.food = 10; });
  const next = reduce(green, a.endTurn());
  assert.ok(next.log.some((e) => e.k === 'food' && e.reason === 'greenhouse' && e.delta === 2));
});

test('snow crawler: 4 stages built like upgrades; finishing it wins; seasons get harsher', async () => {
  const { build } = await import('../src/core/actions.js');
  const { scenarioProgress, isStorm, season } = await import('../src/core/selectors.js');
  const { checkScenarioGoal } = await import('../src/core/rules/flow.js');
  let { s } = turn({ 'corwin-daly': 'colony' }, 100, { scenarioId: 'crawler' });
  let u;
  for (const id of ['scrap', 'scrap', 'scrap', 'wood', 'wood']) [s, u] = giveCard(s, id, 'stockpile');
  for (let i = 0; i < 5; i++) s = reduce(s, build('crawler', 'corwin-daly')); // 100 AP in shifts of 20
  assert.equal(scenarioProgress(s), 1, 'frame done');
  s = patch(s, (x) => { x.survivors['corwin-daly'].ap = 100; });
  assert.equal(tryReduce(s, build('crawler', 'corwin-daly')).error, 'missingMaterials', 'the engine needs 2 engine parts');
  assert.equal(checkScenarioGoal(patch(s, (x) => { x.base.crawler = 3; })), false);
  assert.equal(checkScenarioGoal(patch(s, (x) => { x.base.crawler = 4; })), true);
  assert.deepEqual([1, 11, 21, 31].map((d) => season(patch(s, (x) => { x.day = d; }))), ['early', 'cold', 'brutes', 'storms']);
  assert.equal(isStorm(patch(s, (x) => { x.day = 32; })), true, 'every day is a storm from day 31');
});
