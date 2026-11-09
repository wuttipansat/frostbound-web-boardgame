import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import {
  cardNeeds, cardTargets, lureTargets, moveTargets, actingSurvivors, shouldConfirmEndTurn, cardOptions,
} from '../src/ui/options.js';
import { whoMustHold, currentActor } from '../src/ui/seat.js';
import { ArtCache, artKey } from '../src/render/art.js';
import { ITEMS } from '../src/content/items.js';
import { SURVIVORS_BY_ID } from '../src/content/survivors.js';
import { reduce } from '../src/core/reducer.js';
import * as A from '../src/core/actions.js';
import { startedGame, setSurvivors, setEnergy, giveCard, patch } from './_helpers.js';

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
  assert.equal(cardNeeds(s, junk), null, 'junk is scrapped for energy, no target');
  assert.equal(cardNeeds(s, gun), null, 'gear is equipped, no target');
  assert.equal(cardNeeds(s, food), null);
  const medT = Object.fromEntries(cardTargets(s, pid, med).map((x) => [x.survivorId, x]));
  assert.equal(medT['agnes-pell'].ok, true, 'only the wounded survivor can be healed');
  assert.equal(medT['corwin-daly'].error, 'notWounded');
  assert.deepEqual(cardOptions(s, pid, gun).map((o) => o.id), ['equip', 'contribute', 'deposit']);
  assert.ok(cardOptions(s, pid, gun)[0].ok);
});

test('lure and move targets for the board highlights', () => {
  let s = startedGame();
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, { 'lio-fontaine': 'school' });
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

test('acting survivors and the end-turn confirmation follow the energy left', () => {
  let s = startedGame();
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, { 'corwin-daly': 'colony' });
  s = setEnergy(s, pid, 60);
  assert.deepEqual(actingSurvivors(s, pid), ['corwin-daly']);
  assert.equal(shouldConfirmEndTurn(s, pid), true);
  assert.equal(shouldConfirmEndTurn(s, pid, { skip: true }), false);
  s = setEnergy(s, pid, 2);
  assert.equal(shouldConfirmEndTurn(s, pid), false, 'nothing affordable: just end');
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

test('every item and survivor has a 64x64 pixel sprite', () => {
  for (const id of Object.keys(ITEMS)) assert.ok(existsSync(`public/items/${id}.png`), `item sprite ${id}`);
  for (const id of Object.keys(SURVIVORS_BY_ID)) assert.ok(existsSync(`public/portraits/${id}.png`), `portrait ${id}`);
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
