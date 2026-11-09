// reduce(state, action) -> nextState. Never mutates its input.
import { PHASES } from './constants.js';
import { A } from './actions.js';
import { RuleError, assert } from './errors.js';
import * as turn from './rules/turn.js';
import { draftPick, resolveCrossroads, checkImmediateEnd } from './rules/flow.js';

const HANDLERS = {
  [A.DRAFT_PICK]: draftPick,
  [A.RESOLVE_CROSSROADS]: resolveCrossroads,
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
  [A.RETURN_CARD]: turn.returnCard,
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
