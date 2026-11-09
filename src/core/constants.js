// Shared enums and tunables for the FROSTBOUND rules engine.

export const PHASES = Object.freeze({
  DRAFT: 'draft',         // each player chooses 1 of their offered survivors
  CROSSROADS: 'crossroads', // a triggered crossroads card awaits the active player's choice
  TURN: 'turn',           // active player spends energy / takes free actions
  VOTE: 'vote',           // an exile vote is in progress
  COLONY: 'colony',       // transient while the colony phase resolves (never observed between actions)
  GAME_OVER: 'gameOver',
});

export const ITEM_TYPES = Object.freeze(['food', 'medicine', 'fuel', 'tools', 'weapon', 'armor', 'junk', 'survivor', 'book']);

export const LOCATION_IDS = Object.freeze(['colony', 'police', 'grocery', 'school', 'hospital', 'library', 'gas']);
export const OUTSIDE_LOCATIONS = Object.freeze(LOCATION_IDS.filter((l) => l !== 'colony'));

export const RULES = Object.freeze({
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 5,
  SURVIVORS_PER_PLAYER: 1,
  DRAFT_OPTIONS: 3,
  STARTING_HAND: 3,
  WOUNDS_TO_DIE: 3,
  WASTE_PER_MORALE: 10,
  CLEAN_AMOUNT: 3,
  VOTES_PER_PLAYER_PER_ROUND: 1,
  MAX_LOG: 300,
});

// ---------------------------------------------------------------- energy, danger deck (no dice anywhere)
// Each survivor has a personal energy pool (survivor.energy = max, survivor.regen per turn); gear changes it.
export const ENERGY = Object.freeze({
  MAX: 100,               // hard ceiling for any pool
  STARVING: 20,           // the colony is starving: regen this much less
  HURT: 20,               // 2+ wounds: the pool's max is this much lower
  REGEN_FROST: -15,       // a "frost" danger card: next turn's regen is lower
  NIGHT: 4,               // even rounds: actions outside the colony cost more
  COST: Object.freeze({ move: 13, barricade: 19, lure: 11, clean: 14 }),
  ATTACK_BASE: 9,         // attack cost = 9 + 2 × the survivor's attack skill (2..6 → 13..21)
  SEARCH_BASE: 15,        // search cost = 15 + 2 × search skill (2..6 → 19..27)
  PER_SKILL: 2,
  CROWDED: 7,             // 2+ zombies here: search / barricade cost more
  DANGEROUS: 7,           // hospital, police: search costs more (better loot)
  HEAVY: 5,               // attacking with the killTwo ability
  CARD: 20,               // default size of an 'energy' effect (crossroads)
  JUNK: 12,               // a junk card (was a reroll) gives this much energy per value
});
export const DANGEROUS_LOCATIONS = Object.freeze(['hospital', 'police']);

export const DANGER_DECK = Object.freeze({ safe: 9, scratch: 4, frost: 3, startle: 2, surrounded: 1, bite: 1 });
export const DANGER_ESCALATION = Object.freeze({ 3: 'bite', 6: 'bite' }); // end of these rounds: add a card
