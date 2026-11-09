// Shared enums and tunables for the FROSTBOUND rules engine.

export const PHASES = Object.freeze({
  DRAFT: 'draft',         // the player chooses their starting survivor(s)
  CROSSROADS: 'crossroads', // a triggered crossroads card awaits the player's choice
  TURN: 'turn',           // the player spends energy / takes free actions
  COLONY: 'colony',       // transient while the colony phase resolves (never observed between actions)
  GAME_OVER: 'gameOver',
});

export const ITEM_TYPES = Object.freeze(['food', 'medicine', 'fuel', 'tools', 'weapon', 'armor', 'junk', 'survivor', 'book']);

/** Parts of a day: dawn (crisis, crossroads) → day (your actions) → dusk (food, crisis) → night (zombies). */
export const TIMES = Object.freeze(['dawn', 'day', 'dusk', 'night']);
export const GAME_DAYS = 40;

export const LOCATION_IDS = Object.freeze(['colony', 'police', 'grocery', 'school', 'hospital', 'library', 'gas']);
export const OUTSIDE_LOCATIONS = Object.freeze(LOCATION_IDS.filter((l) => l !== 'colony'));

export const RULES = Object.freeze({
  TEAM_START: 2,          // survivors picked at the start (solo game)
  TEAM_MAX: 6,            // the most survivors the team can have
  DRAFT_OPTIONS: 6,
  STARTING_HAND: 3,        // items in the stockpile at the start
  PACK: 3,                // backpack slots per survivor
  WOUNDS_TO_DIE: 3,
  BEDS: 2,                // beds at the colony (the dorm adds more in Step 12)
  HP_MAX: 100,
  MAX_LOG: 300,
});

// ---------------------------------------------------------------- energy (no dice, no danger deck)
// Each survivor has their own AP (survivor.ap, max = the survivor's `energy`); sleep refills it at night.
export const ENERGY = Object.freeze({
  MAX: 100,               // hard ceiling for any pool
  STARVING: 20,           // the colony is starving: regen this much less
  HURT: 20,               // 2+ wounds: the pool's max is this much lower
  STORM: 4,               // storm days (every 3rd day): actions outside the colony cost more
  COST: Object.freeze({ move: 12, barricade: 19, lure: 11 }),
  WALK: Object.freeze([12, 17, 23]), // walking: near / mid / far
  SEARCH: 17,
  SEARCH_BASE: 15,        // search cost = 15 + 2 × search skill (2..6 → 19..27)
  PER_SKILL: 2,
  CROWDED: 7,             // 2+ zombies here: search / barricade cost more
  DANGEROUS: 7,           // hospital, police: search costs more (better loot)
  HEAVY: 5,
  SKILLED: 5,             // roadRunner / sharpshooter / handy: that action costs this much less               // attacking with the killTwo ability
  CARD: 20,               // default size of an 'energy' effect (crossroads)
  JUNK: 12,               // a junk card (was a reroll) gives this much energy per value
});
// ---------------------------------------------------------------- sleep (night) and naps
// Share of max AP refilled overnight, and HP healed. Guards stay awake (they help defend) and wake at 50%.
export const REST = Object.freeze({
  bed: Object.freeze({ ap: 1, hp: 15 }),
  floor: Object.freeze({ ap: 0.7, hp: 5 }),
  outside: Object.freeze({ ap: 0.4, hp: 0 }),
  guard: Object.freeze({ ap: 0.5, hp: 0 }),
  NAP_AP: 25,
  NAP_HP: 5,
});
// ---------------------------------------------------------------- fights (HP 100)
// Melee: one attack kills one zombie for sure; HP lost = ceil(max(0, ferocity − (AP left + ATK)) / 3) − armor.
// Guns: no HP lost, cost less AP, use 1 ammo, and the noise may draw a new zombie here.
export const FIGHT = Object.freeze({
  MELEE_AP: 15,
  GUN_AP: 10,
  WALKER: 110,
  BRUTE: 150,
  BRUTE_DAY: 21,
  ATK_PER_SKILL: 4,       // survivor ATK = (7 − attack skill) × 4 → 4..20
  LEAVE_HP: 5,            // leaving a place with zombies: HP per zombie
  NIGHT_BITE: 5,          // sleeping outside: HP per zombie there
});
// Distance rings from the colony (1 near … 3 far) and the chance a search makes a zombie appear.
export const RING = Object.freeze({ colony: 0, grocery: 1, school: 1, gas: 2, library: 2, police: 3, hospital: 3 });
export const SEARCH_SPAWN = Object.freeze({ grocery: 0.1, school: 0.15, library: 0.1, gas: 0.15, police: 0.25, hospital: 0.2, EXTRA: 0.1 });
export const DANGEROUS_LOCATIONS = Object.freeze(['hospital', 'police']);

