import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce, tryReduce } from '../src/core/reducer.js';
import * as a from '../src/core/actions.js';
import { beginTurn } from '../src/core/rules/flow.js';
import { ALL_OBJECTIVES } from '../src/content/objectives.js';
import { startedGame, setSurvivors, giveCard, patch, player } from './_helpers.js';

// ---------------------------------------------------------------- crossroads

function withCrossroadsOnTop(s, cardId) {
  return patch(s, (x) => {
    x.crossroadsDeck = x.crossroadsDeck.filter((c) => c !== cardId);
    x.crossroadsDiscard = x.crossroadsDiscard.filter((c) => c !== cardId);
    x.crossroadsDeck.push(cardId);
    beginTurn(x);
  });
}

test('crossroads only triggers when its condition holds for the active player', () => {
  let s = startedGame();
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, { 'corwin-daly': 'colony' });
  const notHere = withCrossroadsOnTop(s, 'xr-frozen-child'); // needs a survivor at the grocery
  assert.equal(notHere.phase, 'turn');
  assert.ok(notHere.crossroadsDiscard.includes('xr-frozen-child'));

  const here = withCrossroadsOnTop(setSurvivors(s, pid, { 'corwin-daly': 'grocery' }), 'xr-frozen-child');
  assert.equal(here.phase, 'crossroads');
  assert.equal(here.pendingCrossroads.activePlayerId, pid);
  assert.notEqual(here.pendingCrossroads.readerId, pid, 'another player reads the card');
  assert.equal(here.pendingCrossroads.focusSurvivorId, 'corwin-daly');
});

test('resolving a crossroads applies the chosen effects and returns to the turn', () => {
  let s = startedGame();
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, { 'corwin-daly': 'grocery' });
  s = patch(s, (x) => { x.morale = 5; x.helpless = 2; });
  s = withCrossroadsOnTop(s, 'xr-frozen-child');
  const other = s.players.find((p) => p.id !== pid).id;
  assert.equal(tryReduce(s, a.resolveCrossroads(other, 0)).error, 'notYourChoice');
  assert.equal(tryReduce(s, a.endTurn(pid)).error, 'wrongPhase');
  const kind = reduce(s, a.resolveCrossroads(pid, 0));
  assert.equal(kind.phase, 'turn');
  assert.equal(kind.helpless, 3);
  assert.equal(kind.morale, 6);
  const cold = reduce(s, a.resolveCrossroads(pid, 1));
  assert.equal(cold.morale, 4);
  assert.equal(player(cold, pid).hand.length, player(s, pid).hand.length + 1);
});

test('every crossroads card can be resolved both ways without errors', async () => {
  const { CROSSROADS } = await import('../src/content/crossroads.js');
  let s = startedGame();
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, { 'corwin-daly': 'colony', 'agnes-pell': 'school' });
  for (const card of CROSSROADS) {
    for (const choice of [0, 1]) {
      const x = patch(s, (y) => {
        y.phase = 'crossroads';
        y.pendingCrossroads = { cardId: card.id, activePlayerId: pid, readerId: 'p1', focusSurvivorId: 'agnes-pell' };
      });
      const r = reduce(x, a.resolveCrossroads(pid, choice));
      assert.ok(['turn', 'gameOver'].includes(r.phase), card.id);
    }
  }
});

// ---------------------------------------------------------------- requests

test('item requests: target may give a (matching) card or decline', () => {
  let s = startedGame();
  const [p0, p1] = ['p0', 'p1'];
  let food, gun;
  [s, food] = giveCard(s, p1, 'canned-beans');
  [s, gun] = giveCard(s, p1, 'tire-iron');
  s = reduce(s, a.requestItem(p0, p1, 'food'));
  const req = s.requests[0];
  assert.equal(tryReduce(s, a.respondRequest(p0, req.id, null)).error, 'notYourRequest');
  assert.equal(tryReduce(s, a.respondRequest(p1, req.id, gun)).error, 'wrongItemType');
  const given = reduce(s, a.respondRequest(p1, req.id, food));
  assert.ok(player(given, p0).hand.includes(food));
  assert.ok(!player(given, p1).hand.includes(food));
  assert.equal(given.requests.length, 0);
  const declined = reduce(s, a.respondRequest(p1, req.id, null));
  assert.equal(declined.requests.length, 0);
  assert.ok(player(declined, p1).hand.includes(food));
});

// ---------------------------------------------------------------- exile vote

test('exile vote: strict majority of the other players exiles the target', () => {
  let s = startedGame({ players: 4 });
  s = patch(s, (x) => { for (const p of x.players) p.objectiveId = 'pack-rat'; });
  s = setSurvivors(s, 'p3', { 'corwin-daly': 'colony', 'agnes-pell': 'police' });
  s = reduce(s, a.callVote('p0', 'p3'));
  assert.equal(s.phase, 'vote');
  assert.equal(tryReduce(s, a.castVote('p3', false)).error, 'targetCannotVote');
  assert.equal(tryReduce(s, a.castVote('p0', true)).error, 'alreadyVoted');
  s = reduce(s, a.castVote('p1', true));
  assert.equal(s.phase, 'vote');
  const exiled = reduce(s, a.castVote('p2', false)); // 2 of 3 yes
  assert.equal(exiled.phase, 'turn');
  const p3 = player(exiled, 'p3');
  assert.equal(p3.exiled, true);
  assert.equal(ALL_OBJECTIVES[p3.objectiveId].kind, 'exile', 'loyal exile receives an exile objective');
  assert.notEqual(exiled.survivors['corwin-daly'].location, 'colony', 'survivors are pushed out');

  const survived = reduce(s, a.castVote('p2', true));
  assert.equal(player(survived, 'p3').exiled, true, '3 of 3 also exiles');
});

test('a tied vote fails; one vote call per player per round', () => {
  let s = startedGame({ players: 3 });
  s = reduce(s, a.callVote('p0', 'p2'));
  s = reduce(s, a.castVote('p1', false)); // 1 yes, 1 no -> not a majority
  assert.equal(player(s, 'p2').exiled, false);
  assert.equal(s.reports.vote.passed, false);
  assert.equal(tryReduce(s, a.callVote('p0', 'p1')).error, 'alreadyCalledVote');
});

test('exiled players cannot enter the colony, contribute, deposit or add food; betrayers keep their objective', () => {
  let s = startedGame({ players: 3 });
  const pid = s.activePlayerId;
  s = patch(s, (x) => { x.players.find((p) => p.id === pid).objectiveId = 'winter-hoard'; });
  s = setSurvivors(s, pid, { 'corwin-daly': 'police' });
  const others = s.players.filter((p) => p.id !== pid).map((p) => p.id);
  s = reduce(s, a.callVote(others[0], pid));
  s = reduce(s, a.castVote(others[1], true));
  assert.equal(player(s, pid).exiled, true);
  assert.equal(player(s, pid).objectiveId, 'winter-hoard');
  assert.equal(tryReduce(s, a.move(pid, 'corwin-daly', 'colony')).error, 'exiledFromColony');
  let food;
  [s, food] = giveCard(s, pid, 'canned-beans');
  assert.equal(tryReduce(s, a.contribute(pid, food)).error, 'exiledFromColony');
  assert.equal(tryReduce(s, a.playCard(pid, food)).error, 'exiledFromColony');
  assert.equal(tryReduce(s, a.callVote(others[1], pid)).error, 'alreadyExiled');
});
