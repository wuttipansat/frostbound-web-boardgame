// GODOT-0: the data export is plain JSON that matches the JS content, and golden replays replay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportData } from '../scripts/export-data.mjs';
import { LOCATIONS } from '../src/content/locations.js';
import { ITEMS, RECIPES } from '../src/content/items.js';
import { CROSSROADS } from '../src/content/crossroads.js';
import { RULES, ENERGY } from '../src/core/constants.js';
import { createGame } from '../src/core/state.js';
import { reduce } from '../src/core/reducer.js';
import { stateHash } from '../src/core/hash.js';

test('every exported file parses; counts match; a golden game replays to the same hashes', async () => {
  const { files } = await exportData({ golden: 1, write: false });
  for (const [f, d] of Object.entries(files)) if (typeof d !== 'string') JSON.parse(JSON.stringify(d), (k, v) => { assert.notEqual(typeof v, 'function', f); return v; });
  const n = (o) => Object.keys(o).length;
  assert.equal(n(files['locations.json'].LOCATIONS), n(LOCATIONS));
  assert.equal(n(files['items.json'].ITEMS), n(ITEMS));
  assert.equal(n(files['items.json'].RECIPES), n(RECIPES));
  assert.equal(files['crossroads.json'].CROSSROADS.length, CROSSROADS.length);
  assert.deepEqual(files['constants.json'].RULES, { ...RULES });
  assert.equal(files['constants.json'].ENERGY.SEARCH, ENERGY.SEARCH);
  assert.ok(files['i18n/th.json'].content.locations.colony.name);
  const g = files['golden/1.json'];
  assert.ok(g.steps.length > 100);
  let s = createGame({ scenarioId: g.scenarioId, seed: g.seed, difficulty: g.difficulty, days: 40 });
  assert.equal(stateHash(s), g.start);
  for (const st of g.steps.slice(0, 200)) { s = reduce(s, st.action); assert.equal(stateHash(s), st.hash); }
});
