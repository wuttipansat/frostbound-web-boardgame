// Crossroads choices, item requests between players, and exile votes.
import { PHASES } from '../constants.js';
import { pick } from '../rng.js';
import { assert } from '../errors.js';
import { CROSSROADS_BY_ID } from '../../content/crossroads.js';
import { getPlayer, objectiveDef, itemOf } from '../selectors.js';
import { log, safestOutsideLocation } from './helpers.js';
import { applyEffects } from './effects.js';

// ---------------------------------------------------------------- crossroads

export function resolveCrossroads(s, { playerId, choice }) {
  assert(s.phase === PHASES.CROSSROADS && s.pendingCrossroads, 'wrongPhase', s.phase);
  const pending = s.pendingCrossroads;
  assert(playerId === pending.activePlayerId, 'notYourChoice');
  const card = CROSSROADS_BY_ID[pending.cardId];
  assert(choice === 0 || choice === 1, 'badChoice');
  log(s, 'crossroadsChoice', { cardId: card.id, playerId, choice });
  s.reports.crossroads = { cardId: card.id, playerId, choice };
  s.pendingCrossroads = null;
  s.crossroadsDiscard.push(card.id);
  s.phase = PHASES.TURN;
  applyEffects(s, card.choices[choice].effects, {
    playerId, focusSurvivorId: pending.focusSurvivorId, reason: 'crossroads',
  });
}

// ---------------------------------------------------------------- item requests

export function requestItem(s, { playerId, targetId, itemType = null }) {
  assert(s.phase !== PHASES.GAME_OVER && s.phase !== PHASES.DRAFT, 'wrongPhase', s.phase);
  assert(playerId !== targetId && getPlayer(s, targetId), 'badTarget');
  const id = `rq${s.nextRequestId++}`;
  s.requests.push({ id, from: playerId, to: targetId, itemType });
  log(s, 'request', { playerId, targetId, itemType });
  return id;
}

/** The requested player gives a card (cardUid) or declines (cardUid null). */
export function respondRequest(s, { playerId, requestId, cardUid = null }) {
  const idx = s.requests.findIndex((r) => r.id === requestId);
  assert(idx !== -1, 'noSuchRequest');
  const req = s.requests[idx];
  assert(req.to === playerId, 'notYourRequest');
  if (cardUid) {
    const giver = getPlayer(s, playerId);
    assert(giver.hand.includes(cardUid), 'cardNotInHand');
    if (req.itemType) assert(itemOf(s, cardUid).type === req.itemType, 'wrongItemType');
    giver.hand.splice(giver.hand.indexOf(cardUid), 1);
    getPlayer(s, req.from).hand.push(cardUid);
    log(s, 'give', { from: playerId, to: req.from });
  } else {
    log(s, 'decline', { from: playerId, to: req.from });
  }
  s.requests.splice(idx, 1);
}

// ---------------------------------------------------------------- exile vote

export function callVote(s, { playerId, targetId }) {
  assert(s.phase === PHASES.TURN, 'wrongPhase', s.phase);
  const caller = getPlayer(s, playerId);
  const target = getPlayer(s, targetId);
  assert(caller && target && playerId !== targetId, 'badTarget');
  assert(!target.exiled, 'alreadyExiled');
  assert(caller.lastVoteRound !== s.round, 'alreadyCalledVote');
  caller.lastVoteRound = s.round;
  s.vote = { callerId: playerId, targetId, votes: { [playerId]: true } };
  s.phase = PHASES.VOTE;
  log(s, 'voteCalled', { playerId, targetId });
  maybeFinishVote(s);
}

export function castVote(s, { playerId, yes }) {
  assert(s.phase === PHASES.VOTE && s.vote, 'wrongPhase', s.phase);
  assert(playerId !== s.vote.targetId, 'targetCannotVote');
  assert(getPlayer(s, playerId), 'badPlayer');
  assert(!(playerId in s.vote.votes), 'alreadyVoted');
  s.vote.votes[playerId] = !!yes;
  maybeFinishVote(s);
}

function maybeFinishVote(s) {
  const voters = s.players.filter((p) => p.id !== s.vote.targetId);
  if (voters.some((p) => !(p.id in s.vote.votes))) return;
  const yes = Object.values(s.vote.votes).filter(Boolean).length;
  const passed = yes > voters.length / 2;
  const { targetId } = s.vote;
  s.reports.vote = { targetId, yes, no: voters.length - yes, passed };
  log(s, 'voteResult', { targetId, yes, no: voters.length - yes, passed });
  s.vote = null;
  s.phase = PHASES.TURN;
  if (passed) exilePlayer(s, targetId);
}

export function exilePlayer(s, playerId) {
  const p = getPlayer(s, playerId);
  p.exiled = true;
  // Loyal players receive an exile objective; a betrayer keeps theirs.
  if (objectiveDef(p.objectiveId).kind === 'loyal' && s.exileDeck.length) {
    const i = s.exileDeck.indexOf(pick(s, s.exileDeck));
    p.objectiveId = s.exileDeck.splice(i, 1)[0];
  }
  // Survivors must leave the colony.
  for (const id of p.survivors) {
    const sv = s.survivors[id];
    if (sv.location !== 'colony') continue;
    const dest = safestOutsideLocation(s);
    if (dest) sv.location = dest;
    else sv.location = 'gas'; // every location full: squeeze in anyway (extremely rare)
    log(s, 'move', { playerId, survivorId: id, from: 'colony', to: sv.location, safe: true, exile: true });
  }
  // Their crisis contributions stay (already face down); they can no longer add more.
  log(s, 'exiled', { playerId });
}
