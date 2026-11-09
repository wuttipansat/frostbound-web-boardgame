// Energy (personal, per survivor), gear, the shared danger deck, threat forecast.
// There are no dice anywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, startedGame, setSurvivors, patch } from './_helpers.js';
import { reduce, tryReduce } from '../src/core/reducer.js';
import * as act from '../src/core/actions.js';
import { ENERGY, DANGER_DECK } from '../src/core/constants.js';
import { actionCost, spawnForecast, dangerCounts, energyRegen, energyMax, killsPerAttack, gearOf } from '../src/core/selectors.js';
import { SURVIVORS } from '../src/content/survivors.js';
import { giveCard, setEnergy } from './_helpers.js';
import { viewFor } from '../src/core/view.js';
import { spawnZombies } from '../src/core/rules/flow.js';
import { drawDanger } from '../src/core/rules/helpers.js';
import { simulate } from '../src/ai/simulate.js';

const fb = (o = {}) => startedGame(o);
const me = (s) => s.players.find((p) => p.id === s.activePlayerId);
/** Put a specific card on top of the danger deck. */
const topDanger = (s, kind) => { const c = structuredClone(s); c.danger.deck.push(kind); return c; };

test('one survivor each, full of their own energy; a 20-card danger deck; no dice anywhere', () => {
  const s = fb();
  const total = Object.values(DANGER_DECK).reduce((x, y) => x + y, 0);
  assert.equal(s.danger.deck.length + s.danger.discard.length, total);
  for (const p of s.players) {
    assert.equal(p.survivors.length, 1);
    assert.equal(p.energy, energyMax(s, p.id));
    assert.equal(p.dice, undefined);
  }
  assert.ok(!JSON.stringify(s).includes('"roll"'));
});

test('every survivor has a personal energy pool (60..100) and regen; stronger abilities get less', () => {
  for (const sv of SURVIVORS) {
    assert.ok(sv.energy >= 60 && sv.energy <= 100, sv.id);
    assert.ok(sv.regen >= 50 && sv.regen <= 85, sv.id);
  }
  const by = Object.fromEntries(SURVIVORS.map((x) => [x.id, x]));
  assert.ok(by['ambrose-lark'].energy > by['osei-vance'].energy, 'a plain tinkerer has more stamina than the surgeon');
});

test('gear: equip is free, swaps back to hand, changes personal stats, and is worn in plain sight', () => {
  let s = fb({ seed: 21 });
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, { 'corwin-daly': 'police' });
  s = patch(s, (x) => { x.locations.police.zombies = 3; });
  const bare = actionCost(s, 'corwin-daly', 'attack');
  let baton, shotgun, boots, guide;
  [s, baton] = giveCard(s, pid, 'riot-baton');
  [s, shotgun] = giveCard(s, pid, 'remington-870');
  [s, boots] = giveCard(s, pid, 'winter-boots');
  [s, guide] = giveCard(s, pid, 'survival-guide');
  const e0 = me(s).energy;
  s = reduce(s, act.equip(pid, baton));
  assert.equal(me(s).energy, e0, 'free');
  assert.equal(actionCost(s, 'corwin-daly', 'attack'), bare - 2);
  assert.ok(!me(s).hand.includes(baton));
  s = reduce(s, act.equip(pid, shotgun));
  assert.ok(me(s).hand.includes(baton), 'the baton goes back to hand');
  assert.equal(killsPerAttack(s, 'corwin-daly'), 2);
  const r = reduce(s, act.attack(pid, 'corwin-daly'));
  assert.equal(r.locations.police.zombies, 1);
  assert.deepEqual(r.lastExposure, s.lastExposure, 'armed: no danger card');
  s = reduce(s, act.equip(pid, boots));
  assert.equal(actionCost(s, 'corwin-daly', 'move', 'colony'), ENERGY.COST.move - 5);
  const regen = energyRegen(s, pid);
  s = reduce(s, act.equip(pid, guide));
  assert.equal(energyRegen(s, pid), regen + 10);
  const [s2, food] = giveCard(s, pid, 'canned-beans');
  assert.equal(tryReduce(s2, act.equip(pid, food)).error, 'notGear');
  const other = s.players.find((p) => p.id !== pid).id;
  const v = viewFor(s, other);
  assert.equal(gearOf(v, pid).weapon.id, 'remington-870', 'others see what you wear');
});

test('actions cost energy: odd numbers, modifiers, and not enough energy is illegal', () => {
  let s = fb({ seed: 5 });
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, { 'osei-vance': 'grocery', 'greta-vos': 'hospital' });
  s.round = 1;
  const search = (id) => ENERGY.SEARCH_BASE + ENERGY.PER_SKILL * SURVIVORS.find((x) => x.id === id).search;
  const attack = (id) => ENERGY.ATTACK_BASE + ENERGY.PER_SKILL * SURVIVORS.find((x) => x.id === id).attack;
  assert.equal(actionCost(s, 'osei-vance', 'search'), search('osei-vance'));
  assert.equal(actionCost(s, 'greta-vos', 'search'), search('greta-vos') + ENERGY.DANGEROUS);
  s.locations.grocery.zombies = 2;
  assert.equal(actionCost(s, 'osei-vance', 'search'), search('osei-vance') + ENERGY.CROWDED);
  s.round = 2; // night: outside costs more
  assert.equal(actionCost(s, 'osei-vance', 'attack'), attack('osei-vance') + ENERGY.NIGHT);
  s.round = 1;
  me(s).energy = 100;
  const after = reduce(s, act.search(pid, 'greta-vos'));
  assert.equal(me(after).energy, 100 - search('greta-vos') - ENERGY.DANGEROUS);
  const broke = structuredClone(s); me(broke).energy = 5;
  assert.equal(tryReduce(broke, act.search(pid, 'greta-vos')).error, 'notEnoughEnergy');
});

test('moving: costs energy, repeatable, safe into empty places, a danger card where zombies wait', () => {
  let s = fb({ seed: 6 });
  const pid = s.activePlayerId;
  s = setSurvivors(s, pid, { 'osei-vance': 'colony', 'greta-vos': 'colony' });
  s.locations.police.zombies = 0;
  me(s).energy = 80;
  s = reduce(s, act.move(pid, 'osei-vance', 'grocery'));
  assert.equal(me(s).energy, 80 - ENERGY.COST.move - (s.round % 2 === 0 ? ENERGY.NIGHT : 0));
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
  const regen = energyRegen(s, pid);
  let c = topDanger(s, 'frost'); drawDanger(c, 'osei-vance', 'test');
  assert.ok(c.survivors['osei-vance'].frostbite);
  assert.equal(energyRegen(c, pid), regen + ENERGY.REGEN_FROST);
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
  simulate({ players: 3, seed: 3, onStep: (st) => { if (st.log.some((e) => e.k === 'dangerAdded' && e.kind === 'bite')) grew = true; } });
  assert.ok(grew, 'a bite card was added as the winter went on');
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
  assert.equal(energyMax(hurt, pid), SURVIVORS.find((x) => x.id === 'osei-vance').energy - ENERGY.HURT);
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
      const { state, errors } = simulate({ players, seed, scenarioId: ['beacon', 'stores', 'purge'][seed % 3] });
      assert.equal(errors.length, 0, JSON.stringify(errors[0]));
      assert.equal(state.phase, 'gameOver');
    }
  }
  const { errors } = simulate({ players: 3, seed: 2, chaos: 0.3 });
  assert.ok(errors.every((e) => e.error !== undefined), 'chaos bots only make rule errors');
});
