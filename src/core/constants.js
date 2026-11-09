// Shared enums and tunables for the FROSTBOUND rules engine.

export const PHASES = Object.freeze({
  DRAFT: 'draft',         // the player chooses their starting survivor(s)
  CROSSROADS: 'crossroads', // a triggered crossroads card awaits the player's choice
  TURN: 'turn',           // the player spends energy / takes free actions
  COLONY: 'colony',       // transient while the colony phase resolves (never observed between actions)
  GAME_OVER: 'gameOver',
});

export const ITEM_TYPES = Object.freeze(['food', 'medicine', 'fuel', 'tools', 'weapon', 'armor', 'junk', 'survivor', 'book']);

export const LOCATION_IDS = Object.freeze(['colony', 'police', 'grocery', 'school', 'hospital', 'library', 'gas']);
export const OUTSIDE_LOCATIONS = Object.freeze(LOCATION_IDS.filter((l) => l !== 'colony'));

export const RULES = Object.freeze({
  TEAM_START: 1,          // survivors picked at the start (solo game)
  DRAFT_OPTIONS: 3,
  STARTING_HAND: 3,
  WOUNDS_TO_DIE: 3,
  MAX_LOG: 300,
});

// ---------------------------------------------------------------- energy (no dice, no danger deck)
// Each survivor has a personal energy pool (survivor.energy = max, survivor.regen per turn); gear changes it.
export const ENERGY = Object.freeze({
  MAX: 100,               // hard ceiling for any pool
  STARVING: 20,           // the colony is starving: regen this much less
  HURT: 20,               // 2+ wounds: the pool's max is this much lower
  NIGHT: 4,               // even rounds: actions outside the colony cost more
  COST: Object.freeze({ move: 13, barricade: 19, lure: 11 }),
  ATTACK_BASE: 9,         // attack cost = 9 + 2 × the survivor's attack skill (2..6 → 13..21)
  SEARCH_BASE: 15,        // search cost = 15 + 2 × search skill (2..6 → 19..27)
  PER_SKILL: 2,
  CROWDED: 7,             // 2+ zombies here: search / barricade cost more
  DANGEROUS: 7,           // hospital, police: search costs more (better loot)
  HEAVY: 5,
  SKILLED: 5,             // roadRunner / sharpshooter / handy: that action costs this much less               // attacking with the killTwo ability
  CARD: 20,               // default size of an 'energy' effect (crossroads)
  JUNK: 12,               // a junk card (was a reroll) gives this much energy per value
});
export const DANGEROUS_LOCATIONS = Object.freeze(['hospital', 'police']);

