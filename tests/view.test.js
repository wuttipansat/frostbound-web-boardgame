import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewFor } from '../src/core/view.js';
import { endGame } from '../src/core/rules/flow.js';
import { startedGame, giveCard, patch } from './_helpers.js';

test('viewFor hides other hands, objectives, face-down crisis cards, deck order and rng', () => {
  let s = startedGame();
  let uid;
  [s, uid] = giveCard(s, 'p1', 'jerry-can');
  s = patch(s, (x) => {
    x.players[1].hand = x.players[1].hand.filter((u) => u !== uid);
    x.crisis.contributions.push({ uid, playerId: 'p1' });
  });
  const v = viewFor(s, 'p0');
  assert.equal(v.rng, undefined);
  assert.deepEqual(v.players[0].hand, s.players[0].hand);
  assert.equal(v.players[0].objectiveId, s.players[0].objectiveId);
  assert.deepEqual(v.players[1].hand, []);
  assert.equal(v.players[1].handCount, s.players[1].hand.length);
  assert.equal(v.players[1].objectiveId, null);
  assert.deepEqual(v.crisis.contributions.at(-1), { playerId: 'p1', uid: null });
  assert.equal(v.locations.police.deck.length, 0);
  assert.equal(v.locations.police.deckCount, s.locations.police.deck.length);
  assert.ok(!JSON.stringify(v).includes(`"${uid}"`), 'the face-down card uid never leaks');

  const own = viewFor(s, 'p1');
  assert.equal(own.crisis.contributions.at(-1).uid, uid);
});

test('everything is revealed once the game is over', () => {
  const s = patch(startedGame(), (x) => endGame(x, 'timeOut'));
  const v = viewFor(s, 'p0');
  assert.equal(v.players[1].objectiveId, s.players[1].objectiveId);
});
