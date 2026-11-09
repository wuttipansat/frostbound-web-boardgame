import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventsFromLog, durationFor, createDirector } from '../src/ui/director.js';
import { createGame } from '../src/core/state.js';
import { tryReduce } from '../src/core/reducer.js';
import { botAction } from '../src/ai/simpleBot.js';
import { mulberry } from '../src/ai/simulate.js';
import { newLogEntries } from '../src/ui/app.js';

const state = {
  survivors: { a: { location: 'grocery' }, b: { location: 'police' } },
};

test('log entries become scenes, in order', () => {
  const ev = eventsFromLog([
    { k: 'turnStart' },
    { k: 'move', survivorId: 'b', from: 'colony', to: 'police', safe: false },
    { k: 'exposure', survivorId: 'b', face: 'frostbite' },
    { k: 'attack', survivorId: 'b', locationId: 'police', killed: 1, die: 4 },
    { k: 'search', survivorId: 'b', locationId: 'police', count: 2, die: 5 },
    { k: 'barricade', locationId: 'police', n: 1 },
    { k: 'morale', delta: -1 },
  ], state);
  assert.deepEqual(ev.map((e) => e.kind), ['turn', 'move', 'exposure', 'attack', 'search', 'barricade']);
  assert.ok(ev.every((e) => !e.watch), 'solo: every move is your own');
  assert.equal(ev[1].at, 'police');
  assert.equal(ev[3].n, 1);
  assert.equal(ev[4].n, 2);
});

test('a real game: every scene comes from log entries and names no card uid', () => {
  let s = createGame({ scenarioId: 'beacon', seed: 11 });
  const random = mulberry(2);
  const uids = new Set(Object.keys(s.cards));
  let scenes = 0;
  for (let i = 0; i < 600 && s.phase !== 'gameOver'; i++) {
    const res = tryReduce(s, botAction(s, { random }));
    if (!res.ok) break;
    const added = newLogEntries(s.log, res.state.log);
    s = res.state;
    for (const e of eventsFromLog(added, s, 'p0')) {
      scenes++;
      for (const v of Object.values(e)) assert.ok(!(typeof v === 'string' && uids.has(v)), `${e.kind} leaks a card uid`);
    }
  }
  assert.ok(scenes > 20);
});

test('durations: fast is shorter, holding is shorter still, and nothing holds longer than 4 s', () => {
  const ev = { kind: 'attack', watch: true };
  assert.ok(durationFor(ev, { speed: 'fast' }) < durationFor(ev));
  assert.ok(durationFor(ev, { hold: true }) < durationFor(ev, { speed: 'fast' }));
  assert.ok(durationFor({ kind: 'move', watch: false }) < durationFor({ kind: 'move', watch: true }));
  for (const kind of ['move', 'attack', 'search', 'exposure', 'lure']) assert.ok(durationFor({ kind, watch: true }) <= 4);
});

function fakeTimers() {
  const list = [];
  return {
    set: (fn, ms) => { const t = { fn, ms }; list.push(t); return t; },
    clear: (t) => { const i = list.indexOf(t); if (i >= 0) list.splice(i, 1); },
    runNext() { const t = list.shift(); t?.fn(); return !!t; },
    get pending() { return list.length; },
  };
}

test('the queue plays scenes one by one, moves the camera, then goes home and is idle', () => {
  const timers = fakeTimers();
  const cam = { focus: [], home: 0, release: 0 };
  const played = [];
  const d = createDirector({
    timers,
    camera: { focus: (ev) => cam.focus.push(ev.kind), home: () => cam.home++, release: () => cam.release++ },
    play: (ev) => played.push(ev.kind),
    settings: () => ({ follow: 'all', speed: 'normal' }),
  });
  d.push(eventsFromLog([
    { k: 'move', survivorId: 'b', from: 'colony', to: 'police' },
    { k: 'attack', survivorId: 'b', locationId: 'police', killed: 1 },
    { k: 'move', survivorId: 'a', from: 'colony', to: 'grocery' },
  ], state));
  assert.ok(d.busy && !d.watching, 'own moves never block input');
  assert.deepEqual(played, ['move']);
  while (timers.runNext());
  assert.deepEqual(played, ['move', 'attack', 'move']);
  assert.deepEqual(cam.focus, ['move', 'attack', 'move']);
  assert.equal(cam.home, 1);
  assert.ok(!d.busy, 'idle');
});

test('skip, clear and "camera off"', () => {
  const timers = fakeTimers();
  const focus = [];
  const d = createDirector({ timers, camera: { focus: (ev) => focus.push(ev), home() {} }, settings: () => ({ follow: 'off' }) });
  d.push(eventsFromLog([{ k: 'attack', locationId: 'police', killed: 1 }, { k: 'search', locationId: 'police', count: 1 }], state));
  d.skip();
  assert.equal(d.current.kind, 'search');
  d.clear();
  assert.ok(!d.busy && timers.pending === 0);
  assert.equal(focus.length, 0, 'camera off: never moved');
});

test('back-to-back actions: the camera lingers instead of flying home between them', () => {
  const timers = fakeTimers();
  const cam = { focus: 0, home: 0 };
  const d = createDirector({
    timers,
    camera: { focus: () => cam.focus++, home: () => cam.home++, release() {} },
    settings: () => ({ follow: 'all', speed: 'normal' }),
  });
  const barricade = () => eventsFromLog([{ k: 'barricade', locationId: 'police', n: 1 }], state);
  d.push(barricade());
  timers.runNext(); // scene ends, queue empty → linger timer, not home
  assert.equal(cam.home, 0);
  assert.ok(!d.busy, 'not busy while lingering');
  d.push(barricade()); // the next barricade arrives during the linger
  while (timers.runNext());
  assert.equal(cam.home, 1, 'home once, at the very end');
});
