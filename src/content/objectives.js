// Secret objectives. `condition` uses the predicate language in src/core/rules/conditions.js
// (evaluated against the owning player at game end).
//
// kind 'loyal'    -> wins if the main objective is completed AND condition holds.
// kind 'betrayer' -> wins if the colony FALLS (morale 0 or time runs out) AND condition holds.
// kind 'exile'    -> dealt to a loyal player when exiled; wins if main objective completed AND condition holds.

export const SECRET_OBJECTIVES = [
  { id: 'medics-oath', kind: 'loyal', name: 'The Medic\'s Oath',
    text: 'Hold at least 2 medicine cards when the game ends.',
    condition: { type: 'handHas', item: 'medicine', count: 2 } },
  { id: 'keep-lights-on', kind: 'loyal', name: 'Keep the Lights On',
    text: 'Hold at least 2 fuel cards when the game ends.',
    condition: { type: 'handHas', item: 'fuel', count: 2 } },
  { id: 'nobody-left-behind', kind: 'loyal', name: 'Nobody Left Behind',
    text: 'At least 3 helpless survivors remain in the colony when the game ends.',
    condition: { type: 'helplessAtLeast', n: 3 } },
  { id: 'pack-rat', kind: 'loyal', name: 'Pack Rat',
    text: 'Hold at least 4 cards of any kind when the game ends.',
    condition: { type: 'handSizeAtLeast', n: 4 } },
  { id: 'armed-escort', kind: 'loyal', name: 'Armed Escort',
    text: 'Hold a weapon and a tools card when the game ends.',
    condition: { type: 'handHasEach', items: ['weapon', 'tools'] } },
  { id: 'clean-hands', kind: 'loyal', name: 'Not a Scratch',
    text: 'Control at least 2 survivors and none of them is wounded or frostbitten.',
    condition: { type: 'all', of: [{ type: 'survivorsAlive', min: 2 }, { type: 'noWoundedSurvivors' }] } },
  { id: 'exterminator', kind: 'loyal', name: 'Exterminator',
    text: 'Your survivors killed at least 4 zombies this game.',
    condition: { type: 'killsAtLeast', n: 4 } },
  { id: 'full-bellies', kind: 'loyal', name: 'Full Bellies',
    text: 'Hold at least 2 food cards when the game ends.',
    condition: { type: 'handHas', item: 'food', count: 2 } },

  { id: 'hollow-crown', kind: 'betrayer', name: 'BETRAYER: The Hollow Crown',
    text: 'The colony must fall. You win if, when it does, you control at least 2 survivors.',
    condition: { type: 'survivorsAlive', min: 2 } },
  { id: 'winter-hoard', kind: 'betrayer', name: 'BETRAYER: Winter Hoard',
    text: 'The colony must fall. You win if, when it does, you hold 2 food and 1 fuel.',
    condition: { type: 'all', of: [{ type: 'handHas', item: 'food', count: 2 }, { type: 'handHas', item: 'fuel', count: 1 }] } },
];

export const EXILE_OBJECTIVES = [
  { id: 'lone-wolf', kind: 'exile', name: 'EXILE: Lone Wolf',
    text: 'Keep at least 1 survivor alive and kill at least 3 zombies in total.',
    condition: { type: 'all', of: [{ type: 'survivorsAlive', min: 1 }, { type: 'killsAtLeast', n: 3 }] } },
  { id: 'hermits-cache', kind: 'exile', name: 'EXILE: Hermit\'s Cache',
    text: 'Hold 2 food and 1 medicine when the game ends.',
    condition: { type: 'all', of: [{ type: 'handHas', item: 'food', count: 2 }, { type: 'handHas', item: 'medicine', count: 1 }] } },
  { id: 'hunters-due', kind: 'exile', name: 'EXILE: Hunter\'s Due',
    text: 'Your survivors killed at least 5 zombies this game.',
    condition: { type: 'killsAtLeast', n: 5 } },
];

export const ALL_OBJECTIVES = Object.fromEntries(
  [...SECRET_OBJECTIVES, ...EXILE_OBJECTIVES].map((o) => [o.id, o]),
);
