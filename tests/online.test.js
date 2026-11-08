import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room, makeCode } from '../src/net/room.js';
import { hydrateView, newLogEntries } from '../src/net/client.js';
import { botAction } from '../src/ai/simpleBot.js';
import { mulberry } from '../src/ai/simulate.js';
import { pendingActors } from '../src/core/selectors.js';
import { tryReduce } from '../src/core/reducer.js';
import * as A from '../src/core/actions.js';

const room = (count = 3, ai = []) => new Room('TEST', { count, ai, scenarioId: 'beacon', betrayer: 'never', seed: 7 }, { random: mulberry(1) });

test('room codes use unambiguous letters', () => {
  const code = makeCode(mulberry(3));
  assert.match(code, /^[A-HJ-NP-Z2-9]{4}$/);
});

test('lobby: humans take free seats, bots are pre-filled, only the host starts, and only when full', () => {
  const r = room(3, [false, false, true]);
  const a = r.join('Ana');
  assert.equal(a.seat, 0);
  assert.equal(r.start(0).error, 'seatsOpen');
  const b = r.join('Ben');
  assert.equal(b.seat, 1);
  assert.equal(r.join('Chai').error, 'roomFull', 'seat 2 is a bot');
  assert.equal(r.start(1).error, 'notHost');
  assert.ok(r.start(0).ok);
  assert.equal(r.join('Late').error, 'roomStarted');
  assert.deepEqual(r.state.players.map((p) => [p.name, p.isAI]), [['Ana', false], ['Ben', false], ['Bot 3', true]]);
  assert.ok(!JSON.stringify(r.lobby()).includes(a.token), 'tokens never leave the server');
});

test('a dropped player rejoins the same seat with their token', () => {
  const r = room(2);
  const a = r.join('Ana'); r.join('Ben'); r.start(0);
  r.leave(0);
  assert.equal(r.lobby().seats[0].connected, false);
  assert.deepEqual(r.rejoin(a.token), { seat: 0, token: a.token });
  assert.equal(r.rejoin('nope').error, 'badToken');
});

test('players can only act for their own seat, and illegal moves are refused', () => {
  const r = room(2);
  r.join('Ana'); r.join('Ben'); r.start(0);
  const p1 = r.state.players[1];
  assert.equal(r.act(0, A.draftPick('p1', p1.draftOptions.slice(0, 2))).error, 'notYourSeat');
  assert.equal(r.act(0, A.draftPick('p0', ['nope', 'nada'])).error, 'notInDraftOptions');
  assert.ok(r.act(0, A.draftPick('p0', r.state.players[0].draftOptions.slice(0, 2))).ok);
});

test('each seat only sees its own hand, objective and contributions', () => {
  const r = room(2);
  r.join('Ana'); r.join('Ben'); r.start(0);
  for (const seat of [0, 1]) r.act(seat, A.draftPick(`p${seat}`, r.state.players[seat].draftOptions.slice(0, 2)));
  const v = r.view(0);
  assert.equal(v.rng, undefined);
  assert.deepEqual(v.players[1].hand, []);
  assert.equal(v.players[1].objectiveId, null);
  assert.ok(v.players[0].hand.length > 0 && v.players[0].hand.every((u) => v.cards[u]));
  for (const loc of Object.values(v.locations)) if (loc.deck) assert.deepEqual(loc.deck, []);
  // The client fills in harmless stand-ins so it can check its own moves locally.
  const h = hydrateView(v);
  assert.equal(h.locations.police.deck.length, v.locations.police.deckCount);
  assert.ok(h.rng && h.crisisDeck.length === v.crisisDeckCount);
});

test('a whole online game: two humans (driven by the bot logic) and a bot, to the end', () => {
  const r = room(3, [false, false, true]);
  r.join('Ana'); r.join('Ben'); r.start(0);
  const random = mulberry(5);
  let steps = 0;
  while (r.state.phase !== 'gameOver' && steps++ < 4000) {
    if (r.state.phase !== 'draft') for (const seat of [0, 1]) r.markSeen(seat); // both looked at their objective
    if (r.nextBotAction()) { assert.ok(r.botStep(), 'bots always make progress'); continue; }
    const s = r.state;
    const req = s.requests.find((q) => !s.players.find((p) => p.id === q.to).isAI);
    const who = req ? req.to : pendingActors(s)[0];
    const seat = Number(who.slice(1));
    // What the human's own client would compute from its view must still be legal on the server.
    let action = botAction(s, who, { random });
    if (!tryReduce(s, action).ok) action = s.phase === 'turn' ? A.endTurn(who) : action;
    assert.ok(r.act(seat, action).ok, `${action.type} by ${who}`);
  }
  assert.equal(r.state.phase, 'gameOver');
});

test('log diffing finds the new entries, even when the log is capped', () => {
  const a = [{ k: 1 }, { k: 2 }];
  assert.deepEqual(newLogEntries(a, [...a, { k: 3 }]), [{ k: 3 }]);
  assert.deepEqual(newLogEntries([{ k: 1 }, { k: 2 }, { k: 3 }], [{ k: 2 }, { k: 3 }, { k: 4 }]), [{ k: 4 }]);
  assert.deepEqual(newLogEntries([], [{ k: 1 }]), [{ k: 1 }]);
});

test('draft: both players pick at once, in any order, and nobody sees the other picks until everyone is done', () => {
  const r = room(2);
  r.join('Ana'); r.join('Ben'); r.start(0);
  const opts = (seat) => r.state.players[seat].draftOptions.slice(0, 2);
  const benPicks = opts(1);
  // Ben (seat 1) picks first: no waiting for Ana's turn.
  assert.ok(r.act(1, A.draftPick('p1', benPicks)).ok);
  const anaView = r.view(0);
  assert.equal(anaView.phase, 'draft');
  assert.equal(anaView.players[1].drafted, true, 'Ana sees THAT Ben has picked');
  assert.deepEqual(anaView.players[1].survivors, [], '…but not whom');
  assert.ok(!JSON.stringify(anaView).includes(benPicks[0]) || anaView.players[0].draftOptions.includes(benPicks[0]), 'Ben\'s pick is nowhere in Ana\'s view');
  assert.ok(r.act(0, A.draftPick('p0', opts(0))).ok);
  const after = r.view(0);
  assert.notEqual(after.phase, 'draft');
  assert.deepEqual(after.players[1].survivors, benPicks, 'revealed once everyone is done');
});

test('after the draft, nothing moves until every human has read their secret objective', () => {
  const r = room(3, [false, false, true]);
  r.join('Ana'); r.join('Ben'); r.start(0);
  for (const seat of [0, 1]) r.act(seat, A.draftPick(`p${seat}`, r.state.players[seat].draftOptions.slice(0, 2)));
  while (r.state.phase === 'draft' && r.botStep()); // the bot drafts
  assert.notEqual(r.state.phase, 'draft');
  assert.equal(r.ready, false);
  assert.equal(r.nextBotAction(), null, 'bots wait too');
  const who = pendingActors(r.state)[0];
  assert.equal(r.act(Number(who.slice(1)) < 2 ? Number(who.slice(1)) : 0, A.endTurn(who)).error, who === 'p2' ? 'notYourSeat' : 'waitingObjectives');
  r.markSeen(0);
  assert.equal(r.lobby().seats[0].seen, true);
  assert.equal(r.lobby().seats[1].seen, false);
  assert.equal(r.ready, false);
  r.markSeen(1);
  assert.equal(r.ready, true);
  // Each view only carries its own objective.
  const v = r.view(0);
  assert.ok(v.players[0].objectiveId);
  assert.equal(v.players[1].objectiveId, null);
  assert.equal(v.players[2].objectiveId, null);
});
