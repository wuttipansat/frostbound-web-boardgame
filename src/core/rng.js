// Deterministic RNG whose entire state is a single 32-bit integer stored in GameState.rng.
// All functions mutate `s.rng` on the (already cloned) draft state passed in.

export function normalizeSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  const str = String(seed ?? Date.now());
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/** mulberry32 step. Returns a float in [0, 1). */
export function random(s) {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(s, min, max) {
  return min + Math.floor(random(s) * (max - min + 1));
}

export function rollD6(s) {
  return randInt(s, 1, 6);
}

export function pick(s, arr) {
  return arr[Math.floor(random(s) * arr.length)];
}

/** Returns a new shuffled array (Fisher–Yates). */
export function shuffle(s, arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
