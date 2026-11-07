// Main objective scenarios.
// goal.type is evaluated by src/core/rules/flow.js#checkScenarioGoal.

export const SCENARIOS = [
  {
    id: 'beacon', difficulty: 'easy', length: 'short',
    name: 'Light the Ridge Beacon',
    text: 'A rescue convoy will pass the ridge only if it sees fire. Bring fuel to the colony and stack the beacon before time runs out.',
    rounds: 5, morale: 8, helpless: 2, startFood: 3,
    goal: { type: 'deposit', item: 'fuel', base: 3, perPlayer: 1 },
    goalText: 'Deposit fuel cards in the colony beacon: 3 + 1 per player.',
  },
  {
    id: 'stores', difficulty: 'medium', length: 'medium',
    name: 'Fill the Root Cellar',
    text: 'The deep freeze is coming. Stockpile enough food to outlast it and keep the gates clear.',
    rounds: 7, morale: 7, helpless: 3, startFood: 2,
    goal: { type: 'stockpile', foodBase: 4, foodPerPlayer: 2, maxColonyZombies: 3 },
    goalText: 'After a colony phase, have food >= 4 + 2 per player with at most 3 zombies at the colony.',
  },
  {
    id: 'purge', difficulty: 'hard', length: 'long',
    name: 'Clear the Drift',
    text: 'The horde sleeps under the snow. Thin it out before the spring melt wakes it all at once.',
    rounds: 9, morale: 6, helpless: 3, startFood: 2,
    goal: { type: 'kills', base: 6, perPlayer: 3 },
    goalText: 'Kill 6 + 3 per player zombies in total.',
  },
];

export const SCENARIOS_BY_ID = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));
