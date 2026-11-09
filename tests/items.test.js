import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce, tryReduce } from '../src/core/reducer.js';
import * as a from '../src/core/actions.js';
import { ITEMS } from '../src/content/items.js';
import { LOCATIONS } from '../src/content/locations.js';
import { foodNeeded, killsPerAttack, actionCost } from '../src/core/selectors.js';
import { startedGame, setSurvivors, setEnergy, giveCard, patch } from './_helpers.js';

const turn = (placements, energy = 100) => {
  let s = startedGame();
  s = setSurvivors(s, placements);
  s = setEnergy(s, energy);
  return { s };
};
const hand = (s) => s.team.hand;

test('items have tiers 1-3 and higher tiers are scarcer in the decks', () => {
  const copies = { 1: 0, 2: 0, 3: 0 };
  for (const loc of Object.values(LOCATIONS)) {
    for (const [id, n] of Object.entries(loc.deck ?? {})) copies[ITEMS[id].tier] += n;
  }
  assert.ok(Object.values(ITEMS).every((i) => [1, 2, 3].includes(i.tier)));
  assert.ok(copies[1] > copies[2] && copies[2] > copies[3] && copies[3] >= 1, JSON.stringify(copies));
});

test('weapons are worn: each attack kills the weapon\'s value, at the weapon\'s cost, with no danger card', () => {
  let { s } = turn({ 'corwin-daly': 'police' });
  s = patch(s, (x) => { x.locations.police.zombies = 3; });
  let glock, shotgun, rifle;
  [s, glock] = giveCard(s, 'glock-19');
  [s, shotgun] = giveCard(s, 'remington-870');
  [s, rifle] = giveCard(s, 'mosin-nagant');
  const bare = actionCost(s, 'corwin-daly', 'attack');
  let r = reduce(s, a.equip(shotgun));
  assert.equal(killsPerAttack(r, 'corwin-daly'), 2);
  assert.equal(actionCost(r, 'corwin-daly', 'attack'), bare + 2);
  const shot = reduce(r, a.attack('corwin-daly'));
  assert.equal(shot.locations.police.zombies, 1, 'shotgun kills 2');
  assert.deepEqual(shot.lastExposure, r.lastExposure, 'armed: no danger card');
  assert.equal(shot.waste, s.waste, 'gear is never spent');
  r = reduce(r, a.equip(rifle));
  assert.equal(actionCost(r, 'corwin-daly', 'attack'), bare - 6, 'the rifle is the cheapest shot');
  assert.ok(r.team.hand.includes(shotgun) && r.team.hand.includes(glock));
});

test('tier scales medicine, tools and junk; motor junk is wild in a crisis', () => {
  let { s } = turn({ 'corwin-daly': 'police' }, 20);
  s = patch(s, (x) => { x.survivors['corwin-daly'].wounds = 1; x.survivors['corwin-daly'].frostbite = true; });
  let med, set, junk;
  [s, med] = giveCard(s, 'antibiotics');
  [s, set] = giveCard(s, 'socket-set');
  [s, junk] = giveCard(s, 'motor-junk');
  const healed = reduce(s, a.playCard(med, { targetSurvivorId: 'corwin-daly' }));
  assert.equal(healed.survivors['corwin-daly'].wounds, 0);
  assert.equal(healed.survivors['corwin-daly'].frostbite, false);
  assert.equal(reduce(s, a.playCard(set, { targetSurvivorId: 'corwin-daly' })).locations.police.barricades, 2);
  const re = reduce(s, a.playCard(junk));
  assert.ok(!re.team.hand.includes(junk));
  assert.equal(re.team.energy, 20 + 24, 'motor junk = 2 × 12 energy');
  assert.equal(ITEMS['motor-junk'].wild, true);
});

test('survivor cards: a newcomer joins the colony (+1 morale, more mouths); you still play one survivor', () => {
  let { s } = turn({ 'corwin-daly': 'colony' });
  s = patch(s, (x) => { x.morale = 5; });
  let card; [s, card] = giveCard(s, 'stranger-with-child');
  const r = reduce(s, a.playCard(card));
  assert.equal(r.team.survivors.length, 1);
  assert.equal(r.helpless, s.helpless + 2, 'the stranger and the child');
  assert.equal(r.morale, 6);
  assert.ok(!r.team.hand.includes(card));
  let lone; [s, lone] = giveCard(s, 'lone-wanderer');
  assert.equal(reduce(s, a.playCard(lone)).helpless, s.helpless + 1);
});

test('a blueprint draws one extra card when searching its location, then one goes back', () => {
  let { s } = turn({ 'maren-holt': 'police' });
  let bp; [s, bp] = giveCard(s, 'blueprint-police');
  assert.equal(tryReduce(s, a.playCard(bp)).error, 'equipInstead');
  s = reduce(s, a.equip(bp));
  const n = s.locations.police.deck.length;
  let r = reduce(s, a.search('maren-holt'));
  const pick = r.team.pick;
  assert.equal(pick.uids.length, 2);
  assert.equal(tryReduce(r, a.endTurn()).error, 'pickPending');
  r = reduce(r, a.returnCard(pick.uids[0]));
  assert.equal(r.team.pick, null);
  assert.equal(r.locations.police.deck.length, n - 1);
  assert.equal(r.locations.police.deck[0], pick.uids[0], 'returned to the bottom');
  assert.ok(r.team.hand.includes(pick.uids[1]));
  assert.equal(r.team.gear.book, bp);
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

test('books work while equipped (one book slot): cookbook saves food, field manual adds a barricade', () => {
  let { s } = turn({ 'corwin-daly': 'police' });
  s = patch(s, (x) => { x.helpless = 6; });
  const need = foodNeeded(s);
  let book; [s, book] = giveCard(s, 'winter-cookbook');
  assert.equal(foodNeeded(s), need, 'not while only in hand');
  s = reduce(s, a.equip(book));
  assert.equal(foodNeeded(s), need - 1);
  let manual; [s, manual] = giveCard(s, 'field-manual');
  s = reduce(s, a.equip(manual));
  assert.equal(foodNeeded(s), need, 'the cookbook went back to the hand');
  assert.equal(reduce(s, a.barricade('corwin-daly')).locations.police.barricades, 2);
  assert.ok(s.team.hand.includes(book));
});
