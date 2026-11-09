// reduce(state, action) -> nextState. Never mutates its input.
import { PHASES, RULES } from './constants.js';
import { A } from './actions.js';
import { RuleError, assert } from './errors.js';
import { getPlayer } from './selectors.js';
import * as turn from './rules/turn.js';
import * as social from './rules/social.js';
import { finishDraft, checkImmediateEnd } from './rules/flow.js';

function draftPick(s, { playerId, survivorIds }) {
  assert(s.phase === PHASES.DRAFT, 'wrongPhase', s.phase);
  const p = getPlayer(s, playerId);
  assert(p, 'badPlayer');
  assert(!p.drafted, 'alreadyDrafted');
  assert(Array.isArray(survivorIds) && survivorIds.length === RULES.SURVIVORS_PER_PLAYER
    && new Set(survivorIds).size === survivorIds.length, 'badDraft');
  assert(survivorIds.every((id) => p.draftOptions.includes(id)), 'notInDraftOptions');
  p.survivors = survivorIds.slice();
  p.drafted = true;
  if (s.players.every((pl) => pl.drafted)) finishDraft(s);
}

const HANDLERS = {
  [A.DRAFT_PICK]: draftPick,
  [A.RESOLVE_CROSSROADS]: social.resolveCrossroads,
  [A.ATTACK]: turn.attack,
  [A.SEARCH]: turn.search,
  [A.BARRICADE]: turn.barricade,
  [A.CLEAN]: turn.clean,
  [A.LURE]: turn.lure,
  [A.MOVE]: turn.move,
  [A.PLAY_CARD]: turn.playCard,
  [A.CONTRIBUTE]: turn.contribute,
  [A.DEPOSIT]: turn.deposit,
  [A.USE_ABILITY]: turn.useAbility,
  [A.END_TURN]: turn.finishTurn,
  [A.REQUEST_ITEM]: social.requestItem,
  [A.RESPOND_REQUEST]: social.respondRequest,
  [A.CALL_VOTE]: social.callVote,
  [A.CAST_VOTE]: social.castVote,
  [A.RETURN_CARD]: turn.returnCard,
  [A.SEARCH_DEEPER]: turn.searchDeeper,
  [A.EQUIP]: turn.equip,
};

export function reduce(state, action) {
  assert(state.phase !== PHASES.GAME_OVER, 'gameOver');
  const handler = HANDLERS[action?.type];
  assert(handler, 'unknownAction', action?.type);
  const s = structuredClone(state);
  handler(s, action);
  checkImmediateEnd(s);
  return s;
}

/** Like reduce, but returns { ok, state, error } instead of throwing on illegal actions. */
export function tryReduce(state, action) {
  try {
    return { ok: true, state: reduce(state, action), error: null };
  } catch (e) {
    if (e instanceof RuleError) return { ok: false, state, error: e.code, message: e.message };
    throw e;
  }
}

/** Serialize for localStorage / network. */
export const serialize = (state) => JSON.stringify(state);
export const deserialize = (json) => JSON.parse(json);
