import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  cardNeeds, cardTargets, cardDice, lureTargets, moveTargets, actingSurvivors, unusedDice, shouldConfirmEndTurn,
} from '../src/ui/options.js';
import { whoMustHold, currentActor } from '../src/ui/seat.js';
import { ArtCache, artKey } from '../src/render/art.js';
import { itemModel, itemModelHD, ITEM_MODEL_IDS, TYPE_COLORS } from '../src/render/items3d.js';
import { ITEMS } from '../src/content/items.js';
import { reduce } from '../src/core/reducer.js';
import * as A from '../src/core/actions.js';
import { startedGame, setSurvivors, setDice, giveCard, patch } from './_helpers.js';

test('card play needs an explicit target: one entry per survivor, legal only where it applies', () => {
  let s = startedGame();
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, { 'corwin-daly': 'police', 'agnes-pell': 'colony' });
  s = patch(s, (x) => { x.survivors['agnes-pell'].wounds = 1; x.locations.police.zombies = 1; });
  let med; [s, med] = giveCard(s, pid, 'antibiotics');
  let gun; [s, gun] = giveCard(s, pid, 'riot-baton');
  let junk; [s, junk] = giveCard(s, pid, 'bedpan');
  let food; [s, food] = giveCard(s, pid, 'canned-beans');
  assert.equal(cardNeeds(s, med), 'survivor');
  assert.equal(cardNeeds(s, junk), 'die');
  assert.equal(cardNeeds(s, food), null);
  const medT = Object.fromEntries(cardTargets(s, pid, med).map((x) => [x.survivorId, x]));
  assert.equal(medT['agnes-pell'].ok, true, 'only the wounded survivor can be healed');
  assert.equal(medT['corwin-daly'].error, 'notWounded');
  const gunT = Object.fromEntries(cardTargets(s, pid, gun).map((x) => [x.survivorId, x]));
  assert.equal(gunT['corwin-daly'].ok, true);
  assert.equal(gunT['agnes-pell'].error, 'noZombiesHere');
  s = setDice(s, pid, [1, 4]);
  assert.deepEqual(cardDice(s, pid, junk).map((d) => d.value), [1, 4]);
  assert.ok(cardDice(s, pid, junk).every((d) => d.ok));
});

test('lure and move targets for the board highlights', () => {
  let s = startedGame();
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, { 'lio-fontaine': 'school' });
  s = setDice(s, pid, [3]);
  s = patch(s, (x) => { x.locations.school.zombies = 2; });
  const lure = lureTargets(s, pid, 'lio-fontaine');
  assert.equal(lure.length, 6);
  assert.ok(lure.every((l) => l.ok && l.to !== 'school'));
  // Hospital (3 slots) full of other survivors -> 'full'.
  s = patch(s, (x) => {
    for (const id of ['agnes-pell', 'rafael-quist', 'greta-vos']) x.survivors[id] = { id, owner: x.players[1].id, location: 'hospital', wounds: 0, frostbite: false, alive: true, moved: false };
  });
  const mt = moveTargets(s, pid, 'lio-fontaine');
  assert.equal(mt.hospital, 'full');
  assert.equal(mt.colony, 'ok');
  assert.equal(mt.school, undefined, 'no entry for where it already stands');
});

test('acting survivors, unused dice and the end-turn confirmation', () => {
  let s = startedGame();
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, { 'corwin-daly': 'colony' });
  s = setDice(s, pid, [2, 5]);
  assert.deepEqual(actingSurvivors(s, pid), ['corwin-daly']);
  assert.equal(unusedDice(s, pid), 2);
  assert.equal(shouldConfirmEndTurn(s, pid), true);
  assert.equal(shouldConfirmEndTurn(s, pid, { skip: true }), false);
  s = patch(s, (x) => { x.players.find((p) => p.id === pid).dice.forEach((d) => { d.used = true; }); x.survivors['corwin-daly'].moved = true; });
  assert.equal(shouldConfirmEndTurn(s, pid), false);
  assert.deepEqual(actingSurvivors(s, pid), []);
});

test('hot seat: an item request to another human hands them the device, then back', () => {
  let s = startedGame({ players: 3 });
  s = patch(s, (x) => { x.players[2].isAI = true; x.activePlayerId = 'p0'; });
  assert.equal(currentActor(s), 'p0');
  assert.equal(whoMustHold(s, { seat: 'p0' }), null);
  assert.equal(whoMustHold(s, { seat: 'p1' }), 'p0', 'pass to the active player');
  s = reduce(s, A.requestItem('p0', 'p1', null));
  assert.equal(whoMustHold(s, { seat: 'p0' }), 'p1', 'the asked human must answer now');
  s = reduce(s, A.respondRequest('p1', s.requests[0].id, null));
  assert.equal(whoMustHold(s, { seat: 'p1' }), 'p0', 'and the device goes back');
  // A request to an AI never needs a hand-over.
  s = reduce(s, A.requestItem('p0', 'p2', null));
  assert.equal(whoMustHold(s, { seat: 'p0' }), null);
});

test('art cache renders each key once, queues lazily and keeps timing stats', () => {
  let t = 0;
  const calls = [];
  const cache = new ArtCache((spec) => { calls.push(artKey(spec)); t += 3; return `url:${spec.id}`; }, { now: () => t });
  const spec = { kind: 'survivor', id: 'maren-holt', size: 's', tier: 'medium' };
  assert.equal(cache.get(spec), null, 'first request queues');
  assert.equal(cache.get(spec), null, 'second request while pending does not queue again');
  assert.equal(cache.queue.length, 1);
  const ready = [];
  cache.onReady((k) => ready.push(k));
  assert.equal(cache.pump(), true);
  assert.equal(cache.get(spec), 'url:maren-holt');
  assert.equal(cache.get({ ...spec, size: 'l' }), null, 'different size is a different image');
  cache.pump();
  assert.equal(cache.pump(), false);
  assert.equal(calls.length, 2);
  assert.deepEqual(ready, [artKey(spec), artKey({ ...spec, size: 'l' })]);
  assert.equal(cache.stats.rendered, 2);
  assert.equal(cache.stats.totalMs, 6);
});

test('every item has a voxel model; types share a colour language', () => {
  assert.deepEqual([...ITEM_MODEL_IDS].sort(), Object.keys(ITEMS).sort());
  const shapes = new Set();
  for (const [id, def] of Object.entries(ITEMS)) {
    const lo = itemModel(id);
    const hd = itemModelHD(id);
    const { min, max } = hd.bounds();
    assert.ok(Math.max(...max.map((v, i) => v - min[i])) <= 18, `${id} is small`);
    assert.ok(hd.voxels.size > lo.voxels.size * 3, `${id} HD has more detail`);
    const palette = Object.values(TYPE_COLORS[def.type]);
    assert.ok([...lo.voxels.values()].some((v) => palette.includes(v.color)) || def.type === 'weapon' || id === 'hockey-stick',
      `${id} uses its type colours`);
    shapes.add([...lo.voxels.keys()].sort().join('|'));
  }
  assert.equal(shapes.size, Object.keys(ITEMS).length, 'every item looks different');
});

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
}

test('no emoji or die glyphs are used as graphics in the UI code, and no title= tooltips remain', () => {
  const files = [...walk('src/ui').filter((f) => f.endsWith('.js')), 'src/main.js'];
  const pictographic = /\p{Extended_Pictographic}|[⚀-⚅]/u;
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const lines = src.split('\n').filter((l) => pictographic.test(l) && !l.trim().startsWith('//'));
    assert.deepEqual(lines, [], `${f} still draws emoji/glyphs`);
    assert.ok(!/\btitle:\s/.test(src), `${f} still uses title= tooltips (use data-tip)`);
  }
});
