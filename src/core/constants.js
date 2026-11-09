// Shared enums and tunables for the FROSTBOUND rules engine.

export const PHASES = Object.freeze({
  DRAFT: 'draft',         // players choose 2 of their offered survivors
  CROSSROADS: 'crossroads', // a triggered crossroads card awaits the active player's choice
  TURN: 'turn',           // active player spends dice / takes free actions
  VOTE: 'vote',           // an exile vote is in progress
  COLONY: 'colony',       // transient while the colony phase resolves (never observed between actions)
  GAME_OVER: 'gameOver',
});

export const ITEM_TYPES = Object.freeze(['food', 'medicine', 'fuel', 'tools', 'weapon', 'junk', 'survivor', 'book']);

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

// ---------------------------------------------------------------- step 23: Frostbound rules (energy + danger)
// 'classic' = action dice + exposure die (the original rules; also old saves and configs without `rules`).
// 'frostbound' = an energy pool per player, a shared danger deck, search deeper, a threat forecast.
export const RULESETS = Object.freeze(['frostbound', 'classic']);

export const ENERGY = Object.freeze({
  START: 100,
  MAX: 100,
  REGEN: 70,
  REGEN_STARVING: 50,     // the colony is starving
  MAX_HURT: 80,           // one of your survivors has 2+ wounds
  REGEN_FROST: -15,       // a "frost" danger card: next turn's regen is lower
  NIGHT: 4,               // even rounds: actions outside the colony cost more
  COST: Object.freeze({ move: 13, search: 23, attack: 17, barricade: 19, lure: 11, clean: 14 }),
  CROWDED: 7,             // 2+ zombies here: search / barricade cost more
  DANGEROUS: 7,           // hospital, police: search costs more (better loot)
  HEAVY: 5,               // attacking with the killTwo ability
  CARD: 20,               // gainDie / loseDie effects (crossroads, crises) are worth this much energy
  JUNK: 12,               // a junk card (was a reroll) gives this much energy per value
  ABILITY_REGEN: 15,      // the extraDie ability: +15 regen
});
export const DANGEROUS_LOCATIONS = Object.freeze(['hospital', 'police']);

export const DANGER_DECK = Object.freeze({ safe: 9, scratch: 4, frost: 3, startle: 2, surrounded: 1, bite: 1 });
export const DANGER_ESCALATION = Object.freeze({ 3: 'bite', 6: 'bite' }); // end of these rounds: add a card
