// Main objective scenarios.
// goal.type is evaluated by src/core/rules/flow.js#checkScenarioGoal.

export const SCENARIOS = [
  {
    id: 'crawler', difficulty: 'medium', length: 'long',
    name: 'Build the Snow Crawler',
    text: 'An old snow crawler sits in the colony yard. Rebuild it in four stages and drive everyone south before day 40.',
    days: 40, morale: 8, startFood: 3,
    goal: { type: 'crawler', target: 4 },
    goalText: 'Finish all 4 stages of the snow crawler: frame, engine, heater, fuel.',
  },
  {
    id: 'beacon', difficulty: 'easy', length: 'short',
    name: 'Light the Ridge Beacon',
    text: 'A rescue convoy will pass the ridge only if it sees fire. Bring fuel to the colony and stack the beacon before time runs out.',
    days: 40, morale: 8, startFood: 3,
    goal: { type: 'deposit', item: 'fuel', target: 8 },
    goalText: 'Deposit 8 fuel cards in the colony beacon.',
  },
  {
    id: 'stores', difficulty: 'medium', length: 'medium',
    name: 'Fill the Root Cellar',
    text: 'The deep freeze is coming. Stockpile enough food to outlast it and keep the gates clear.',
    days: 40, morale: 7, startFood: 2,
    goal: { type: 'stockpile', target: 12, maxColonyZombies: 3 },
    goalText: 'After a colony phase, have at least 12 food with at most 3 zombies at the colony.',
  },
  {
    id: 'purge', difficulty: 'hard', length: 'long',
    name: 'Clear the Drift',
    text: 'The horde sleeps under the snow. Thin it out before the spring melt wakes it all at once.',
    days: 40, morale: 6, startFood: 2,
    goal: { type: 'kills', target: 25 },
    goalText: 'Kill 25 zombies in total.',
  },
];

export const SCENARIOS_BY_ID = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));
