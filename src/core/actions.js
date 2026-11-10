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
  NAP: 'NAP',
  GIVE: 'GIVE',
  CRAFT: 'CRAFT',
  BUILD: 'BUILD',
  SET_REST: 'SET_REST',
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
/** Equip a weapon / armor / book from the hand on a survivor (free; the slot's old item returns to the hand). */
export const equip = (cardUid, survivorId = null) => ({ type: A.EQUIP, cardUid, survivorId });
/** Nap at the colony: +25 AP +5 HP, but that survivor does nothing else today. */
export const nap = (survivorId) => ({ type: A.NAP, survivorId });
/** Tonight's plan for a survivor: 'sleep' (default) or 'guard' (at the colony; helps defend, wakes at 50%). */
export const setRest = (survivorId, mode) => ({ type: A.SET_REST, survivorId, mode });
/** Hand an item to a survivor at the same place (free); no survivor = into the stockpile at the colony. */
export const give = (cardUid, toSurvivorId = null) => ({ type: A.GIVE, cardUid, toSurvivorId });
/** Craft a recipe (content/items.js RECIPES) at the colony with stockpile materials and the survivor's AP. */
export const craft = (recipeId, survivorId) => ({ type: A.CRAFT, recipeId, survivorId });
/** Work on a base upgrade at the colony (materials when a level starts, then AP; progress carries over). */
export const build = (buildingId, survivorId) => ({ type: A.BUILD, buildingId, survivorId });

