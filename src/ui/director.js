// Presentation queue (step 15): turns new log entries into short "scenes" that play one after another —
// the camera goes there, an effect plays, a small callout shows the result — so the player can follow
// what happened without reading the log. Built from log entries only.
// `watch` scenes hold longer and block input briefly (none in the solo game yet: every move is the player's own).

/** Seconds each scene holds at normal speed: [watched, own move]. */
const DURATION = {
  move: [1.5, 0.15], attack: [1.3, 0.25], search: [1.35, 0.25], barricade: [1.05, 0.2],
  lure: [1.35, 0.2], play: [1.0, 0.15], craft: [1.0, 0.2], build: [1.1, 0.25], unpack: [0.9, 0.2], give: [0.8, 0.15], nap: [0.8, 0.15], contribute: [0.9, 0.15], deposit: [1.0, 0.15], exposure: [2.9, 2.5], turn: [0.55, 0],
};
const MAX_SCENE = 4; // seconds: nothing may hold the queue longer, whatever the frame rate
export const SPEED = { normal: 1, fast: 0.55 };

/** Map new log entries to scenes (the solo player's own moves). */
export function eventsFromLog(entries, state) {
  const out = [];
  const locOf = (svId) => state.survivors?.[svId]?.location ?? null;
  for (const e of entries) {
    let ev = null;
    switch (e.k) {
      case 'move':
        if (e.from === e.to) break;
        ev = { kind: 'move', survivorId: e.survivorId, from: e.from, to: e.to, at: e.to, safe: !!e.safe };
        break;
      case 'attack': ev = { kind: 'attack', survivorId: e.survivorId, at: e.locationId, n: e.killed ?? 0, hp: e.hp ?? 0, drawn: e.drawn ?? 0 }; break;
      case 'search': ev = { kind: 'search', survivorId: e.survivorId, at: e.locationId, n: e.count ?? 0, spawned: !!e.spawned }; break;
      case 'craft': ev = { kind: 'craft', survivorId: e.survivorId, at: 'colony', card: e.card }; break;
      case 'building': ev = { kind: 'build', survivorId: e.survivorId, at: 'colony', building: e.buildingId, n: e.n }; break;
      case 'built': ev = { kind: 'build', at: 'colony', building: e.buildingId, level: e.level }; break;
      case 'unpack': ev = { kind: 'unpack', survivorId: e.survivorId, at: 'colony', n: e.count }; break;
      case 'give': ev = { kind: 'give', survivorId: e.survivorId, at: locOf(e.survivorId), card: e.card }; break;
      case 'nap': ev = { kind: 'nap', survivorId: e.survivorId, at: 'colony' }; break;
      case 'barricade': ev = { kind: 'barricade', at: e.locationId, n: e.n ?? 1 }; break;
      case 'lure': ev = { kind: 'lure', survivorId: e.survivorId, from: e.from, to: e.to, at: e.to, n: e.n ?? 0 }; break;
      case 'play': ev = { kind: 'play', at: 'colony', card: e.card, type: e.type }; break;
      case 'contribute': ev = { kind: 'contribute', at: 'colony' }; break;
      case 'deposit': ev = { kind: 'deposit', at: 'colony', card: e.card }; break;
      case 'exposure': ev = { kind: 'exposure', survivorId: e.survivorId, at: locOf(e.survivorId), face: e.face }; break;
      case 'turnStart': ev = { kind: 'turn', at: null }; break;
      default: break;
    }
    if (!ev) continue;
    ev.watch = false;
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
 *   settings(): { follow: 'all' | 'off', speed: 'normal' | 'fast' }
 *   timers: { set, clear } (injectable for tests)
 */
export function createDirector({ camera = null, play = () => {}, onChange = () => {}, settings = () => ({}), timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) } } = {}) {
  const queue = [];
  let current = null;
  let timer = null;
  let hold = false;
  let moved = false; // the camera left its home during this run
  let seq = 0;
  let linger = null; // the queue just emptied: wait a moment before the camera goes home
  const LINGER_MS = 900;

  function cameraFor(ev) {
    const follow = settings().follow ?? 'all';
    if (!camera || follow === 'off') return false;
    return !!ev.at || !!ev.survivorId;
  }

  function next() {
    timers.clear(timer);
    timer = null;
    current = queue.shift() ?? null;
    if (!current) {
      onChange(false, null);
      // Don't fly home between back-to-back actions (several barricades, a bot's next move):
      // if nothing new arrives within LINGER_MS, then go home.
      if (moved) {
        timers.clear(linger);
        linger = timers.set(() => { linger = null; camera?.home(); moved = false; camera?.release?.(); }, LINGER_MS);
      } else camera?.release?.();
      return;
    }
    if (linger) { timers.clear(linger); linger = null; }
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
      if (linger) { timers.clear(linger); linger = null; if (moved && !current) camera?.home(); }
      queue.length = 0;
      const was = current;
      current = null;
      if (was && moved) camera?.home();
      moved = false;
      camera?.release?.();
      if (was) onChange(false, null);
    },
    get busy() { return !!current || queue.length > 0; },
    /** The queue is empty but the camera is still waiting to go home. */
    get settling() { return !!linger; },
    /** Someone else's action is on screen. */
    get watching() { return !!current?.watch && current.kind !== 'turn'; },
    get current() { return current; },
  };
}
