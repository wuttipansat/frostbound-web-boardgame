import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce } from '../src/core/reducer.js';
import * as act from '../src/core/actions.js';
import { createGame } from '../src/core/state.js';
import { TRAITS, XP } from '../src/core/constants.js';
import { atkOf, xpLevel, fightPreview, missionStatus, siegeForecast, bondKey } from '../src/core/selectors.js';
import { startedGame, setSurvivors, patch } from './_helpers.js';

test('every drafted survivor gets a trait', () => {
  const s = startedGame();
  for (const id of s.team.survivors) assert.ok(TRAITS.includes(s.survivors[id].trait), id);
});

test('experience: 5 attacks = fighting level 1 (+2 ATK)', () => {
  let s = setSurvivors(startedGame(), { 'corwin-daly': 'police', 'osei-vance': 'colony' });
  const atk = atkOf(s, 'corwin-daly');
  s = patch(s, (x) => { x.survivors['corwin-daly'].xp.fight = XP.PER_LEVEL - 1; x.locations.police.zombies = 2; });
  s = reduce(s, act.attack('corwin-daly'));
  assert.equal(xpLevel(s.survivors['corwin-daly'], 'fight'), 1);
  assert.equal(atkOf(s, 'corwin-daly'), atk + XP.ATK);
  assert.ok(s.log.some((e) => e.k === 'levelUp'));
});

test('bonds: a close friend at the same place saves 2 HP per fight', () => {
  let s = setSurvivors(startedGame(), { 'corwin-daly': 'police', 'osei-vance': 'police' });
  s = patch(s, (x) => { x.locations.police.zombies = 2; x.survivors['corwin-daly'].ap = 40; });
  const alone = fightPreview(s, 'corwin-daly').hp;
  s = patch(s, (x) => { x.bonds[bondKey('corwin-daly', 'osei-vance')] = 3; });
  assert.equal(fightPreview(s, 'corwin-daly').hp, Math.max(0, alone - 2));
});

test('weekly mission: shown with progress, +2 morale when done', () => {
  let s = startedGame();
  assert.ok(s.mission, 'day 1 starts a mission');
  s = patch(s, (x) => { x.mission = { id: 'hunt', stat: 'kills', target: 1, base: 0, until: 7 }; x.stats.kills = 1; x.morale = 5; x.food = 20; });
  assert.equal(missionStatus(s).progress, 1);
  const r = reduce(s, act.endTurn());
  assert.equal(r.stats.missions, 1);
  assert.ok(r.log.some((e) => e.k === 'missionDone'));
});

test('difficulty changes food, morale and the night attack', () => {
  const easy = createGame({ difficulty: 'easy', seed: 1 });
  const hard = createGame({ difficulty: 'hard', seed: 1 });
  assert.ok(easy.food > hard.food && easy.morale > hard.morale);
  const e = patch(startedGame(), (x) => { x.difficulty = 'easy'; x.day = 9; x.locations.colony.zombies = 0; });
  const h = patch(e, (x) => { x.difficulty = 'hard'; });
  assert.equal(siegeForecast(h).attackers - siegeForecast(e).attackers, 2);
});
