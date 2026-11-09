// Procedural sound: every effect is synthesised with WebAudio (no audio files).
// Safe to import anywhere: without an AudioContext (Node tests, old browsers) every call is a no-op.

const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;

let ctx = null;
let master = null;
let ambient = null;
// Step 21: the ambience follows the scene (storm 0..1 = wind, fire 0..~1.2 = crackle).
const weather = { storm: 0.35, fire: 1 };
export const windGain = (storm) => 0.025 + storm * 0.075;
export const crackleChance = (fire) => Math.max(0, Math.min(0.9, fire * 0.6));

function ensure() {
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// ---------------------------------------------------------------- building blocks

function env(g, t0, attack, decay, peak) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}

/** A pitched blip with optional slide. */
function tone({ f = 440, to = null, dur = 0.2, type = 'sine', gain = 0.3, delay = 0, attack = 0.005 }) {
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  env(g, t0, attack, dur, gain);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + attack + dur + 0.05);
}

let noiseBuf = null;
function noiseBuffer() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/** Filtered noise burst (hits, swishes, rattles). */
function noise({ dur = 0.15, freq = 1200, to = null, q = 0.8, type = 'bandpass', gain = 0.3, delay = 0, attack = 0.003 }) {
  const t0 = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer();
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t0);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = ctx.createGain();
  env(g, t0, attack, dur, gain);
  src.connect(f).connect(g).connect(master);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + attack + dur + 0.05);
}

const chord = (freqs, opts = {}) => freqs.forEach((f, i) => tone({ f, dur: 0.6, gain: 0.12, ...opts, delay: (opts.delay ?? 0) + i * (opts.spread ?? 0.06) }));

// ---------------------------------------------------------------- the sound palette

const SOUNDS = {
  ui: () => tone({ f: 900, to: 1200, dur: 0.05, type: 'triangle', gain: 0.08 }),
  error: () => { tone({ f: 180, dur: 0.12, type: 'square', gain: 0.07 }); tone({ f: 150, dur: 0.14, type: 'square', gain: 0.07, delay: 0.1 }); },
  start: () => chord([262, 330, 392, 523], { type: 'triangle', spread: 0.09, dur: 0.9, gain: 0.1 }),
  roll: () => { for (let i = 0; i < 7; i++) noise({ dur: 0.03, freq: 2500 + Math.random() * 2000, q: 4, gain: 0.25, delay: i * 0.06 + Math.random() * 0.03 }); },
  move: () => { tone({ f: 220, to: 110, dur: 0.09, gain: 0.18 }); noise({ dur: 0.08, freq: 600, gain: 0.08, delay: 0.05 }); },
  attack: () => { noise({ dur: 0.12, freq: 900, q: 0.5, gain: 0.45 }); tone({ f: 120, to: 60, dur: 0.18, type: 'triangle', gain: 0.3 }); },
  search: () => noise({ dur: 0.25, freq: 1800, to: 5000, q: 1.5, gain: 0.12, attack: 0.03 }),
  barricade: () => { for (let i = 0; i < 3; i++) { noise({ dur: 0.05, freq: 700, q: 3, gain: 0.35, delay: i * 0.14 }); tone({ f: 160, to: 120, dur: 0.06, type: 'triangle', gain: 0.15, delay: i * 0.14 }); } },
  clean: () => noise({ dur: 0.35, freq: 1200, to: 400, q: 0.7, gain: 0.12, attack: 0.05 }),
  lure: () => { tone({ f: 600, to: 900, dur: 0.15, type: 'square', gain: 0.05 }); tone({ f: 900, to: 600, dur: 0.15, type: 'square', gain: 0.05, delay: 0.16 }); },
  play: () => tone({ f: 660, to: 880, dur: 0.08, type: 'triangle', gain: 0.1 }),
  contribute: () => { noise({ dur: 0.04, freq: 3000, q: 2, gain: 0.2 }); tone({ f: 330, dur: 0.12, type: 'triangle', gain: 0.06, delay: 0.03 }); },
  flip: () => noise({ dur: 0.06, freq: 3500, to: 1500, q: 1.2, gain: 0.25 }),
  spawn: () => {
    // a groan: low sawtooth with a wobble, through a closing filter
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(95 + Math.random() * 30, t0);
    o.frequency.exponentialRampToValueAtTime(60, t0 + 0.9);
    lfo.frequency.value = 6;
    lg.gain.value = 8;
    lfo.connect(lg).connect(o.frequency);
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t0);
    f.frequency.exponentialRampToValueAtTime(250, t0 + 0.9);
    env(g, t0, 0.15, 0.8, 0.12);
    o.connect(f).connect(g).connect(master);
    o.start(t0); lfo.start(t0);
    o.stop(t0 + 1.1); lfo.stop(t0 + 1.1);
  },
  death: () => [523, 466, 392, 311].forEach((f, i) => tone({ f, dur: 0.35, type: 'triangle', gain: 0.12, delay: i * 0.16 })),
  'exposure:blank': () => tone({ f: 1320, dur: 0.25, gain: 0.06 }),
  'exposure:wound': () => { tone({ f: 140, to: 70, dur: 0.25, type: 'triangle', gain: 0.3 }); noise({ dur: 0.2, freq: 500, gain: 0.15 }); },
  'exposure:frostbite': () => [1568, 2093, 2637].forEach((f, i) => tone({ f, dur: 0.5, gain: 0.05, delay: i * 0.05 })),
  'exposure:bite': () => { noise({ dur: 0.35, freq: 300, q: 0.4, gain: 0.4 }); tone({ f: 90, to: 45, dur: 0.5, type: 'sawtooth', gain: 0.2 }); },
  'crisis:ok': () => chord([392, 494, 587, 784], { type: 'triangle', spread: 0.08, dur: 0.9, gain: 0.11 }),
  'crisis:fail': () => chord([311, 370, 415], { type: 'sawtooth', spread: 0.02, dur: 1.0, gain: 0.05 }),
  roundStart: () => [220, 440, 660].forEach((f, i) => tone({ f, dur: 1.6 - i * 0.4, gain: 0.09 / (i + 1), attack: 0.002 })),
  turnStart: () => tone({ f: 740, dur: 0.12, type: 'triangle', gain: 0.05 }),
  crossroadsTriggered: () => [659, 784, 988, 1319].forEach((f, i) => tone({ f, dur: 0.6, gain: 0.04, delay: i * 0.09 })),
  gameOver: () => chord([262, 311, 392, 466, 523], { type: 'triangle', spread: 0.15, dur: 1.4, gain: 0.08 }),
  starvation: () => tone({ f: 200, to: 120, dur: 0.6, type: 'triangle', gain: 0.12 }),
};

/** Which sound each engine log entry makes (null = silent). */
export function soundForLog(e) {
  switch (e.k) {
    case 'exposure': return SOUNDS[`exposure:${e.face}`] ? `exposure:${e.face}` : 'exposure:wound';
    case 'crisisResolved': return null; // played by the colony-phase reveal, in time with the verdict
    case 'roll': return 'roll';
    case 'move': case 'attack': case 'search': case 'barricade': case 'clean': case 'lure': case 'play':
    case 'contribute': case 'spawn': case 'death': case 'roundStart': case 'turnStart':
    case 'crossroadsTriggered': case 'gameOver': case 'starvation':
      return e.k;
    default: return null;
  }
}

// ---------------------------------------------------------------- ambience: wind + campfire crackle

function startAmbient() {
  if (ambient || !ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer();
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 420;
  const g = ctx.createGain();
  g.gain.value = 0.0001;
  g.gain.exponentialRampToValueAtTime(windGain(weather.storm), ctx.currentTime + 2);
  // slow gusts
  const lfo = ctx.createOscillator();
  const lg = ctx.createGain();
  lfo.frequency.value = 0.08;
  lg.gain.value = 260;
  lfo.connect(lg).connect(f.frequency);
  src.connect(f).connect(g).connect(master);
  src.start();
  lfo.start();
  const crackle = setInterval(() => {
    if (Math.random() < crackleChance(weather.fire)) noise({ dur: 0.02 + Math.random() * 0.03, freq: 2000 + Math.random() * 3000, q: 3, gain: 0.02 + Math.random() * 0.03 });
  }, 140);
  ambient = { src, lfo, g, f, lg, crackle };
}

function stopAmbient() {
  if (!ambient) return;
  const { src, lfo, g, crackle } = ambient;
  clearInterval(crackle);
  g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
  src.stop(ctx.currentTime + 1);
  lfo.stop(ctx.currentTime + 1);
  ambient = null;
}

// ---------------------------------------------------------------- public API

export const SOUND_NAMES = Object.keys(SOUNDS);

export const sound = {
  enabled: true,
  wantAmbient: false,

  /** Call from a user gesture once (browsers block audio until then). */
  unlock() {
    if (!this.enabled || !ensure()) return;
    if (this.wantAmbient) startAmbient();
  },

  play(name, delay = 0) {
    if (!this.enabled || !name || !SOUNDS[name] || !ctx) return;
    if (delay > 0) { setTimeout(() => this.play(name), delay * 1000); return; }
    try { SOUNDS[name](); } catch { /* never let audio break the game */ }
  },

  /** Hidden tab: suspend the audio clock (wind and crackle stop costing anything). */
  pause(on) {
    if (!ctx) return;
    try { if (on) ctx.suspend(); else if (this.enabled) ctx.resume(); } catch { /* ignore */ }
  },

  setEnabled(on) {
    this.enabled = on;
    if (!on) stopAmbient();
    else this.unlock();
  },

  /** Called as the weather eases (cheap: only touches gains when the ambience runs). */
  setWeather(storm, fire) {
    weather.storm = storm; weather.fire = fire;
    if (!ambient || !ctx) return;
    const now = ctx.currentTime;
    ambient.g.gain.setTargetAtTime(windGain(storm), now, 0.8);
    ambient.f.frequency.setTargetAtTime(320 + storm * 520, now, 0.8);
    ambient.lg.gain.setTargetAtTime(180 + storm * 380, now, 0.8);
  },

  setAmbient(on) {
    this.wantAmbient = on;
    if (!on) stopAmbient();
    else if (this.enabled && ctx) startAmbient();
  },
};
