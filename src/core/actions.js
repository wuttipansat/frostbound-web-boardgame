// Action type constants and creators. An action is a plain JSON object { type, ...payload }.
export const A = Object.freeze({
  DRAFT_PICK: 'DRAFT_PICK',
  RESOLVE_CROSSROADS: 'RESOLVE_CROSSROADS',
  ATTACK: 'ATTACK',
  SEARCH: 'SEARCH',
  BARRICADE: 'BARRICADE',
  CLEAN: 'CLEAN',
  LURE: 'LURE',
  MOVE: 'MOVE',
  PLAY_CARD: 'PLAY_CARD',
  CONTRIBUTE: 'CONTRIBUTE',
  DEPOSIT: 'DEPOSIT',
  USE_ABILITY: 'USE_ABILITY',
  END_TURN: 'END_TURN',
  REQUEST_ITEM: 'REQUEST_ITEM',
  RESPOND_REQUEST: 'RESPOND_REQUEST',
  CALL_VOTE: 'CALL_VOTE',
  CAST_VOTE: 'CAST_VOTE',
  RETURN_CARD: 'RETURN_CARD',
});

export const draftPick = (playerId, survivorIds) => ({ type: A.DRAFT_PICK, playerId, survivorIds });
export const resolveCrossroads = (playerId, choice) => ({ type: A.RESOLVE_CROSSROADS, playerId, choice });
export const attack = (playerId, survivorId, dieIndex) => ({ type: A.ATTACK, playerId, survivorId, dieIndex });
export const search = (playerId, survivorId, dieIndex) => ({ type: A.SEARCH, playerId, survivorId, dieIndex });
export const barricade = (playerId, survivorId, dieIndex) => ({ type: A.BARRICADE, playerId, survivorId, dieIndex });
export const clean = (playerId, survivorId, dieIndex) => ({ type: A.CLEAN, playerId, survivorId, dieIndex });
export const lure = (playerId, survivorId, dieIndex, toLocation) => ({ type: A.LURE, playerId, survivorId, dieIndex, toLocation });
export const move = (playerId, survivorId, toLocation, fuelCardUid) => ({ type: A.MOVE, playerId, survivorId, toLocation, fuelCardUid });
/** Blueprint search: put one of the drawn cards back under the deck. */
export const returnCard = (playerId, cardUid) => ({ type: A.RETURN_CARD, playerId, cardUid });
export const playCard = (playerId, cardUid, opts = {}) => ({ type: A.PLAY_CARD, playerId, cardUid, ...opts });
export const contribute = (playerId, cardUid) => ({ type: A.CONTRIBUTE, playerId, cardUid });
export const deposit = (playerId, cardUid) => ({ type: A.DEPOSIT, playerId, cardUid });
export const useAbility = (playerId, survivorId, targetSurvivorId) => ({ type: A.USE_ABILITY, playerId, survivorId, targetSurvivorId });
export const endTurn = (playerId) => ({ type: A.END_TURN, playerId });
export const requestItem = (playerId, targetId, itemType = null) => ({ type: A.REQUEST_ITEM, playerId, targetId, itemType });
export const respondRequest = (playerId, requestId, cardUid = null) => ({ type: A.RESPOND_REQUEST, playerId, requestId, cardUid });
export const callVote = (playerId, targetId) => ({ type: A.CALL_VOTE, playerId, targetId });
export const castVote = (playerId, yes) => ({ type: A.CAST_VOTE, playerId, yes });
