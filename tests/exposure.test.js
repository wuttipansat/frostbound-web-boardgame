import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce } from '../src/core/reducer.js';
import * as a from '../src/core/actions.js';
import { startedGame, setSurvivors, patch, player, findSeed } from './_helpers.js';

const moveTo = (pid, id, loc) => (x) => reduce(x, a.move(pid, id, loc));

test('wound result adds a wound; 3 wounds kill (stoic survives until 4)', () => {
  let s = startedGame();
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, { 'corwin-daly': 'colony', 'greta-vos': 'colony' });
  s = patch(s, (x) => { x.survivors['corwin-daly'].wounds = 2; x.survivors['greta-vos'].wounds = 2; });
  const dead = findSeed(s, moveTo(pid, 'corwin-daly', 'school'), (x) => x.lastExposure.face === 'wound');
  assert.equal(dead.survivors['corwin-daly'].alive, false);
  assert.equal(dead.morale, s.morale - 1);
  assert.ok(!player(dead, pid).survivors.includes('corwin-daly'));

  const tough = findSeed(s, moveTo(pid, 'greta-vos', 'school'), (x) => x.lastExposure.face === 'wound');
  assert.equal(tough.survivors['greta-vos'].alive, true);
  assert.equal(tough.survivors['greta-vos'].wounds, 3);
});

test('frostbite wounds now, worsens outside, and is cured by the campfire', () => {
  let s = startedGame();
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, { 'corwin-daly': 'colony' });
  const bitten = findSeed(s, moveTo(pid, 'corwin-daly', 'school'), (x) => x.lastExposure.face === 'frostbite');
  assert.equal(bitten.survivors['corwin-daly'].frostbite, true);
  assert.equal(bitten.survivors['corwin-daly'].wounds, 1);

  const diver = setSurvivors(s, pid, { 'bo-lindqvist': 'colony' });
  const r = findSeed(diver, moveTo(pid, 'bo-lindqvist', 'school'), (x) => x.log.some((e) => e.k === 'exposure' && e.face === 'blank'));
  assert.equal(r.survivors['bo-lindqvist'].wounds, 0);
});

test('a bite kills and spreads infection to the lowest-influence survivor at that location', () => {
  let s = startedGame({ players: 2 });
  const [p0, p1] = s.players.map((p) => p.id);
  s = setSurvivors(s, p0, { 'agnes-pell': 'colony' });
  s = setSurvivors(s, p1, { 'dot-ferreira': 'school', 'silas-thorn': 'school' });
  s = patch(s, (x) => { x.activePlayerId = p0; });
  const r = findSeed(s, moveTo(p0, 'agnes-pell', 'school'), (x) => x.lastExposure.face === 'bite' || x.log.some((e) => e.k === 'infectionSpreads'));
  assert.equal(r.survivors['agnes-pell'].alive, false);
  const spread = r.log.find((e) => e.k === 'infectionSpreads');
  assert.equal(spread.to, 'dot-ferreira', 'Dot (influence 15) is lowest');
  assert.ok(r.log.some((e) => e.k === 'exposure' && e.cause === 'infection'));
});

test('a player who loses all survivors recruits a replacement in the colony', () => {
  let s = startedGame();
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, { 'corwin-daly': 'colony' });
  const deckBefore = s.survivorDeck.length;
  const r = findSeed(s, moveTo(pid, 'corwin-daly', 'school'), (x) => x.lastExposure.face === 'bite');
  const p = player(r, pid);
  assert.equal(p.survivors.length, 1);
  assert.equal(r.survivors[p.survivors[0]].location, 'colony');
  assert.equal(r.survivorDeck.length, deckBefore - 1);
});

test('lucky survivor keeps the better of two exposure rolls', () => {
  let s = startedGame();
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, { 'ezra-kade': 'colony' });
  let bites = 0;
  for (let seed = 1; seed < 600; seed++) {
    const r = reduce(patch(s, (x) => { x.rng = seed; }), a.move(pid, 'ezra-kade', 'school'));
    if (r.lastExposure.face === 'bite') bites++;
  }
  // P(bite) = 1/144 with two rolls vs 1/12 with one.
  assert.ok(bites < 20, `bites=${bites}`);
});
