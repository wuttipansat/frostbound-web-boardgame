// Browser side of online play: one WebSocket to the room server, with automatic rejoin after a drop.
import { normalizeSeed } from '../core/rng.js';
import { CRISES } from '../content/crises.js';
import { CROSSROADS } from '../content/crossroads.js';
import { EXILE_OBJECTIVES } from '../content/objectives.js';

const SESSION_KEY = 'frostbound.online.v1';

export function socketUrl(loc = window.location) {
  return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}/ws`;
}

export function savedSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function saveSession(v) {
  try { if (v) sessionStorage.setItem(SESSION_KEY, JSON.stringify(v)); else sessionStorage.removeItem(SESSION_KEY); } catch { /* storage off */ }
}

/**
 * The server sends viewFor(state, seat): no RNG, empty decks, hidden cards. The UI checks moves by
 * running the reducer locally, so give the view harmless stand-ins (a dummy seed, placeholder deck
 * entries of the right size). The result of such a check is only a hint; the server decides.
 */
export function hydrateView(view) {
  const s = structuredClone(view);
  s.rng = normalizeSeed(1);
  for (const [id, loc] of Object.entries(s.locations)) {
    if (loc.deckCount != null) loc.deck = Array.from({ length: loc.deckCount }, (_, i) => `?${id}${i}`);
  }
  const fill = (key, ids) => { if (s[`${key}Count`] != null) s[key] = Array.from({ length: s[`${key}Count`] }, (_, i) => ids[i % ids.length]); };
  fill('crisisDeck', CRISES.map((c) => c.id));
  fill('crossroadsDeck', CROSSROADS.map((c) => c.id));
  fill('exileDeck', EXILE_OBJECTIVES.map((o) => o.id));
  if (s.survivorDeckCount != null) s.survivorDeck = Array.from({ length: s.survivorDeckCount }, (_, i) => `?sv${i}`);
  return s;
}

/**
 * connect({ onMessage, onStatus }) -> { send, create, join, start, act, leave, close }
 * onStatus('open' | 'closed' | 'reconnecting').
 */
export function connect({ url = socketUrl(), onMessage, onStatus = () => {} } = {}) {
  let ws = null;
  let closedByUser = false;
  let retry = 0;
  let queue = [];

  const open = () => {
    ws = new WebSocket(url);
    ws.addEventListener('open', () => {
      retry = 0;
      onStatus('open');
      const sess = savedSession();
      if (sess?.code && sess?.token && !queue.some((m) => m.t === 'create' || m.t === 'join')) ws.send(JSON.stringify({ t: 'rejoin', code: sess.code, token: sess.token }));
      for (const m of queue) ws.send(JSON.stringify(m));
      queue = [];
    });
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.t === 'joined') saveSession({ code: msg.code, token: msg.token });
      if (msg.t === 'error' && msg.code === 'rejoinFailed') saveSession(null);
      onMessage?.(msg);
    });
    ws.addEventListener('close', (ev) => {
      if (closedByUser || ev.code === 4000) { onStatus('closed'); return; }
      onStatus('reconnecting');
      setTimeout(open, Math.min(8000, 500 * 2 ** retry++));
    });
  };
  open();

  const send = (msg) => {
    if (ws?.readyState === 1) ws.send(JSON.stringify(msg));
    else queue.push(msg);
  };
  return {
    send,
    create: (name, config) => send({ t: 'create', name, config }),
    join: (code, name) => send({ t: 'join', code, name }),
    start: () => send({ t: 'start' }),
    act: (action) => send({ t: 'act', action }),
    seen: () => send({ t: 'seen' }),
    leave: () => { send({ t: 'leave' }); saveSession(null); },
    close: () => { closedByUser = true; ws?.close(); },
  };
}

/** Log entries in `next` that `prev` did not have (the log is capped, so match on the last known entry). */
export function newLogEntries(prev, next) {
  if (!prev?.length) return next.slice();
  const last = JSON.stringify(prev.at(-1));
  if (next.length >= prev.length && JSON.stringify(next[prev.length - 1]) === last) return next.slice(prev.length);
  for (let i = next.length - 1; i >= 0; i--) if (JSON.stringify(next[i]) === last) return next.slice(i + 1);
  return [];
}
