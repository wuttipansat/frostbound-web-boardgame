// Graphics tiers + an fps governor (step 22). "auto" starts high and steps down when frames are slow
// (and back up, carefully, when there is plenty of headroom); "high" and "saver" are fixed.

export const TIERS = Object.freeze({
  high: { id: 'high', pixelRatio: 2, post: true, shadow: 4096, snow: 1 },
  medium: { id: 'medium', pixelRatio: 1.25, post: true, shadow: 2048, snow: 0.6 },
  low: { id: 'low', pixelRatio: 1, post: false, shadow: 1024, snow: 0.35 },
  // Battery saver: the low tier at 30 fps.
  saver: { id: 'saver', pixelRatio: 1, post: false, shadow: 1024, snow: 0.3, every: 2 },
});
const LADDER = ['high', 'medium', 'low'];
export const GRAPHICS_MODES = ['auto', 'high', 'saver'];

/**
 * sample(seconds) per drawn frame. Windows of `window` s are judged:
 *   fps < down (2 windows in a row) → one tier lower; fps > up (6 in a row) → one tier higher,
 *   never above where it started, and never right after stepping down (cool-off).
 * Frames with a huge gap (tab switch, breakpoint) are ignored.
 */
export function createGovernor({ mode = 'auto', start = 'high', onTier = () => {}, window: win = 2, down = 40, up = 57, coolOff = 20 } = {}) {
  let tier = mode === 'saver' ? 'saver' : mode === 'high' ? 'high' : start;
  let frames = 0; let time = 0; let slow = 0; let fast = 0; let sinceDown = Infinity;
  const top = LADDER.indexOf(start);
  const set = (id) => { if (id !== tier) { tier = id; onTier(TIERS[id]); } };
  return {
    get tier() { return tier; },
    get mode() { return mode; },
    setMode(m) {
      mode = m; frames = 0; time = 0; slow = 0; fast = 0;
      set(m === 'saver' ? 'saver' : m === 'high' ? 'high' : start);
    },
    sample(dt) {
      if (mode !== 'auto' || !(dt > 0) || dt > 0.5) return;
      frames++; time += dt; sinceDown += dt;
      if (time < win) return;
      const fps = frames / time;
      frames = 0; time = 0;
      const i = LADDER.indexOf(tier);
      if (fps < down) { fast = 0; if (++slow >= 2 && i < LADDER.length - 1) { slow = 0; sinceDown = 0; set(LADDER[i + 1]); } }
      else if (fps > up) { slow = 0; if (++fast >= 6 && i > top && sinceDown > coolOff) { fast = 0; set(LADDER[i - 1]); } }
      else { slow = 0; fast = 0; }
    },
  };
}
