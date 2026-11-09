// Main objective scenarios.
// goal.type is evaluated by src/core/rules/flow.js#checkScenarioGoal.

export const SCENARIOS = [
  {
    id: 'beacon', difficulty: 'easy', length: 'short',
    name: 'Light the Ridge Beacon',
    text: 'A rescue convoy will pass the ridge only if it sees fire. Bring fuel to the colony and stack the beacon before time runs out.',
    days: 40, morale: 8, helpless: 2, startFood: 3,
    goal: { type: 'deposit', item: 'fuel', target: 8 },
    goalText: 'Deposit 8 fuel cards in the colony beacon.',
  },
  {
    id: 'stores', difficulty: 'medium', length: 'medium',
    name: 'Fill the Root Cellar',
    text: 'The deep freeze is coming. Stockpile enough food to outlast it and keep the gates clear.',
    days: 40, morale: 7, helpless: 3, startFood: 2,
    goal: { type: 'stockpile', target: 12, maxColonyZombies: 3 },
    goalText: 'After a colony phase, have at least 12 food with at most 3 zombies at the colony.',
  },
  {
    id: 'purge', difficulty: 'hard', length: 'long',
    name: 'Clear the Drift',
    text: 'The horde sleeps under the snow. Thin it out before the spring melt wakes it all at once.',
    days: 40, morale: 6, helpless: 3, startFood: 2,
    goal: { type: 'kills', target: 25 },
    goalText: 'Kill 25 zombies in total.',
  },
];

export const SCENARIOS_BY_ID = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));
