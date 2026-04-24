require('dotenv').config();
const express      = require('express');
const http         = require('http');
const { Server }   = require('socket.io');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const crypto       = require('crypto');
const path         = require('path');

const logger   = require('./logger');
const { saveGameSession, getRecentSessions } = require('./db');
const { validateAction, HOST_ONLY_ACTIONS }  = require('./validation');

// ── Config ────────────────────────────────────────────────────────────────────
const PORT        = process.env.PORT || 3001;
const CLIENT_DIST = process.env.CLIENT_DIST
  ? path.resolve(process.env.CLIENT_DIST)
  : path.join(__dirname, '../client/dist');
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:3001'];

// ── Helpers ───────────────────────────────────────────────────────────────────
function randomCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function hashPin(pin) {
  return crypto.createHash('sha256').update(pin.trim().toUpperCase()).digest('hex');
}

function signToken(payload) {
  const secret = process.env.SESSION_SECRET || 'change-me-in-production';
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  try {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    const secret = process.env.SESSION_SECRET || 'change-me-in-production';
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (sig !== expected) return null;
    const [ts, roomCode] = payload.split(':');
    if (Date.now() - parseInt(ts, 10) > 8 * 60 * 60 * 1000) return null;
    return { roomCode };
  } catch { return null; }
}

// ── Room store ────────────────────────────────────────────────────────────────
// Map<roomCode, { pinHash, state, hostSocketId }>
const rooms = new Map();

function buildInitialState() {
  return {
    phase: 'registration',
    tournament: {
      teams: [], currentRound: 'setup',
      currentMatch: 0, matches: [], questionsAnswered: 0
    },
    currentQ: 0, wrong: 0, flippedCards: [], boardScore: 0, pointsAwarded: false
  };
}

function getRoom(roomCode) { return rooms.get(roomCode); }

function broadcastRoom(roomCode) {
  const room = getRoom(roomCode);
  if (!room) return;
  io.to(roomCode).emit('stateSync', room.state);
}

// ── Express ───────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

app.use(helmet({ contentSecurityPolicy: false }));

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    logger.warn('Blocked CORS request', { origin });
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '10kb' }));
app.use(express.static(CLIENT_DIST));

const apiLimiter  = rateLimit({ windowMs: 15*60*1000, max: 100, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 10,  message: { error: 'Too many attempts.' } });
app.use('/api', apiLimiter);

// ── REST API ──────────────────────────────────────────────────────────────────

// State snapshot for a specific room (used on page refresh)
app.get('/api/state', (req, res) => {
  const roomCode = req.query.room?.toUpperCase();
  const room = roomCode && getRoom(roomCode);
  if (!room) return res.json(buildInitialState());
  res.json(room.state);
});

// Generate a new host PIN + room code — creates the room
app.post('/api/auth/setup-pin', authLimiter, (req, res) => {
  const pin      = randomCode(6);
  const roomCode = randomCode(6);
  const pinHash  = hashPin(pin);
  rooms.set(roomCode, { pinHash, state: buildInitialState(), hostSocketId: null });
  logger.info('Room created', { roomCode, ip: req.ip });
  res.json({ pin, roomCode });
});

// Host login — verify PIN for a specific room
app.post('/api/auth/host', authLimiter, (req, res) => {
  const { pin, roomCode } = req.body;
  if (!pin || !roomCode) return res.status(400).json({ error: 'PIN and room code are required' });
  const room = getRoom(roomCode.toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (hashPin(pin) !== room.pinHash) {
    logger.warn('Failed host login', { ip: req.ip, roomCode });
    return res.status(401).json({ error: 'Invalid PIN' });
  }
  const token = signToken(`${Date.now()}:${roomCode.toUpperCase()}`);
  logger.info('Host authenticated', { ip: req.ip, roomCode });
  res.json({ token, roomCode: roomCode.toUpperCase() });
});

// Audience join — validate room exists
app.post('/api/auth/audience', authLimiter, (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Room code is required' });
  const room = getRoom(code.trim().toUpperCase());
  if (!room) {
    logger.warn('Failed audience join — room not found', { ip: req.ip, code });
    return res.status(404).json({ error: 'Room not found. Check the code and try again.' });
  }
  logger.info('Audience joined', { ip: req.ip, roomCode: code.toUpperCase() });
  res.json({ success: true, roomCode: code.trim().toUpperCase() });
});

// Admin: DB overview (requires valid host token)
app.get('/api/admin/db', requireHostToken, (req, res) => {
  const sessions = getRecentSessions();
  const activeRooms = [...rooms.entries()].map(([code, r]) => ({
    code, phase: r.state.phase, teams: r.state.tournament.teams
  }));
  res.json({ activeRooms, recentSessions: sessions });
});

// DEV: reset all rooms
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/dev/reset', (req, res) => {
    rooms.clear();
    logger.warn('DEV: all rooms cleared');
    res.json({ ok: true });
  });
}

// ── Token middleware ──────────────────────────────────────────────────────────
function requireHostToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const decoded = verifyToken(auth.slice(7));
  if (!decoded) return res.status(401).json({ error: 'Invalid or expired token' });
  req.roomCode = decoded.roomCode;
  next();
}

// ── Socket.io ─────────────────────────────────────────────────────────────────
const io = new Server(server, { cors: { origin: ALLOWED_ORIGINS, credentials: true } });

// socketRooms: Map<socketId, roomCode>
const socketRooms    = new Map();
const hostSockets    = new Set(); // socket IDs that are authenticated hosts
const socketCounts   = new Map(); // rate limiting

function isRateLimited(socketId) {
  const now = Date.now();
  const e = socketCounts.get(socketId) || { count: 0, windowStart: now };
  if (now - e.windowStart > 10_000) { e.count = 1; e.windowStart = now; }
  else e.count++;
  socketCounts.set(socketId, e);
  return e.count > 30;
}

io.on('connection', (socket) => {
  logger.info('Client connected', { socketId: socket.id });

  // Client must join a room first
  socket.on('joinRoom', ({ roomCode, token }) => {
    const code = roomCode?.toUpperCase();
    const room = getRoom(code);
    if (!room) {
      socket.emit('roomError', { message: 'Room not found' });
      return;
    }
    socket.join(code);
    socketRooms.set(socket.id, code);

    // If a valid host token is provided, authenticate as host
    if (token) {
      const decoded = verifyToken(token);
      if (decoded?.roomCode === code) {
        hostSockets.add(socket.id);
        room.hostSocketId = socket.id;
        socket.emit('hostAuthResult', { success: true });
        logger.info('Host socket joined room', { socketId: socket.id, roomCode: code });
      } else {
        socket.emit('hostAuthResult', { success: false, error: 'Invalid token' });
      }
    }

    // Send current room state
    socket.emit('stateSync', room.state);
    logger.info('Socket joined room', { socketId: socket.id, roomCode: code });
  });

  socket.on('action', (action) => {
    const roomCode = socketRooms.get(socket.id);
    if (!roomCode) { socket.emit('error', { message: 'Not in a room' }); return; }

    if (isRateLimited(socket.id)) {
      logger.warn('Socket rate limited', { socketId: socket.id });
      return;
    }

    if (HOST_ONLY_ACTIONS.has(action?.type) && !hostSockets.has(socket.id)) {
      socket.emit('error', { message: 'Host authentication required' });
      return;
    }

    const { valid, error } = validateAction(action);
    if (!valid) { socket.emit('error', { message: error }); return; }

    try {
      handleAction(roomCode, action);
    } catch (err) {
      logger.error('Action error', { roomCode, action: action?.type, error: err.message });
      socket.emit('error', { message: 'Server error' });
    }
  });

  socket.on('disconnect', () => {
    hostSockets.delete(socket.id);
    socketRooms.delete(socket.id);
    socketCounts.delete(socket.id);
    logger.info('Client disconnected', { socketId: socket.id });
  });
});

// ── Action handlers ───────────────────────────────────────────────────────────
function handleAction(roomCode, action) {
  const room = getRoom(roomCode);
  if (!room) return;
  const gs = room.state;

  switch (action.type) {
    case 'START_TOURNAMENT': {
      const teams = action.teams.map((name, i) => ({ id: i, name: name || `Team ${i+1}`, score: 0 }));
      gs.tournament.teams = teams;
      gs.tournament.currentRound = 'round1';
      gs.tournament.matches = [
        { team1: 0, team2: 1, questions: 4 },
        { team1: 2, team2: 3, questions: 4 },
        { team1: 4, team2: 5, questions: 4 }
      ];
      gs.tournament.currentMatch = 0;
      gs.tournament.questionsAnswered = 0;
      gs.currentQ = 0; gs.wrong = 0; gs.flippedCards = []; gs.boardScore = 0;
      gs.phase = 'game';
      logger.info('Tournament started', { roomCode, teams: teams.map(t => t.name) });
      break;
    }
    case 'FLIP_CARD': {
      const idx = gs.flippedCards.indexOf(action.cardIndex);
      if (idx === -1) gs.flippedCards.push(action.cardIndex);
      else gs.flippedCards.splice(idx, 1);
      gs.boardScore = action.boardScore ?? gs.boardScore;
      break;
    }
    case 'WRONG': {
      if (gs.wrong < 3) gs.wrong++;
      break;
    }
    case 'NEXT_QUESTION': {
      gs.tournament.questionsAnswered++;
      gs.wrong = 0; gs.flippedCards = []; gs.boardScore = 0; gs.pointsAwarded = false;
      const match = gs.tournament.matches[gs.tournament.currentMatch];
      if (gs.tournament.questionsAnswered >= match.questions) {
        gs.tournament.currentMatch++;
        gs.tournament.questionsAnswered = 0;
        if (gs.tournament.currentMatch >= gs.tournament.matches.length) {
          if (gs.tournament.currentRound === 'round1') {
            gs.phase = 'leaderboard';
          } else if (gs.tournament.currentRound === 'semifinal') {
            _setupFinal(gs);
          } else if (gs.tournament.currentRound === 'final') {
            gs.phase = 'winner';
            saveGameSession(gs);
          }
        } else { gs.currentQ++; }
      } else { gs.currentQ++; }
      break;
    }
    case 'AWARD_TEAM': {
      const { teamNum, points } = action;
      const match = gs.tournament.matches[gs.tournament.currentMatch];
      const teamIdx = teamNum === 1 ? match.team1 : match.team2;
      gs.tournament.teams[teamIdx].score += points;
      gs.boardScore = 0; gs.pointsAwarded = true;
      break;
    }
    case 'PROCEED_TO_SEMIFINAL': {
      const sorted = [...gs.tournament.teams].sort((a, b) => b.score - a.score);
      gs.tournament.teams[sorted[1].id].score = 0;
      gs.tournament.teams[sorted[2].id].score = 0;
      gs.tournament.currentRound = 'semifinal';
      gs.tournament.matches = [{ team1: sorted[1].id, team2: sorted[2].id, questions: 3 }];
      gs.tournament.currentMatch = 0; gs.tournament.questionsAnswered = 0;
      gs.currentQ++; gs.wrong = 0; gs.flippedCards = []; gs.boardScore = 0;
      gs.phase = 'game';
      break;
    }
    case 'RESTART': {
      saveGameSession(gs);
      room.state = buildInitialState();
      logger.info('Game restarted', { roomCode });
      break;
    }
  }

  broadcastRoom(roomCode);
}

function _setupFinal(gs) {
  const sorted = [...gs.tournament.teams].sort((a, b) => b.score - a.score);
  const rank1  = sorted[0].id;
  const match  = gs.tournament.matches[0];
  const t1 = gs.tournament.teams[match.team1];
  const t2 = gs.tournament.teams[match.team2];
  const winner   = t1.score > t2.score ? match.team1 : match.team2;
  const opponent = winner === rank1 ? sorted[1].id : rank1;
  gs.tournament.teams[winner].score = 0;
  gs.tournament.teams[opponent].score = 0;
  gs.tournament.currentRound = 'final';
  gs.tournament.matches = [{ team1: winner, team2: opponent, questions: 3 }];
  gs.tournament.currentMatch = 0; gs.tournament.questionsAnswered = 0;
  gs.currentQ++; gs.wrong = 0; gs.flippedCards = []; gs.boardScore = 0;
  gs.phase = 'game';
}

// ── Error handlers ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error('Express error', { error: err.message, path: req.path });
  res.status(500).json({ error: 'Internal server error' });
});
process.on('uncaughtException',  (err) => { logger.error('Uncaught exception',  { error: err.message }); process.exit(1); });
process.on('unhandledRejection', (r)   => { logger.error('Unhandled rejection', { reason: String(r) }); });

app.get('*', (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));

server.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
  const fs = require('fs');
  if (!fs.existsSync(CLIENT_DIST)) logger.error(`CLIENT DIST NOT FOUND at ${CLIENT_DIST}`);
  else logger.info(`Serving client from ${CLIENT_DIST}`);
});
