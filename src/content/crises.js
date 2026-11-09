// Crisis cards. `need`: matching items required (solo game).
// Matching cards count +1, others -1. fail/success are effect lists (see effects.js).

export const CRISES = [
  { id: 'whiteout', name: 'Whiteout', item: 'fuel', need: 1,
    text: 'The storm swallows the horizon. Keep the fires roaring or lose the night.',
    fail: [{ type: 'morale', delta: -1 }, { type: 'spawn', where: 'colony', n: 2 }] },
  { id: 'fever-ward', name: 'Fever Ward', item: 'medicine', need: 1,
    text: 'A cough moves through the bunks, one sleeper at a time.',
    fail: [{ type: 'morale', delta: -1 }, { type: 'helpless', delta: -2 }] },
  { id: 'empty-pantry', name: 'Empty Pantry', item: 'food', need: 1,
    text: 'Someone counted the cans twice. The number did not change.',
    fail: [{ type: 'morale', delta: -2 }] },
  { id: 'fence-collapse', name: 'Fence Collapse', item: 'tools', need: 1,
    text: 'Ice split the north posts. The whole east run is leaning.',
    fail: [{ type: 'spawn', where: 'colony', n: 3 }] },
  { id: 'howling-pack', name: 'The Howling Pack', item: 'weapon', need: 1,
    text: 'Something with too many voices circles the fence after dark.',
    fail: [{ type: 'spawn', where: 'colony', n: 2 }, { type: 'morale', delta: -1 }] },
  { id: 'frozen-pipes', name: 'Frozen Pipes', item: 'tools', need: 1,
    text: 'The latrine line burst. Nobody wants to talk about it.',
    fail: [{ type: 'waste', delta: 5 }, { type: 'morale', delta: -1 }] },
  { id: 'generator-cough', name: 'Generator Cough', item: 'fuel', need: 1,
    text: 'The old generator sputters. The freezer goes quiet.',
    fail: [{ type: 'morale', delta: -1 }, { type: 'food', delta: -2 }] },
  { id: 'raiders-at-gate', name: 'Raiders at the Gate', item: 'weapon', need: 1,
    text: 'Headlights on the ridge road. They want what you have.',
    fail: [{ type: 'food', delta: -3 }, { type: 'morale', delta: -1 }] },
  { id: 'sick-bay-overflow', name: 'Sick Bay Overflow', item: 'medicine', need: 1,
    text: 'Frost-blackened fingers, split lips, a fever that won\'t break.',
    fail: [{ type: 'morale', delta: -2 }] },
  { id: 'ration-riot', name: 'Ration Riot', item: 'food', need: 1,
    text: 'A shoving match at the food line turns into something worse.',
    fail: [{ type: 'morale', delta: -1 }, { type: 'waste', delta: 3 }, { type: 'helpless', delta: -1 }] },
];

export const CRISES_BY_ID = Object.fromEntries(CRISES.map((c) => [c.id, c]));
