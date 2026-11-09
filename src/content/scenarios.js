// Main objective scenarios.
// goal.type is evaluated by src/core/rules/flow.js#checkScenarioGoal.

export const SCENARIOS = [
  {
    id: 'beacon', difficulty: 'easy', length: 'short',
    name: 'Light the Ridge Beacon',
    text: 'A rescue convoy will pass the ridge only if it sees fire. Bring fuel to the colony and stack the beacon before time runs out.',
    rounds: 6, morale: 8, helpless: 2, startFood: 3,
    goal: { type: 'deposit', item: 'fuel', target: 2 },
    goalText: 'Deposit 2 fuel cards in the colony beacon.',
  },
  {
    id: 'stores', difficulty: 'medium', length: 'medium',
    name: 'Fill the Root Cellar',
    text: 'The deep freeze is coming. Stockpile enough food to outlast it and keep the gates clear.',
    rounds: 7, morale: 7, helpless: 3, startFood: 2,
    goal: { type: 'stockpile', target: 6, maxColonyZombies: 3 },
    goalText: 'After a colony phase, have at least 6 food with at most 3 zombies at the colony.',
  },
  {
    id: 'purge', difficulty: 'hard', length: 'long',
    name: 'Clear the Drift',
    text: 'The horde sleeps under the snow. Thin it out before the spring melt wakes it all at once.',
    rounds: 9, morale: 6, helpless: 3, startFood: 2,
    goal: { type: 'kills', target: 6 },
    goalText: 'Kill 6 zombies in total.',
  },
];

export const SCENARIOS_BY_ID = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));
