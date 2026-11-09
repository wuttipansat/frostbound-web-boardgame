// Danger cards (they replaced the exposure die): wounds, frost, bites and infection, abilities and armor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce } from '../src/core/reducer.js';
import * as a from '../src/core/actions.js';
import { startedGame, setSurvivors, patch, player, topDanger, giveCard } from './_helpers.js';

/** Walk into the school with a zombie waiting there, drawing `kind`. */
const walkInto = (s, pid, id, kind) => reduce(topDanger(patch(s, (x) => { x.locations.school.zombies = 1; }), kind), a.move(pid, id, 'school'));

test('scratch adds a wound; 3 wounds kill (stoic survives until 4)', () => {
  let s = startedGame();
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, { 'corwin-daly': 'colony', 'greta-vos': 'colony' });
  s = patch(s, (x) => { x.survivors['corwin-daly'].wounds = 2; x.survivors['greta-vos'].wounds = 2; });
  const dead = walkInto(s, pid, 'corwin-daly', 'scratch');
  assert.equal(dead.survivors['corwin-daly'].alive, false);
  assert.equal(dead.morale, s.morale - 1);
  assert.ok(!player(dead, pid).survivors.includes('corwin-daly'));

  const tough = walkInto(s, pid, 'greta-vos', 'scratch');
  assert.equal(tough.survivors['greta-vos'].alive, true);
  assert.equal(tough.survivors['greta-vos'].wounds, 3);
});

test('frost wounds now (frostbite); Bo and a padded parka shrug it off', () => {
  let s = startedGame();
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, { 'corwin-daly': 'colony' });
  const bitten = walkInto(s, pid, 'corwin-daly', 'frost');
  assert.equal(bitten.survivors['corwin-daly'].frostbite, true);
  assert.equal(bitten.survivors['corwin-daly'].wounds, 1);

  const diver = setSurvivors(s, pid, { 'bo-lindqvist': 'colony' });
  assert.equal(walkInto(diver, pid, 'bo-lindqvist', 'frost').survivors['bo-lindqvist'].wounds, 0);

  let [warm, parka] = giveCard(s, pid, 'padded-parka');
  warm = reduce(warm, a.equip(pid, parka));
  const r = walkInto(warm, pid, 'corwin-daly', 'frost');
  assert.equal(r.survivors['corwin-daly'].wounds, 0);
  assert.equal(r.lastExposure.danger, 'safe');
});

test('a riot vest stops the first scratch each round', () => {
  let s = startedGame();
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, { 'corwin-daly': 'colony' });
  let [v, vest] = giveCard(s, pid, 'riot-vest');
  v = reduce(v, a.equip(pid, vest));
  v = patch(v, (x) => { x.locations.school.zombies = 1; x.locations.gas.zombies = 1; });
  let r = reduce(topDanger(v, 'scratch'), a.move(pid, 'corwin-daly', 'school'));
  assert.equal(r.survivors['corwin-daly'].wounds, 0, 'soaked');
  r = reduce(topDanger(r, 'scratch'), a.move(pid, 'corwin-daly', 'gas'));
  assert.equal(r.survivors['corwin-daly'].wounds, 1, 'only once per round');
});

test('a bite kills and spreads infection to the lowest-influence survivor at that location', () => {
  let s = startedGame({ players: 2 });
  const [p0, p1] = s.players.map((p) => p.id);
  s = setSurvivors(s, p0, { 'agnes-pell': 'colony' });
  s = setSurvivors(s, p1, { 'dot-ferreira': 'school', 'silas-thorn': 'school' });
  s = patch(s, (x) => { x.activePlayerId = p0; });
  const r = reduce(topDanger(patch(s, (x) => { x.locations.school.zombies = 1; }), 'safe', 'bite'), a.move(p0, 'agnes-pell', 'school'));
  assert.equal(r.survivors['agnes-pell'].alive, false);
  const spread = r.log.find((e) => e.k === 'infectionSpreads');
  assert.equal(spread.to, 'dot-ferreira', 'Dot (influence 15) is lowest');
  assert.ok(r.log.some((e) => e.k === 'exposure' && e.cause === 'infection'));
});

test('a player who loses their survivor recruits a replacement in the colony', () => {
  let s = startedGame();
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, { 'corwin-daly': 'colony' });
  const deckBefore = s.survivorDeck.length;
  const r = walkInto(s, pid, 'corwin-daly', 'bite');
  const p = player(r, pid);
  assert.equal(p.survivors.length, 1);
  assert.equal(r.survivors[p.survivors[0]].location, 'colony');
  assert.equal(r.survivorDeck.length, deckBefore - 1);
});

test('lucky survivor draws two danger cards and keeps the better', () => {
  let s = startedGame();
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, { 'ezra-kade': 'colony' });
  const r = walkInto(topDanger(s, 'safe'), pid, 'ezra-kade', 'bite');
  assert.ok(r.survivors['ezra-kade'].alive);
  assert.equal(r.lastExposure.danger, 'safe');
});
