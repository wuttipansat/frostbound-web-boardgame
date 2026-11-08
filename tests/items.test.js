import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce, tryReduce } from '../src/core/reducer.js';
import * as a from '../src/core/actions.js';
import { ITEMS } from '../src/content/items.js';
import { LOCATIONS } from '../src/content/locations.js';
import { foodNeeded, getPlayer } from '../src/core/selectors.js';
import { startedGame, setSurvivors, setDice, giveCard, patch } from './_helpers.js';

const turn = (placements, dice = [6, 6, 6]) => {
  let s = startedGame();
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, placements);
  s = setDice(s, pid, dice);
  return { s, pid };
};
const hand = (s, pid) => getPlayer(s, pid).hand;

test('items have tiers 1-3 and higher tiers are scarcer in the decks', () => {
  const copies = { 1: 0, 2: 0, 3: 0 };
  for (const loc of Object.values(LOCATIONS)) {
    for (const [id, n] of Object.entries(loc.deck ?? {})) copies[ITEMS[id].tier] += n;
  }
  assert.ok(Object.values(ITEMS).every((i) => [1, 2, 3].includes(i.tier)));
  assert.ok(copies[1] > copies[2] && copies[2] > copies[3] && copies[3] >= 1, JSON.stringify(copies));
});

test('weapons are permanent: they stay in hand and work once per turn; stronger guns kill more', () => {
  let { s, pid } = turn({ 'corwin-daly': 'police' });
  s = patch(s, (x) => { x.locations.police.zombies = 3; });
  let glock, shotgun;
  [s, glock] = giveCard(s, pid, 'glock-19');
  [s, shotgun] = giveCard(s, pid, 'remington-870');
  let r = reduce(s, a.playCard(pid, shotgun, { targetSurvivorId: 'corwin-daly' }));
  assert.equal(r.locations.police.zombies, 1, 'shotgun kills 2');
  assert.ok(hand(r, pid).includes(shotgun), 'weapon stays in hand');
  assert.equal(r.waste, s.waste, 'no waste');
  assert.equal(tryReduce(r, a.playCard(pid, shotgun, { targetSurvivorId: 'corwin-daly' })).error, 'cardUsedThisTurn');
  r = reduce(r, a.playCard(pid, glock, { targetSurvivorId: 'corwin-daly' }));
  assert.equal(r.locations.police.zombies, 0);
});

test('the Mosin-Nagant shoots into any location', () => {
  let { s, pid } = turn({ 'corwin-daly': 'colony' });
  s = patch(s, (x) => { x.locations.hospital.zombies = 2; });
  let rifle; [s, rifle] = giveCard(s, pid, 'mosin-nagant');
  assert.equal(tryReduce(s, a.playCard(pid, rifle, { targetLocation: 'school' })).error, 'noZombiesHere');
  const r = reduce(s, a.playCard(pid, rifle, { targetLocation: 'hospital' }));
  assert.equal(r.locations.hospital.zombies, 1);
  assert.equal(r.lastExposure, s.lastExposure);
});

test('tier scales medicine, tools and junk; motor junk is wild in a crisis', () => {
  let { s, pid } = turn({ 'corwin-daly': 'police' }, [1, 1, 6]);
  s = patch(s, (x) => { x.survivors['corwin-daly'].wounds = 1; x.survivors['corwin-daly'].frostbite = true; });
  let med, set, junk;
  [s, med] = giveCard(s, pid, 'antibiotics');
  [s, set] = giveCard(s, pid, 'socket-set');
  [s, junk] = giveCard(s, pid, 'motor-junk');
  const healed = reduce(s, a.playCard(pid, med, { targetSurvivorId: 'corwin-daly' }));
  assert.equal(healed.survivors['corwin-daly'].wounds, 0);
  assert.equal(healed.survivors['corwin-daly'].frostbite, false);
  assert.equal(reduce(s, a.playCard(pid, set, { targetSurvivorId: 'corwin-daly' })).locations.police.barricades, 2);
  const re = reduce(s, a.playCard(pid, junk, { dieIndex: 0, dieIndex2: 1 }));
  assert.ok(!hand(re, pid).includes(junk));
  assert.equal(ITEMS['motor-junk'].wild, true);
});

test('survivor cards recruit a new survivor (and the stranger brings a helpless child)', () => {
  let { s, pid } = turn({ 'corwin-daly': 'colony' });
  let card; [s, card] = giveCard(s, pid, 'stranger-with-child');
  const before = getPlayer(s, pid).survivors.length;
  const r = reduce(s, a.playCard(pid, card));
  assert.equal(getPlayer(r, pid).survivors.length, before + 1);
  assert.equal(r.helpless, s.helpless + 1);
  assert.ok(!hand(r, pid).includes(card));
  const empty = patch(s, (x) => { x.survivorDeck = []; });
  assert.equal(tryReduce(empty, a.playCard(pid, card)).error, 'noSurvivorsLeft');
});

test('a blueprint draws one extra card when searching its location, then one goes back', () => {
  let { s, pid } = turn({ 'maren-holt': 'police' });
  let bp; [s, bp] = giveCard(s, pid, 'blueprint-police');
  assert.equal(tryReduce(s, a.playCard(pid, bp)).error, 'passiveItem');
  const n = s.locations.police.deck.length;
  let r = reduce(s, a.search(pid, 'maren-holt', 0));
  const pick = getPlayer(r, pid).pick;
  assert.equal(pick.uids.length, 2);
  assert.equal(tryReduce(r, a.endTurn(pid)).error, 'pickPending');
  r = reduce(r, a.returnCard(pid, pick.uids[0]));
  assert.equal(getPlayer(r, pid).pick, null);
  assert.equal(r.locations.police.deck.length, n - 1);
  assert.equal(r.locations.police.deck[0], pick.uids[0], 'returned to the bottom');
  assert.ok(hand(r, pid).includes(pick.uids[1]) && hand(r, pid).includes(bp));
  // Elsewhere the blueprint does nothing.
  let { s: s2, pid: p2 } = turn({ 'maren-holt': 'school' });
  [s2] = giveCard(s2, p2, 'blueprint-police');
  assert.equal(reduce(s2, a.search(p2, 'maren-holt', 0)).players.find((p) => p.id === p2).pick, null);
});

test('books work while held: cookbook saves food, field manual adds a barricade', () => {
  let { s, pid } = turn({ 'corwin-daly': 'police' });
  s = patch(s, (x) => { x.helpless = 6; });
  const need = foodNeeded(s);
  let book; [s, book] = giveCard(s, pid, 'winter-cookbook');
  assert.equal(foodNeeded(s), need - 1);
  [s] = giveCard(s, pid, 'field-manual');
  assert.equal(reduce(s, a.barricade(pid, 'corwin-daly', 0)).locations.police.barricades, 2);
  assert.ok(hand(s, pid).includes(book));
});

test('the hidden blueprint pick is not shown to other seats', async () => {
  const { viewFor } = await import('../src/core/view.js');
  let { s, pid } = turn({ 'corwin-daly': 'police' });
  [s] = giveCard(s, pid, 'blueprint-police');
  const r = reduce(s, a.search(pid, 'corwin-daly', 0));
  const other = r.players.find((p) => p.id !== pid).id;
  assert.equal(viewFor(r, other).players.find((p) => p.id === pid).pick, null);
  assert.ok(viewFor(r, pid).players.find((p) => p.id === pid).pick);
});
