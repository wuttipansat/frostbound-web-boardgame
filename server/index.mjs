// FROSTBOUND online server: serves the built game (dist/) and runs game rooms over WebSocket (/ws).
// The server is authoritative: clients send actions, the server applies them with the same reducer
// and sends every player only their own view. Bots run here too.
//
//   npm run build && npm start            (PORT=8787 by default)
//   npm run dev  (vite proxies /ws to this server)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import { Room, makeCode } from '../src/net/room.js';
import { PHASES } from '../src/core/constants.js';

const PORT = Number(process.env.PORT) || 8787;
const DIST = resolve(process.env.DIST ?? 'dist');
const BOT_DELAY_MS = Number(process.env.BOT_DELAY_MS ?? 900);
const ROOM_TTL_MS = 3 * 60 * 60 * 1000;
const MAX_MESSAGE = 16 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
};

// ---------------------------------------------------------------- static files

const http = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
    let path = normalize(join(DIST, decodeURIComponent(url.pathname)));
    if (!path.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
    if ((await stat(path).catch(() => null))?.isDirectory()) path = join(path, 'index.html');
    const body = await readFile(path).catch(() => null);
    if (!body) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(500); res.end();
  }
});

// ---------------------------------------------------------------- rooms

const rooms = new Map(); // code -> { room, sockets: Map(seat -> ws), timer }

const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };

function broadcastLobby(entry) {
  const lobby = entry.room.lobby();
  for (const ws of entry.sockets.values()) send(ws, { t: 'lobby', lobby });
}

function broadcastState(entry) {
  for (const [seat, ws] of entry.sockets) send(ws, { t: 'state', view: entry.room.view(seat), seat, lobby: entry.room.lobby() });
}

/** Let bots play, one action at a time, slowly enough for everyone to watch. */
function scheduleBots(entry) {
  if (entry.timer) return;
  const { room } = entry;
  if (!room.started || !room.nextBotAction()) return;
  const lastKind = room.state.log.at(-1)?.k;
  // Drafting is instant; after a colony phase give people time to read the report.
  const delay = room.state.phase === PHASES.DRAFT ? 0 : lastKind === 'roundStart' || lastKind === 'crisisResolved' ? BOT_DELAY_MS * 4 : BOT_DELAY_MS;
  entry.timer = setTimeout(() => {
    entry.timer = null;
    if (room.botStep()) broadcastState(entry);
    scheduleBots(entry);
  }, delay);
}

function createRoom(config) {
  let code;
  do code = makeCode(); while (rooms.has(code));
  const entry = { room: new Room(code, config), sockets: new Map(), timer: null };
  rooms.set(code, entry);
  return entry;
}

setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of rooms) {
    if (!entry.sockets.size && now - entry.room.touched > ROOM_TTL_MS) { clearTimeout(entry.timer); rooms.delete(code); }
  }
}, 60_000).unref();

// ---------------------------------------------------------------- sockets

const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: MAX_MESSAGE });

wss.on('connection', (ws) => {
  let entry = null;
  let seat = null;

  const attach = (e, s, token) => {
    entry = e; seat = s;
    entry.sockets.get(seat)?.close(4000, 'replaced'); // the same seat opened in another tab
    entry.sockets.set(seat, ws);
    send(ws, { t: 'joined', code: entry.room.code, seat, token, playerId: entry.room.playerIdOf(seat) });
    if (entry.room.started) broadcastState(entry); else broadcastLobby(entry);
  };

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return send(ws, { t: 'error', code: 'badMessage' }); }
    switch (msg?.t) {
      case 'create': {
        if (entry) return send(ws, { t: 'error', code: 'alreadyInRoom' });
        const e = createRoom(msg.config ?? {});
        const r = e.room.join(msg.name);
        return attach(e, r.seat, r.token);
      }
      case 'join': {
        if (entry) return send(ws, { t: 'error', code: 'alreadyInRoom' });
        const e = rooms.get(String(msg.code ?? '').toUpperCase());
        if (!e) return send(ws, { t: 'error', code: 'noRoom' });
        const r = e.room.join(msg.name);
        if (r.error) return send(ws, { t: 'error', code: r.error });
        return attach(e, r.seat, r.token);
      }
      case 'rejoin': {
        const e = rooms.get(String(msg.code ?? '').toUpperCase());
        const r = e?.room.rejoin(msg.token);
        if (!e || r.error) return send(ws, { t: 'error', code: 'rejoinFailed' });
        return attach(e, r.seat, r.token);
      }
      case 'start': {
        if (!entry) return;
        const r = entry.room.start(seat);
        if (r.error) return send(ws, { t: 'error', code: r.error });
        broadcastState(entry);
        return scheduleBots(entry);
      }
      case 'act': {
        if (!entry) return;
        const r = entry.room.act(seat, msg.action);
        if (!r.ok) return send(ws, { t: 'error', code: r.error, action: msg.action?.type });
        broadcastState(entry);
        return scheduleBots(entry);
      }
      case 'seen': {
        if (!entry) return;
        const r = entry.room.markSeen(seat);
        if (r.error) return undefined;
        broadcastState(entry);
        return scheduleBots(entry);
      }
      case 'leave': {
        if (!entry) return;
        entry.room.leave(seat);
        entry.sockets.delete(seat);
        if (!entry.room.started) broadcastLobby(entry);
        entry = null; seat = null;
        return undefined;
      }
      default:
        return send(ws, { t: 'error', code: 'badMessage' });
    }
  });

  ws.on('close', () => {
    if (!entry || entry.sockets.get(seat) !== ws) return;
    entry.sockets.delete(seat);
    entry.room.leave(seat);
    if (entry.room.started) broadcastState(entry); else broadcastLobby(entry);
  });
});

http.listen(PORT, () => console.log(`FROSTBOUND server on http://localhost:${PORT} (rooms over /ws)`));
