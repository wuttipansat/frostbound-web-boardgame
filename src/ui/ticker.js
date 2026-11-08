// Animated resource counters for the top bar. Pure UI: it remembers the last value shown per key and,
// when the game state changes it, counts the number toward the new value and floats a +N / −N tag.
// The top bar is re-rendered often, so each change is timed from when it happened, not from the render.
import { h } from './dom.js';

const FLOAT_MS = 1200;
const COUNT_MS = 600;
const seen = new Map(); // key -> { value, from, delta, at }

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Record a value; returns { delta, age, from } for the latest change of this key. */
export function track(key, value, t = now()) {
  const rec = seen.get(key);
  if (!rec) {
    seen.set(key, { value, from: value, delta: 0, at: -Infinity });
    return { delta: 0, age: Infinity, from: value };
  }
  if (rec.value !== value) {
    rec.from = rec.value;
    rec.delta = value - rec.value;
    rec.value = value;
    rec.at = t;
  }
  return { delta: rec.delta, age: t - rec.at, from: rec.from };
}

/** Forget every value (a new or loaded game must not show its setup as changes). */
export function resetTicker() { seen.clear(); }

/**
 * A number that counts to its new value, plus a floating change tag while the change is fresh.
 * `goodWhen`: 'up' (more is good, e.g. food), 'down' (less is good, e.g. waste).
 * Returns { num, tag, live } — `live` lets the caller pulse the resource icon.
 */
export function counter(key, value, { goodWhen = 'up', text = String } = {}) {
  const { delta, age, from } = track(key, value);
  const live = delta !== 0 && age < FLOAT_MS;
  const num = h('b', { class: 'num' }, text(value));
  if (live && !reducedMotion() && age < COUNT_MS) {
    const start = now() - age;
    const step = (t) => {
      const k = Math.min(1, (t - start) / COUNT_MS);
      num.textContent = text(Math.round(from + (value - from) * (1 - (1 - k) ** 3)));
      if (k < 1 && num.isConnected) requestAnimationFrame(step);
      else num.textContent = text(value);
    };
    requestAnimationFrame(step);
  }
  const good = goodWhen === 'up' ? delta > 0 : delta < 0;
  const tag = live
    ? h('span', { class: `res-delta ${good ? 'up' : 'down'}`, 'aria-hidden': 'true', style: { animationDelay: `${-Math.round(age)}ms` } },
      `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`)
    : null;
  return { num, tag, live, age };
}
