import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SURVIVORS } from '../src/content/survivors.js';
import { SCENARIOS } from '../src/content/scenarios.js';
import { CRISES } from '../src/content/crises.js';
import { CROSSROADS } from '../src/content/crossroads.js';
import { ITEMS } from '../src/content/items.js';
import { LOCATIONS } from '../src/content/locations.js';
import { ITEM_TYPES, LOCATION_IDS } from '../src/core/constants.js';
import { CONDITION_TYPES } from '../src/core/rules/conditions.js';
import { EFFECT_TYPES } from '../src/core/rules/effects.js';

const unique = (arr) => new Set(arr).size === arr.length;

test('content counts match the design brief', () => {
  assert.equal(SURVIVORS.length, 20);
  assert.equal(SCENARIOS.length, 3);
  assert.equal(CRISES.length, 10);
  assert.equal(CROSSROADS.length, 30);
});

test('ids and names are unique', () => {
  for (const list of [SURVIVORS, SCENARIOS, CRISES, CROSSROADS]) {
    assert.ok(unique(list.map((x) => x.id)));
  }
  assert.ok(unique(SURVIVORS.map((s) => s.name)));
  assert.ok(unique(SURVIVORS.map((s) => s.influence)), 'influence must be unique for tie-breaks');
});

test('survivor stats are sane', () => {
  for (const s of SURVIVORS) {
    for (const k of ['attack', 'search']) assert.ok(s[k] >= 1 && s[k] <= 6, `${s.id}.${k}`);
    assert.ok(s.ability?.type && s.abilityText && s.occupation && s.accent);
  }
});

test('every location deck references valid items and every item type is findable', () => {
  const seen = new Set();
  for (const id of LOCATION_IDS) {
    const deck = LOCATIONS[id].deck;
    if (id === 'colony') { assert.equal(deck, null); continue; }
    for (const itemId of Object.keys(deck)) {
      assert.ok(ITEMS[itemId], `${id} -> ${itemId}`);
      seen.add(ITEMS[itemId].type);
    }
  }
  for (const t of ITEM_TYPES) assert.ok(seen.has(t), t);
  for (const item of Object.values(ITEMS)) assert.ok(ITEM_TYPES.includes(item.type));
});

function walkConditions(cond, visit) {
  visit(cond);
  if (cond.of) cond.of.forEach((c) => walkConditions(c, visit));
}

test('all crossroads have known triggers, two choices and known effects', () => {
  for (const c of CROSSROADS) {
    walkConditions(c.trigger, (x) => assert.ok(CONDITION_TYPES.includes(x.type), `${c.id}: ${x.type}`));
    if (c.trigger.location) assert.ok(LOCATION_IDS.includes(c.trigger.location));
    assert.equal(c.choices.length, 2);
    for (const ch of c.choices) {
      assert.ok(ch.label);
      for (const e of ch.effects) assert.ok(EFFECT_TYPES.includes(e.type), `${c.id}: ${e.type}`);
    }
  }
});

test('crises and scenarios reference known types', () => {
  for (const c of CRISES) {
    assert.ok(ITEM_TYPES.includes(c.item));
    for (const e of c.fail) assert.ok(EFFECT_TYPES.includes(e.type));
  }
  for (const sc of SCENARIOS) assert.ok(sc.goal.target > 0, `${sc.id}: a fixed solo target`);
  for (const sc of SCENARIOS) assert.equal(sc.days, 40, `${sc.id}: a 40-day winter`);
});
