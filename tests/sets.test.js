// GAME-1: item sets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startedGame, setSurvivors } from './_helpers.js';
import { reduce } from '../src/core/reducer.js';
import * as act from '../src/core/actions.js';
import { activeSets, setBonus, atkOf, actionCost, packSize, fightPreview } from '../src/core/selectors.js';
import { SETS, SET_OF, SET_CAPS } from '../src/content/sets.js';
import { ITEMS } from '../src/content/items.js';
import { LOCATIONS } from '../src/content/locations.js';

let n = 0;
const carry = (s, survivorId, ...ids) => { for (const id of ids) { const uid = `t${n++}`; s.cards[uid] = id; s.survivors[survivorId].pack.push(uid); } return s; };
const game = () => setSurvivors(startedGame(), { 'maren-holt': 'grocery' });
const SV = 'maren-holt';

test('sets: 6–15 sets of 2–4 known items, each item in one set, every piece findable somewhere', () => {
  assert.ok(SETS.length >= 6 && SETS.length <= 15);
  const seen = new Set();
  for (const x of SETS) {
    assert.ok(x.items.length >= 2 && x.items.length <= 4, x.id);
    for (const i of x.items) { assert.ok(ITEMS[i], i); assert.ok(!seen.has(i), `${i} twice`); seen.add(i); assert.equal(SET_OF[i], x.id);
      assert.ok(Object.values(LOCATIONS).some((l) => l.deck?.[i]), `${i} is in some deck`); }
  }
});

test('sets: backpack and worn gear count, duplicates once, 2 pieces = bonus2, full = both', () => {
  let s = carry(game(), SV, 'riot-baton');
  assert.equal(activeSets(s, SV).length, 0);
  const atk0 = atkOf(s, SV);
  s = carry(s, SV, 'riot-vest', 'riot-vest');
  assert.deepEqual(activeSets(s, SV).map((a) => [a.id, a.have, a.full]), [['police', 2, false]]);
  assert.equal(atkOf(s, SV), atk0 + 3);
  // Equip the vest (worn still counts) and add the gun: the full set.
  const vest = s.survivors[SV].pack.find((u) => s.cards[u] === 'riot-vest');
  s = reduce(s, act.equip(vest, SV));
  const bar0 = actionCost(s, SV, 'barricade');
  s = carry(s, SV, 'glock-19');
  assert.equal(activeSets(s, SV)[0].full, true);
  assert.equal(actionCost(s, SV, 'barricade'), Math.max(1, bar0 - 3));
  assert.equal(setBonus(s, SV).hpSaved, 1);
});

test('sets: bonuses are capped and vanish when a piece leaves the survivor', () => {
  let s = game();
  for (const x of SETS) carry(s, SV, ...x.items);
  const b = setBonus(s, SV);
  for (const [k, cap] of Object.entries(SET_CAPS)) assert.ok(cap < 0 ? b[k] >= cap : b[k] <= cap, k);
  assert.ok(packSize(s, SV) <= 3 + SET_CAPS.pack + 3);
  s = game(); carry(s, SV, 'fire-axe', 'jerry-can');
  const hp1 = fightPreview(s, SV).hp;
  s.survivors[SV].pack = s.survivors[SV].pack.filter((u) => s.cards[u] !== 'jerry-can');
  assert.equal(setBonus(s, SV).atk, 0);
  assert.ok(fightPreview(s, SV).hp >= hp1);
});

test('sets: completing a set is logged', () => {
  let s = carry(game(), SV, 'hunting-bow');
  const before = s.log.length;
  const uid = 'tbow2'; s.cards[uid] = 'snow-suit'; s.survivors[SV].pack.push(uid);
  s.survivors[SV].pack.splice(s.survivors[SV].pack.indexOf(uid), 1); s.stockpile.push(uid);
  s.survivors[SV].location = 'colony';
  s = reduce(s, act.equip(uid, SV));
  assert.ok(s.log.slice(before).some((e) => e.k === 'setComplete' && e.setId === 'hunter'));
});
