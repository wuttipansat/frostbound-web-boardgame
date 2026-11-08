// An online game room: seats, the authoritative GameState, and the bots. No sockets here — the server
// (server/index.mjs) moves messages in and out, so all of this runs (and is tested) in plain Node.
//
// Every player only ever receives viewFor(state, theirSeat): other hands, objectives, face-down crisis
// cards, deck order and the RNG never leave the server.
import { createGame } from '../core/state.js';
import { tryReduce } from '../core/reducer.js';
import { viewFor } from '../core/view.js';
import { getPlayer, pendingActors } from '../core/selectors.js';
import { PHASES, RULES } from '../core/constants.js';
import { botAction } from '../ai/simpleBot.js';
import { mulberry } from '../ai/simulate.js';

export const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeCode(random = Math.random, len = 4) {
  return Array.from({ length: len }, () => ROOM_CODE_CHARS[Math.floor(random() * ROOM_CODE_CHARS.length)]).join('');
}

const makeToken = (random) => Array.from({ length: 24 }, () => Math.floor(random() * 36).toString(36)).join('');
const cleanName = (name, fallback) => String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 18) || fallback;

export class Room {
  /**
   * @param {string} code
   * @param {{ count: number, ai: boolean[], scenarioId: string, betrayer: string, seed?: number }} config
   *   ai[i] marks seat i as a bot. Seat 0 is the host and always human.
   */
  constructor(code, config, { random = Math.random } = {}) {
    const count = Math.max(RULES.MIN_PLAYERS, Math.min(RULES.MAX_PLAYERS, Number(config.count) || 2));
    this.code = code;
    this.random = random;
    this.config = { scenarioId: config.scenarioId ?? 'beacon', betrayer: config.betrayer ?? 'maybe', seed: config.seed ?? Math.floor(random() * 2 ** 31) };
    this.seats = Array.from({ length: count }, (_, i) => ({
      isAI: i > 0 && !!config.ai?.[i], name: null, token: null, connected: false,
    }));
    this.state = null;
    this.botRandom = mulberry(this.config.seed >>> 0);
    this.touched = Date.now();
    this.seen = new Set(); // seats whose humans have looked at their secret objective (step 19)
  }

  get started() { return !!this.state; }
  get host() { return 0; }

  /** After the draft, play waits until every human has looked at their secret objective. */
  get ready() {
    if (!this.state || this.state.phase === PHASES.DRAFT) return true;
    return this.seats.every((s, i) => s.isAI || this.seen.has(i));
  }

  markSeen(seat) {
    if (!this.state || this.state.phase === PHASES.DRAFT || this.seats[seat]?.isAI) return { error: 'notNow' };
    this.seen.add(seat);
    return { ok: true };
  }

  /** Take the first free human seat. Returns { seat, token } or { error }. */
  join(name) {
    if (this.started) return { error: 'roomStarted' };
    const seat = this.seats.findIndex((s) => !s.isAI && !s.token);
    if (seat < 0) return { error: 'roomFull' };
    const token = makeToken(this.random);
    Object.assign(this.seats[seat], { name: cleanName(name, `Player ${seat + 1}`), token, connected: true });
    this.touched = Date.now();
    return { seat, token };
  }

  /** Come back to a seat after a reload or a dropped connection. */
  rejoin(token) {
    const seat = this.seats.findIndex((s) => s.token && s.token === token);
    if (seat < 0) return { error: 'badToken' };
    this.seats[seat].connected = true;
    return { seat, token };
  }

  leave(seat) {
    const s = this.seats[seat];
    if (!s) return;
    if (this.started) { s.connected = false; return; } // keep the seat so they can rejoin
    Object.assign(s, { name: null, token: null, connected: false });
  }

  /** Public lobby info (no tokens). */
  lobby() {
    return {
      code: this.code,
      started: this.started,
      scenarioId: this.config.scenarioId,
      betrayer: this.config.betrayer,
      seats: this.seats.map((s, i) => ({ seat: i, isAI: s.isAI, name: s.isAI ? null : s.name, taken: s.isAI || !!s.token, connected: s.isAI || s.connected, seen: s.isAI || this.seen.has(i) })),
    };
  }

  canStart() { return !this.started && this.seats.every((s) => s.isAI || s.token); }

  start(bySeat) {
    if (bySeat !== this.host) return { error: 'notHost' };
    if (!this.canStart()) return { error: 'seatsOpen' };
    this.state = createGame({
      players: this.seats.map((s, i) => ({ name: s.isAI ? `Bot ${i + 1}` : s.name, isAI: s.isAI })),
      scenarioId: this.config.scenarioId, betrayer: this.config.betrayer, seed: this.config.seed,
    });
    return { ok: true };
  }

  playerIdOf(seat) { return `p${seat}`; }

  /** A player's action. Only actions on their own behalf are accepted. */
  act(seat, action) {
    if (!this.started) return { ok: false, error: 'notStarted' };
    if (!action || typeof action !== 'object' || action.playerId !== this.playerIdOf(seat)) return { ok: false, error: 'notYourSeat' };
    if (this.seats[seat]?.isAI) return { ok: false, error: 'notYourSeat' };
    if (!this.ready) return { ok: false, error: 'waitingObjectives' };
    const res = tryReduce(this.state, action);
    if (!res.ok) return { ok: false, error: res.error };
    this.state = res.state;
    this.touched = Date.now();
    return { ok: true };
  }

  /** The next thing a bot should do (answer a request, draft, choose, vote, take its turn), or null. */
  nextBotAction() {
    const s = this.state;
    if (!s || s.phase === PHASES.GAME_OVER || !this.ready) return null;
    const req = s.requests.find((r) => getPlayer(s, r.to).isAI);
    if (req) {
      const a = botAction(s, req.to, { random: this.botRandom });
      return a?.type === 'RESPOND_REQUEST' ? a : { type: 'RESPOND_REQUEST', playerId: req.to, requestId: req.id, cardUid: null };
    }
    const bot = pendingActors(s).find((id) => getPlayer(s, id).isAI);
    // In a turn, a bot only moves when it is the active player (a human asked mid-turn waits for no one).
    if (!bot) return null;
    return botAction(s, bot, { random: this.botRandom }) ?? (s.phase === PHASES.TURN ? { type: 'END_TURN', playerId: bot } : null);
  }

  /** Run one bot action; a bot that gets stuck ends its turn. Returns the action applied, or null. */
  botStep() {
    const action = this.nextBotAction();
    if (!action) return null;
    let res = tryReduce(this.state, action);
    if (!res.ok && this.state.phase === PHASES.TURN && getPlayer(this.state, this.state.activePlayerId).isAI) {
      res = tryReduce(this.state, { type: 'END_TURN', playerId: this.state.activePlayerId });
    }
    if (!res.ok) return null;
    this.state = res.state;
    return action;
  }

  view(seat) { return this.state ? viewFor(this.state, this.playerIdOf(seat)) : null; }
}
