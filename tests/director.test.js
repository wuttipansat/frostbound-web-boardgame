import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventsFromLog, durationFor, createDirector } from '../src/ui/director.js';
import { createGame } from '../src/core/state.js';
import { tryReduce } from '../src/core/reducer.js';
import { botAction } from '../src/ai/simpleBot.js';
import { mulberry } from '../src/ai/simulate.js';
import { pendingActors } from '../src/core/selectors.js';
import { newLogEntries } from '../src/net/client.js';

const state = {
  activePlayerId: 'p1',
  survivors: { a: { owner: 'p0', location: 'grocery' }, b: { owner: 'p1', location: 'police' } },
};

test('log entries become scenes, in order, attributed to a player', () => {
  const ev = eventsFromLog([
    { k: 'turnStart', playerId: 'p1' },
    { k: 'move', playerId: 'p1', survivorId: 'b', from: 'colony', to: 'police', safe: false },
    { k: 'exposure', survivorId: 'b', face: 'frostbite' },
    { k: 'attack', playerId: 'p1', survivorId: 'b', locationId: 'police', killed: 1, die: 4 },
    { k: 'search', playerId: 'p1', survivorId: 'b', locationId: 'police', count: 2, die: 5 },
    { k: 'barricade', locationId: 'police', n: 1 },
    { k: 'morale', delta: -1 },
  ], state, 'p0');
  assert.deepEqual(ev.map((e) => e.kind), ['turn', 'move', 'exposure', 'attack', 'search', 'barricade']);
  assert.ok(ev.every((e) => e.playerId === 'p1' && e.watch), 'all of it is p1, watched from p0');
  assert.equal(ev[1].at, 'police');
  assert.equal(ev[3].n, 1);
  assert.equal(ev[4].n, 2);
});

test('your own moves are not "watched"; with no viewer everything is', () => {
  const entries = [{ k: 'move', playerId: 'p0', survivorId: 'a', from: 'colony', to: 'grocery' }];
  assert.equal(eventsFromLog(entries, state, 'p0')[0].watch, false);
  assert.equal(eventsFromLog(entries, state, null)[0].watch, true);
});

test('scenes of other players never carry a hidden card', () => {
  const ev = eventsFromLog([
    { k: 'search', playerId: 'p1', survivorId: 'b', locationId: 'police', count: 1 },
    { k: 'contribute', playerId: 'p1' },
  ], state, 'p0');
  for (const e of ev) {
    assert.equal(e.card, undefined);
    assert.ok(!Object.values(e).some((v) => typeof v === 'string' && /^c\d+$/.test(v)), 'no card uid');
  }
});

test('a real game: every scene comes from public log entries and names no card uid', () => {
  let s = createGame({ players: [{ name: 'A', isAI: true }, { name: 'B', isAI: true }], scenarioId: 'beacon', seed: 11 });
  const random = mulberry(2);
  const uids = new Set(Object.keys(s.cards));
  let scenes = 0;
  for (let i = 0; i < 600 && s.phase !== 'gameOver'; i++) {
    const who = s.requests[0]?.to ?? pendingActors(s)[0];
    const res = tryReduce(s, botAction(s, who, { random }));
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

test('the queue plays scenes one by one, moves the camera for others only, then goes home and is idle', () => {
  const timers = fakeTimers();
  const cam = { focus: [], home: 0, release: 0 };
  const played = [];
  const d = createDirector({
    timers,
    camera: { focus: (ev) => cam.focus.push(ev.kind), home: () => cam.home++, release: () => cam.release++ },
    play: (ev) => played.push(ev.kind),
    settings: () => ({ follow: 'others', speed: 'normal' }),
  });
  d.push(eventsFromLog([
    { k: 'move', playerId: 'p1', survivorId: 'b', from: 'colony', to: 'police' },
    { k: 'attack', playerId: 'p1', survivorId: 'b', locationId: 'police', killed: 1 },
    { k: 'move', playerId: 'p0', survivorId: 'a', from: 'colony', to: 'grocery' },
  ], state, 'p0'));
  assert.ok(d.busy && d.watching);
  assert.deepEqual(played, ['move']);
  while (timers.runNext());
  assert.deepEqual(played, ['move', 'attack', 'move']);
  assert.deepEqual(cam.focus, ['move', 'attack'], 'your own move does not move the camera');
  assert.equal(cam.home, 1);
  assert.ok(!d.busy, 'idle: a bot may play on');
});

test('skip, clear and "camera off"', () => {
  const timers = fakeTimers();
  const focus = [];
  const d = createDirector({ timers, camera: { focus: (ev) => focus.push(ev), home() {} }, settings: () => ({ follow: 'off' }) });
  d.push(eventsFromLog([{ k: 'attack', playerId: 'p1', locationId: 'police', killed: 1 }, { k: 'search', playerId: 'p1', locationId: 'police', count: 1 }], state, 'p0'));
  d.skip();
  assert.equal(d.current.kind, 'search');
  d.clear();
  assert.ok(!d.busy && timers.pending === 0);
  assert.equal(focus.length, 0, 'camera off: never moved');
});
