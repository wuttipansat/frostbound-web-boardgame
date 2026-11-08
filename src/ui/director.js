// Presentation queue (step 15): turns new log entries into short "scenes" that play one after another —
// the camera goes there, an effect plays, a small callout shows the result — so the table can follow
// what someone else did without reading the log. Built from log entries only, which are public text
// (the same on every online client), so a scene never knows a hidden card.

/** Seconds each scene holds at normal speed: [watched (someone else), own move]. */
const DURATION = {
  move: [1.5, 0.15], attack: [1.3, 0.25], search: [1.35, 0.25], barricade: [1.05, 0.2], clean: [0.95, 0.2],
  lure: [1.35, 0.2], play: [1.0, 0.15], contribute: [0.9, 0.15], deposit: [1.0, 0.15], exposure: [2.9, 2.5], turn: [0.55, 0],
};
const MAX_SCENE = 4; // seconds: nothing may hold the queue longer, whatever the frame rate
export const SPEED = { normal: 1, fast: 0.55 };

/** Map new log entries to scenes. `viewer` is who holds this screen (null: watching everyone). */
export function eventsFromLog(entries, state, viewer = null) {
  const out = [];
  const ownerOf = (svId) => state.survivors?.[svId]?.owner ?? null;
  const locOf = (svId) => state.survivors?.[svId]?.location ?? null;
  for (const e of entries) {
    let ev = null;
    switch (e.k) {
      case 'move':
        if (e.from === e.to) break;
        ev = { kind: 'move', playerId: e.playerId ?? ownerOf(e.survivorId), survivorId: e.survivorId, from: e.from, to: e.to, at: e.to, safe: !!e.safe };
        break;
      case 'attack': ev = { kind: 'attack', playerId: e.playerId, survivorId: e.survivorId, at: e.locationId, n: e.killed ?? 0 }; break;
      // Only how many cards were found: never which.
      case 'search': ev = { kind: 'search', playerId: e.playerId, survivorId: e.survivorId, at: e.locationId, n: e.count ?? 0 }; break;
      case 'barricade': ev = { kind: 'barricade', playerId: e.playerId ?? state.activePlayerId ?? null, at: e.locationId, n: e.n ?? 1 }; break;
      case 'clean': ev = { kind: 'clean', playerId: e.playerId, survivorId: e.survivorId, at: 'colony', n: e.removed ?? 0 }; break;
      case 'lure': ev = { kind: 'lure', playerId: e.playerId, survivorId: e.survivorId, from: e.from, to: e.to, at: e.to, n: e.n ?? 0 }; break;
      // Played and deposited cards are public; contributed ones are face down (no card at all).
      case 'play': ev = { kind: 'play', playerId: e.playerId, at: 'colony', card: e.card, type: e.type }; break;
      case 'contribute': ev = { kind: 'contribute', playerId: e.playerId, at: 'colony' }; break;
      case 'deposit': ev = { kind: 'deposit', playerId: e.playerId, at: 'colony', card: e.card }; break;
      case 'exposure': ev = { kind: 'exposure', playerId: ownerOf(e.survivorId), survivorId: e.survivorId, at: locOf(e.survivorId), face: e.face }; break;
      case 'turnStart': ev = { kind: 'turn', playerId: e.playerId, at: null }; break;
      default: break;
    }
    if (!ev) continue;
    ev.watch = !viewer || (ev.playerId != null && ev.playerId !== viewer);
    out.push(ev);
  }
  return out;
}

/** How long a scene holds, in seconds. */
export function durationFor(ev, { speed = 'normal', hold = false, scale = 1 } = {}) {
  const [watched, own] = DURATION[ev.kind] ?? [0.8, 0.15];
  let d = ev.watch ? watched : own;
  if (ev.kind !== 'exposure') d *= SPEED[speed] ?? 1;
  if (hold) d /= 3;
  // `scale` only slows scenes down for automated tests on slow software rendering (?scenes=N).
  return Math.min(MAX_SCENE, d) * scale;
}

/**
 * The queue itself. Hooks:
 *   camera: { focus(ev), home(), release() }   (may be null: no camera moves)
 *   play(ev): effects + callout for a scene
 *   onChange(busy, ev): the UI redraws its "watching" state
 *   settings(): { follow: 'others' | 'all' | 'off', speed: 'normal' | 'fast' }
 *   timers: { set, clear } (injectable for tests)
 */
export function createDirector({ camera = null, play = () => {}, onChange = () => {}, settings = () => ({}), timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) } } = {}) {
  const queue = [];
  let current = null;
  let timer = null;
  let hold = false;
  let moved = false; // the camera left its home during this run
  let seq = 0;

  function cameraFor(ev) {
    const follow = settings().follow ?? 'others';
    if (!camera || follow === 'off') return false;
    if (follow === 'others' && !ev.watch) return false;
    return !!ev.at || !!ev.survivorId;
  }

  function next() {
    timers.clear(timer);
    timer = null;
    current = queue.shift() ?? null;
    if (!current) {
      if (moved) camera?.home();
      moved = false;
      camera?.release?.();
      onChange(false, null);
      return;
    }
    current.duration = durationFor(current, { speed: settings().speed, scale: settings().scale ?? 1, hold });
    if (current.kind !== 'turn' && cameraFor(current)) { camera.focus(current); moved = true; }
    try { play(current); } catch (err) { console.error(err); }
    onChange(true, current);
    timer = timers.set(next, current.duration * 1000);
  }

  return {
    push(events) {
      if (!events?.length) return;
      for (const ev of events) queue.push({ ...ev, seq: ++seq });
      if (!current) next();
    },
    /** Skip the scene on screen. */
    skip() { if (current) next(); },
    /** Hold to play faster. */
    setHold(on) { hold = !!on; },
    /** Drop everything (new game, loaded game, leaving). */
    clear() {
      timers.clear(timer);
      timer = null;
      queue.length = 0;
      const was = current;
      current = null;
      if (was && moved) camera?.home();
      moved = false;
      camera?.release?.();
      if (was) onChange(false, null);
    },
    get busy() { return !!current || queue.length > 0; },
    /** Someone else's action is on screen. */
    get watching() { return !!current?.watch && current.kind !== 'turn'; },
    get current() { return current; },
  };
}
