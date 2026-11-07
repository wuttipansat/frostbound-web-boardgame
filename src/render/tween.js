// A tiny tween engine driven by the render loop (no timers), so animations pause with the game.

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t) => { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; },
  outBounce: (t) => {
    const n = 7.5625; const d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};

export class Tweens {
  constructor() {
    this.list = [];
  }

  /**
   * Run onUpdate(easedT, rawT) for `duration` seconds after `delay`. Resolves when finished.
   * @returns {Promise<void>}
   */
  add({ duration, delay = 0, ease: e = ease.linear, onStart, onUpdate, onComplete }) {
    return new Promise((resolve) => {
      this.list.push({
        duration: Math.max(duration, 1e-6), delay, e, onStart, onUpdate, onComplete, resolve, elapsed: 0, started: false,
      });
    });
  }

  /** Promise that resolves after `seconds` of render time. */
  wait(seconds) {
    return this.add({ duration: seconds });
  }

  update(dt) {
    if (!this.list.length) return;
    // Snapshot: tweens created inside callbacks land in the fresh this.list and start next frame.
    const current = this.list;
    this.list = [];
    const still = [];
    for (const tw of current) {
      tw.elapsed += dt;
      if (tw.elapsed < tw.delay) { still.push(tw); continue; }
      if (!tw.started) { tw.started = true; tw.onStart?.(); }
      const raw = Math.min(1, (tw.elapsed - tw.delay) / tw.duration);
      tw.onUpdate?.(tw.e(raw), raw);
      if (raw >= 1) {
        tw.onComplete?.();
        tw.resolve();
      } else {
        still.push(tw);
      }
    }
    this.list = still.concat(this.list);
  }

  get busy() {
    return this.list.length > 0;
  }

  /** Finish everything immediately (used for instant syncs). */
  flush() {
    for (let i = 0; i < 20 && this.list.length; i++) this.update(1e6);
  }
}
