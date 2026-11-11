// Headless game driver: the bot plays a whole solo game. Used by tests and for balance checks.
import { createGame } from '../core/state.js';
import { tryReduce } from '../core/reducer.js';
import { PHASES } from '../core/constants.js';
import { botAction } from './simpleBot.js';

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulate({
  scenarioId = 'beacon', seed = 1, chaos = 0, maxSteps = 5000, onStep = null, difficulty = 'normal', days = 40, fullTown = false,
} = {}) {
  let state = createGame({ scenarioId, seed, difficulty, days, fullTown }); // bots play a fixed winter
  const random = mulberry(seed * 7919 + 13);
  const errors = [];
  let steps = 0;
  while (state.phase !== PHASES.GAME_OVER && steps < maxSteps) {
    steps++;
    const action = botAction(state, { random, chaos });
    const res = tryReduce(state, action);
    if (res.ok) {
      state = res.state;
      onStep?.(state, action);
      continue;
    }
    errors.push({ action, error: res.error, message: res.message });
    // Recover so the game can continue.
    const fallback = state.phase === PHASES.TURN ? { type: 'END_TURN' } : null;
    if (!fallback) break;
    state = tryReduce(state, fallback).state;
  }
  return { state, steps, errors };
}
