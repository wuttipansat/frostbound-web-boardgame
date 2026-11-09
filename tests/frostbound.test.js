// Step 23a: Frostbound rules — energy instead of action dice, a shared danger deck instead of the
// exposure die, search deeper, threat forecast. Classic rules must be untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, startedGame, setSurvivors } from './_helpers.js';
import { reduce, tryReduce } from '../src/core/reducer.js';
import * as act from '../src/core/actions.js';
import { ENERGY, DANGER_DECK } from '../src/core/constants.js';
import { actionCost, spawnForecast, dangerCounts, energyRegen, energyMax } from '../src/core/selectors.js';
import { viewFor } from '../src/core/view.js';
import { spawnZombies } from '../src/core/rules/flow.js';
import { drawDanger } from '../src/core/rules/helpers.js';
import { simulate } from '../src/ai/simulate.js';

const fb = (o = {}) => startedGame({ rules: 'frostbound', ...o });
const me = (s) => s.players.find((p) => p.id === s.activePlayerId);
/** Put a specific card on top of the danger deck. */
const topDanger = (s, kind) => { const c = structuredClone(s); c.danger.deck.push(kind); return c; };

test('rules default to classic; frostbound has energy and a 20-card danger deck, no dice', () => {
  assert.equal(newGame().config.rules, 'classic');
  assert.equal(newGame().danger, undefined);
  const s = fb();
  assert.equal(s.config.rules, 'frostbound');
  const total = Object.values(DANGER_DECK).reduce((a, b) => a + b, 0);
  assert.equal(s.danger.deck.length + s.danger.discard.length, total);
  for (const p of s.players) { assert.equal(p.energy, ENERGY.START); assert.equal(p.dice.length, 0); }
});

test('classic games keep their exact seeds (no extra randomness)', () => {
  const a = startedGame({ seed: 9 }); const b = startedGame({ seed: 9, rules: 'classic' });
  assert.deepEqual(a.players.map((p) => p.dice), b.players.map((p) => p.dice));
  assert.deepEqual(a.locations, b.locations);
});

test('actions cost energy: odd numbers, modifiers, and not enough energy is illegal', () => {
  let s = fb({ seed: 5 });
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, { 'osei-vance': 'grocery', 'greta-vos': 'hospital' });
  s.round = 1;
  assert.equal(actionCost(s, 'osei-vance', 'search'), ENERGY.COST.search);
  assert.equal(actionCost(s, 'greta-vos', 'search'), ENERGY.COST.search + ENERGY.DANGEROUS);
  s.locations.grocery.zombies = 2;
  assert.equal(actionCost(s, 'osei-vance', 'search'), ENERGY.COST.search + ENERGY.CROWDED);
  s.round = 2; // night: outside costs more
  assert.equal(actionCost(s, 'osei-vance', 'attack'), ENERGY.COST.attack + ENERGY.NIGHT);
  s.round = 1;
  const before = me(s).energy;
  const after = reduce(s, act.search(pid, 'greta-vos', 0));
  assert.equal(me(after).energy, before - ENERGY.COST.search - ENERGY.DANGEROUS);
  const broke = structuredClone(s); me(broke).energy = 5;
  assert.equal(tryReduce(broke, act.search(pid, 'greta-vos', 0)).error, 'notEnoughEnergy');
});

test('moving: costs energy, repeatable, safe into empty places, a danger card where zombies wait', () => {
  let s = fb({ seed: 6 });
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, { 'osei-vance': 'colony', 'greta-vos': 'colony' });
  s.locations.police.zombies = 0;
  s = reduce(s, act.move(pid, 'osei-vance', 'grocery'));
  assert.equal(me(s).energy, ENERGY.START - ENERGY.COST.move);
  assert.ok(!s.log.some((e) => e.k === 'exposure'), 'empty place: no draw');
  s = reduce(s, act.move(pid, 'osei-vance', 'school')); // a second move is fine
  s.locations.police.zombies = 1;
  s = topDanger(s, 'scratch');
  s = reduce(s, act.move(pid, 'greta-vos', 'police'));
  const e = s.log.filter((x) => x.k === 'exposure').at(-1);
  assert.equal(e.danger, 'scratch');
  assert.equal(s.survivors['greta-vos'].wounds, 1);
});

test('danger cards: frost lowers next regen, startle drains energy, surrounded adds a zombie, bite kills', () => {
  let s = fb({ seed: 7 });
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, { 'osei-vance': 'grocery', 'greta-vos': 'school' });
  let c = topDanger(s, 'frost'); drawDanger(c, 'osei-vance', 'test');
  assert.ok(c.survivors['osei-vance'].frostbite);
  assert.equal(energyRegen(c, pid), ENERGY.REGEN + ENERGY.REGEN_FROST);
  c = topDanger(s, 'startle'); const e0 = me(c).energy; drawDanger(c, 'osei-vance', 'test');
  assert.equal(me(c).energy, e0 - 10);
  c = topDanger(s, 'surrounded'); const z0 = c.locations.grocery.zombies; drawDanger(c, 'osei-vance', 'test');
  assert.equal(c.locations.grocery.zombies + c.locations.grocery.barricades, z0 + s.locations.grocery.barricades + 1);
  c = topDanger(s, 'bite'); drawDanger(c, 'greta-vos', 'test');
  assert.equal(c.survivors['greta-vos'].alive, false);
});

test('abilities: lucky draws two and keeps the better; frost-proof ignores frost', () => {
  let s = fb({ seed: 8 });
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, { 'ezra-kade': 'grocery', 'bo-lindqvist': 'school' });
  let c = structuredClone(s); c.danger.deck.push('safe', 'bite'); // bite on top, then safe
  drawDanger(c, 'ezra-kade', 'test');
  assert.ok(c.survivors['ezra-kade'].alive);
  assert.equal(c.lastExposure.danger, 'safe');
  c = topDanger(s, 'frost'); drawDanger(c, 'bo-lindqvist', 'test');
  assert.equal(c.survivors['bo-lindqvist'].wounds, 0);
});

test('the deck reshuffles its discards when empty; escalation adds bites; failed crisis adds a scratch', () => {
  let s = fb({ seed: 10 });
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, { 'osei-vance': 'grocery', 'greta-vos': 'school' });
  const c = structuredClone(s);
  c.danger.discard.push(...c.danger.deck.splice(0)); // all in the discard pile
  drawDanger(c, 'osei-vance', 'test');
  assert.ok(c.log.some((e) => e.k === 'dangerShuffle'));
  assert.equal(c.danger.deck.length + c.danger.discard.length, 20);
  // Play bot games to the end of round 3 and check the deck grew.
  let grew = false;
  simulate({ players: 3, seed: 3, rules: 'frostbound', onStep: (st) => { if (st.log.some((e) => e.k === 'dangerAdded' && e.kind === 'bite')) grew = true; } });
  assert.ok(grew, 'a bite card was added as the winter went on');
});

test('search deeper: only right after a search, +1 card then a danger card; any paid action ends it', () => {
  let s = fb({ seed: 11 });
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, { 'osei-vance': 'grocery', 'greta-vos': 'school' });
  assert.equal(tryReduce(s, act.searchDeeper(pid, 'osei-vance')).error, 'searchFirst');
  s = reduce(s, act.search(pid, 'osei-vance', 0));
  const hand = me(s).hand.length; const energy = me(s).energy;
  s = topDanger(s, 'safe');
  s = reduce(s, act.searchDeeper(pid, 'osei-vance'));
  assert.equal(me(s).hand.length, hand + 1);
  assert.equal(me(s).energy, energy, 'free');
  assert.ok(s.log.some((e) => e.k === 'exposure' && e.cause === 'deeper'));
  s = topDanger(s, 'safe');
  s = reduce(s, act.searchDeeper(pid, 'osei-vance')); // repeatable
  s = reduce(s, act.barricade(pid, 'greta-vos', 0));
  assert.equal(tryReduce(s, act.searchDeeper(pid, 'osei-vance')).error, 'searchFirst');
  assert.equal(tryReduce(startedGame(), act.searchDeeper(startedGame().activePlayerId, 'x')).ok, false);
});

test('energy: regen at turn start, carry-over, cap, lower cap when badly hurt', () => {
  let s = fb({ seed: 12 });
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, { 'osei-vance': 'colony', 'greta-vos': 'colony' });
  me(s).energy = 20;
  s = reduce(s, act.endTurn(pid));
  // Fast-forward to this player's next turn.
  let guard = 0;
  while (s.activePlayerId !== pid && s.phase !== 'gameOver' && guard++ < 50) {
    const a = s.activePlayerId;
    s = s.phase === 'crossroads' ? reduce(s, act.resolveCrossroads(s.pendingCrossroads.activePlayerId, 0)) : reduce(s, act.endTurn(a));
  }
  if (s.phase !== 'gameOver') assert.equal(me(s).energy, Math.min(energyMax(s, pid), 20 + energyRegen(s, pid)));
  const hurt = structuredClone(s); hurt.survivors['osei-vance'].wounds = 2;
  assert.equal(energyMax(hurt, pid), ENERGY.MAX_HURT);
});

test('threat forecast equals what the colony phase spawns', () => {
  let s = fb({ seed: 13 });
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, { 'osei-vance': 'grocery', 'greta-vos': 'grocery' });
  const forecast = spawnForecast(s);
  assert.equal(forecast.grocery, 1);
  const c = structuredClone(s);
  assert.deepEqual(spawnZombies(c), forecast);
});

test('views hide the danger deck order but show what is left', () => {
  const s = fb({ seed: 14 });
  const v = viewFor(s, s.players[0].id);
  assert.deepEqual(v.danger.deck, []);
  assert.deepEqual(dangerCounts(v), dangerCounts(s));
  assert.equal(v.danger.deckCount, s.danger.deck.length);
});

test('bots play whole frostbound games without illegal moves', () => {
  for (let seed = 1; seed <= 15; seed++) {
    for (const players of [2, 4]) {
      const { state, errors } = simulate({ players, seed, rules: 'frostbound', scenarioId: ['beacon', 'stores', 'purge'][seed % 3] });
      assert.equal(errors.length, 0, JSON.stringify(errors[0]));
      assert.equal(state.phase, 'gameOver');
    }
  }
  const { errors } = simulate({ players: 3, seed: 2, rules: 'frostbound', chaos: 0.3 });
  assert.ok(errors.every((e) => e.error !== undefined), 'chaos bots only make rule errors');
});
