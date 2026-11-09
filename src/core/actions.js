// Action type constants and creators. An action is a plain JSON object { type, ...payload }.
// Solo game: there is one player, so actions carry no player id.
export const A = Object.freeze({
  DRAFT_PICK: 'DRAFT_PICK',
  RESOLVE_CROSSROADS: 'RESOLVE_CROSSROADS',
  ATTACK: 'ATTACK',
  SEARCH: 'SEARCH',
  BARRICADE: 'BARRICADE',
  LURE: 'LURE',
  MOVE: 'MOVE',
  PLAY_CARD: 'PLAY_CARD',
  CONTRIBUTE: 'CONTRIBUTE',
  DEPOSIT: 'DEPOSIT',
  USE_ABILITY: 'USE_ABILITY',
  END_TURN: 'END_TURN',
  RETURN_CARD: 'RETURN_CARD',
  EQUIP: 'EQUIP',
});

export const draftPick = (survivorIds) => ({ type: A.DRAFT_PICK, survivorIds });
export const resolveCrossroads = (choice) => ({ type: A.RESOLVE_CROSSROADS, choice });
export const attack = (survivorId) => ({ type: A.ATTACK, survivorId });
export const search = (survivorId) => ({ type: A.SEARCH, survivorId });
export const barricade = (survivorId) => ({ type: A.BARRICADE, survivorId });
export const lure = (survivorId, toLocation) => ({ type: A.LURE, survivorId, toLocation });
export const move = (survivorId, toLocation, fuelCardUid) => ({ type: A.MOVE, survivorId, toLocation, fuelCardUid });
/** Blueprint search: put one of the drawn cards back under the deck. */
export const returnCard = (cardUid) => ({ type: A.RETURN_CARD, cardUid });
export const playCard = (cardUid, opts = {}) => ({ type: A.PLAY_CARD, cardUid, ...opts });
export const contribute = (cardUid) => ({ type: A.CONTRIBUTE, cardUid });
export const deposit = (cardUid) => ({ type: A.DEPOSIT, cardUid });
export const useAbility = (survivorId, targetSurvivorId) => ({ type: A.USE_ABILITY, survivorId, targetSurvivorId });
export const endTurn = () => ({ type: A.END_TURN });
/** Equip a weapon / armor / book from the hand (free; the slot's old item returns to the hand). */
export const equip = (cardUid) => ({ type: A.EQUIP, cardUid });
