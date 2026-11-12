// reduce(state, action) -> nextState. Never mutates its input.
import { PHASES } from './constants.js';
import { A } from './actions.js';
import { RuleError, assert } from './errors.js';
import * as turn from './rules/turn.js';
import { activeSets } from './selectors.js';
import { log } from './rules/helpers.js';
import { draftPick, resolveCrossroads, checkImmediateEnd } from './rules/flow.js';

const HANDLERS = {
  [A.DRAFT_PICK]: draftPick,
  [A.RESOLVE_CROSSROADS]: resolveCrossroads,
  [A.ATTACK]: turn.attack,
  [A.SEARCH]: turn.search,
  [A.BARRICADE]: turn.barricade,
  [A.LURE]: turn.lure,
  [A.MOVE]: turn.move,
  [A.PLAY_CARD]: turn.playCard,
  [A.CONTRIBUTE]: turn.contribute,
  [A.DEPOSIT]: turn.deposit,
  [A.USE_ABILITY]: turn.useAbility,
  [A.END_TURN]: turn.finishTurn,
  [A.RETURN_CARD]: turn.returnCard,
  [A.EQUIP]: turn.equip,
  [A.NAP]: turn.nap,
  [A.GIVE]: turn.give,
  [A.CRAFT]: turn.craft,
  [A.BUILD]: turn.build,
  [A.SET_REST]: turn.setRest,
};

export function reduce(state, action) {
  assert(state.phase !== PHASES.GAME_OVER, 'gameOver');
  const handler = HANDLERS[action?.type];
  assert(handler, 'unknownAction', action?.type);
  const s = structuredClone(state);
  const fullBefore = fullSets(s);
  handler(s, action);
  // GAME-1: say when a survivor completes a set.
  for (const [svId, ids] of Object.entries(fullSets(s))) for (const id of ids) if (!fullBefore[svId]?.includes(id)) log(s, 'setComplete', { survivorId: svId, setId: id });
  checkImmediateEnd(s);
  return s;
}

function fullSets(s) {
  const out = {};
  for (const id of s.team?.survivors ?? []) if (s.survivors[id]?.alive) out[id] = activeSets(s, id).filter((x) => x.full).map((x) => x.id);
  return out;
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
