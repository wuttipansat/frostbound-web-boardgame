// Shared enums and tunables for the FROSTBOUND rules engine.

export const PHASES = Object.freeze({
  DRAFT: 'draft',         // players choose 2 of their offered survivors
  CROSSROADS: 'crossroads', // a triggered crossroads card awaits the active player's choice
  TURN: 'turn',           // active player spends dice / takes free actions
  VOTE: 'vote',           // an exile vote is in progress
  COLONY: 'colony',       // transient while the colony phase resolves (never observed between actions)
  GAME_OVER: 'gameOver',
});

export const ITEM_TYPES = Object.freeze(['food', 'medicine', 'fuel', 'tools', 'weapon', 'junk']);

export const LOCATION_IDS = Object.freeze(['colony', 'police', 'grocery', 'school', 'hospital', 'library', 'gas']);
export const OUTSIDE_LOCATIONS = Object.freeze(LOCATION_IDS.filter((l) => l !== 'colony'));

// The exposure die: 12 faces.
export const EXPOSURE_FACES = Object.freeze([
  'blank', 'blank', 'blank', 'blank', 'blank', 'blank',
  'wound', 'wound', 'wound',
  'frostbite', 'frostbite',
  'bite',
]);

export const RULES = Object.freeze({
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 5,
  SURVIVORS_PER_PLAYER: 2,
  DRAFT_OPTIONS: 4,
  STARTING_HAND: 3,
  WOUNDS_TO_DIE: 3,
  WASTE_PER_MORALE: 10,
  CLEAN_AMOUNT: 3,
  VOTES_PER_PLAYER_PER_ROUND: 1,
  MAX_LOG: 300,
});
