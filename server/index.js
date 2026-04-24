require('dotenv').config();
const express      = require('express');
const http         = require('http');
const { Server }   = require('socket.io');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const crypto       = require('crypto');
const path         = require('path');

const logger     = require('./logger');
const { saveGameSession, getRecentSessions, getStoredPin, storePin } = require('./db');
const { validateAction, sanitizeString, HOST_ONLY_ACTIONS } = require('./validation');

// ── Config ────────────────────────────────────────────────────────────────────
const PORT        = process.env.PORT || 3001;
const CLIENT_DIST = process.env.CLIENT_DIST
  ? path.resolve(process.env.CLIENT_DIST)
  : path.join(__dirname, '../client/dist');
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:3001'];

// 6-char alphanumeric PIN generator (uppercase + digits, no ambiguous chars)
function generatePin() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let pin = '';
  for (let i = 0; i < 6; i++) pin += chars[Math.floor(Math.random() * chars.length)];
  return pin;
}

function hashPin(pin) {
  return crypto.createHash('sha256').update(pin.trim().toUpperCase()).digest('hex');
}

// Load stored PIN hash (null if none set yet)
let currentPinHash = getStoredPin();

// ── Room code (audience join code) ───────────────────────────────────────────
// Generated fresh each time the host authenticates. 6 uppercase chars.
let currentRoomCode = null;

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1 confusion
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ── Express setup ─────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

// Security headers (relaxed for Socket.io & React assets)
app.use(helmet({
  contentSecurityPolicy: false // configure properly once you have a domain
}));

// CORS — locked to known origins
const corsOptions = {
  origin: (origin, cb) => {
    // Allow same-origin requests (no origin header) and listed origins
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    logger.warn('Blocked CORS request', { origin });
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '10kb' })); // prevent large payload attacks

// Rate limiting — general API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' }
});

// Stricter limiter for auth endpoint
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts, try again later.' }
});

app.use('/api', apiLimiter);

// Serve the built React app
app.use(express.static(CLIENT_DIST));

// ── Game state ────────────────────────────────────────────────────────────────
let gameState = buildInitialState();

function buildInitialState() {
  return {
    phase: 'registration',
    tournament: {
      teams: [],
      currentRound: 'setup',
      currentMatch: 0,
      matches: [],
      questionsAnswered: 0
    },
    currentQ: 0,
    wrong: 0,
    flippedCards: [],
    boardScore: 0,
    pointsAwarded: false
  };
}

function resetState() {
  gameState = buildInitialState();
}

// ── REST API ──────────────────────────────────────────────────────────────────

// Public: game state snapshot (for page refresh)
app.get('/api/state', (req, res) => {
  res.json(gameState);
});

// Public: check whether a host PIN has been set up yet
app.get('/api/auth/pin-status', (req, res) => {
  res.json({ exists: !!currentPinHash });
});

// DEV ONLY: clear the PIN so setup screen shows again (remove before production)
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/dev/reset-pin', (req, res) => {
    const { clearPin } = require('./db');
    currentPinHash = null;
    clearPin();
    logger.warn('DEV: PIN cleared via reset endpoint');
    res.json({ ok: true });
  });
}

// Public: generate a PIN — no secret required, anyone can become a host
app.post('/api/auth/setup-pin', authLimiter, (req, res) => {
  const pin = generatePin();
  currentPinHash = hashPin(pin);
  storePin(currentPinHash);
  logger.info('Host PIN generated', { ip: req.ip });
  res.json({ pin });
});

// Public: verify host PIN — returns a session token + room code on success
app.post('/api/auth/host', authLimiter, (req, res) => {
  const { pin } = req.body;
  if (!pin || typeof pin !== 'string') {
    return res.status(400).json({ error: 'PIN is required' });
  }
  if (!currentPinHash) {
    return res.status(403).json({ error: 'No PIN configured. Please set up a PIN first.' });
  }
  if (hashPin(pin) !== currentPinHash) {
    logger.warn('Failed host login attempt', { ip: req.ip });
    return res.status(401).json({ error: 'Invalid PIN' });
  }
  const secret = process.env.SESSION_SECRET || 'change-me-in-production';
  const payload = Date.now().toString();
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const token = `${payload}.${sig}`;
  currentRoomCode = generateRoomCode();
  logger.info('Host authenticated', { ip: req.ip, roomCode: currentRoomCode });
  res.json({ token, roomCode: currentRoomCode });
});

// Protected: regenerate PIN — host must already be logged in
app.post('/api/auth/regenerate-pin', requireHostToken, (req, res) => {
  const pin = generatePin();
  currentPinHash = hashPin(pin);
  storePin(currentPinHash);
  logger.info('Host PIN regenerated', { ip: req.ip });
  res.json({ pin });
});

// Public: audience join — validate room code
app.post('/api/auth/audience', authLimiter, (req, res) => {
  const { code } = req.body;
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Room code is required' });
  }
  if (!currentRoomCode) {
    return res.status(404).json({ error: 'No active game room. Ask the host to log in first.' });
  }
  if (code.trim().toUpperCase() !== currentRoomCode) {
    logger.warn('Failed audience join attempt', { ip: req.ip, code });
    return res.status(401).json({ error: 'Invalid room code' });
  }
  logger.info('Audience member joined', { ip: req.ip });
  res.json({ success: true });
});

// Public: get current room code status (just whether one exists, not the code itself)
app.get('/api/room/status', (req, res) => {
  res.json({ active: !!currentRoomCode });
});

// Admin: recent game sessions
app.get('/api/admin/sessions', requireHostToken, (req, res) => {
  res.json(getRecentSessions());
});

// Admin: DB overview — sessions + current room status
app.get('/api/admin/db', requireHostToken, (req, res) => {
  const sessions = getRecentSessions();
  res.json({
    currentRoom: {
      code: currentRoomCode,
      active: !!currentRoomCode,
      gamePhase: gameState.phase,
      teams: gameState.tournament.teams
    },
    recentSessions: sessions,
    totalSessions: sessions.length
  });
});

// Admin: update PIN
app.post('/api/admin/pin', requireHostToken, (req, res) => {
  const { newPin } = req.body;
  if (!newPin || typeof newPin !== 'string' || newPin.length < 4) {
    return res.status(400).json({ error: 'New PIN must be at least 4 characters' });
  }
  const hash = crypto.createHash('sha256').update(newPin.trim()).digest('hex');
  storePin(hash);
  currentPinHash = hash;
  logger.info('Host PIN updated', { ip: req.ip });
  res.json({ success: true });
});

// ── Token middleware ──────────────────────────────────────────────────────────
function requireHostToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!verifyToken(auth.slice(7))) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  next();
}

function verifyToken(token) {
  try {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return false;
    const secret = process.env.SESSION_SECRET || 'change-me-in-production';
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (sig !== expected) return false;
    // Token expires after 8 hours
    const age = Date.now() - parseInt(payload, 10);
    return age < 8 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

// ── Socket.io ─────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true
  }
});

// Track which socket IDs are authenticated hosts
const authenticatedHosts = new Set();

// Socket rate limiting — max 30 actions per 10 seconds per socket
const socketActionCounts = new Map();
function isSocketRateLimited(socketId) {
  const now = Date.now();
  const entry = socketActionCounts.get(socketId) || { count: 0, windowStart: now };
  if (now - entry.windowStart > 10_000) {
    entry.count = 1;
    entry.windowStart = now;
  } else {
    entry.count++;
  }
  socketActionCounts.set(socketId, entry);
  return entry.count > 30;
}

io.on('connection', (socket) => {
  logger.info('Client connected', { socketId: socket.id });

  // Send current state immediately
  socket.emit('stateSync', gameState);

  // Host authentication over socket
  socket.on('hostAuth', ({ token }) => {
    if (verifyToken(token)) {
      authenticatedHosts.add(socket.id);
      socket.emit('hostAuthResult', { success: true });
      logger.info('Host socket authenticated', { socketId: socket.id });
    } else {
      socket.emit('hostAuthResult', { success: false, error: 'Invalid token' });
      logger.warn('Failed host socket auth', { socketId: socket.id });
    }
  });

  socket.on('action', (action) => {
    // Rate limit check
    if (isSocketRateLimited(socket.id)) {
      logger.warn('Socket rate limited', { socketId: socket.id, action: action?.type });
      return;
    }

    // Host-only action guard
    if (HOST_ONLY_ACTIONS.has(action?.type) && !authenticatedHosts.has(socket.id)) {
      logger.warn('Unauthorized action attempt', { socketId: socket.id, action: action?.type });
      socket.emit('error', { message: 'Host authentication required' });
      return;
    }

    // Validate & sanitize
    const { valid, error } = validateAction(action);
    if (!valid) {
      logger.warn('Invalid action rejected', { socketId: socket.id, action, error });
      socket.emit('error', { message: error });
      return;
    }

    try {
      handleAction(action);
    } catch (err) {
      logger.error('Error handling action', { action: action?.type, error: err.message, stack: err.stack });
      socket.emit('error', { message: 'Server error processing action' });
    }
  });

  socket.on('disconnect', () => {
    authenticatedHosts.delete(socket.id);
    socketActionCounts.delete(socket.id);
    logger.info('Client disconnected', { socketId: socket.id });
  });

  socket.on('error', (err) => {
    logger.error('Socket error', { socketId: socket.id, error: err.message });
  });
});

function broadcast() {
  io.emit('stateSync', gameState);
}

// ── Action handlers ───────────────────────────────────────────────────────────
function handleAction(action) {
  switch (action.type) {

    case 'START_TOURNAMENT': {
      const teams = action.teams.map((name, i) => ({
        id: i,
        name: name || `Team ${i + 1}`,
        score: 0
      }));
      gameState.tournament.teams = teams;
      gameState.tournament.currentRound = 'round1';
      gameState.tournament.matches = [
        { team1: 0, team2: 1, questions: 4 },
        { team1: 2, team2: 3, questions: 4 },
        { team1: 4, team2: 5, questions: 4 }
      ];
      gameState.tournament.currentMatch = 0;
      gameState.tournament.questionsAnswered = 0;
      gameState.currentQ = 0;
      gameState.wrong = 0;
      gameState.flippedCards = [];
      gameState.boardScore = 0;
      gameState.phase = 'game';
      logger.info('Tournament started', { teams: teams.map(t => t.name) });
      break;
    }

    case 'FLIP_CARD': {
      const idx = gameState.flippedCards.indexOf(action.cardIndex);
      if (idx === -1) {
        gameState.flippedCards.push(action.cardIndex);
      } else {
        gameState.flippedCards.splice(idx, 1);
      }
      gameState.boardScore = action.boardScore ?? gameState.boardScore;
      break;
    }

    case 'WRONG': {
      if (gameState.wrong < 3) gameState.wrong++;
      break;
    }

    case 'NEXT_QUESTION': {
      gameState.tournament.questionsAnswered++;
      gameState.wrong = 0;
      gameState.flippedCards = [];
      gameState.boardScore = 0;
      gameState.pointsAwarded = false;

      const currentMatch = gameState.tournament.matches[gameState.tournament.currentMatch];
      if (gameState.tournament.questionsAnswered >= currentMatch.questions) {
        gameState.tournament.currentMatch++;
        gameState.tournament.questionsAnswered = 0;

        if (gameState.tournament.currentMatch >= gameState.tournament.matches.length) {
          if (gameState.tournament.currentRound === 'round1') {
            gameState.phase = 'leaderboard';
            logger.info('Round 1 complete — showing leaderboard');
          } else if (gameState.tournament.currentRound === 'semifinal') {
            _setupFinal();
          } else if (gameState.tournament.currentRound === 'final') {
            gameState.phase = 'winner';
            saveGameSession(gameState);
            logger.info('Game complete — winner determined');
          }
        } else {
          gameState.currentQ++;
        }
      } else {
        gameState.currentQ++;
      }
      break;
    }

    case 'AWARD_TEAM': {
      const { teamNum, points } = action;
      const match = gameState.tournament.matches[gameState.tournament.currentMatch];
      const teamIdx = teamNum === 1 ? match.team1 : match.team2;
      gameState.tournament.teams[teamIdx].score += points;
      gameState.boardScore = 0;
      gameState.pointsAwarded = true;
      logger.info('Points awarded', { team: gameState.tournament.teams[teamIdx].name, points });
      break;
    }

    case 'PROCEED_TO_SEMIFINAL': {
      const sorted = [...gameState.tournament.teams].sort((a, b) => b.score - a.score);
      gameState.tournament.teams[sorted[1].id].score = 0;
      gameState.tournament.teams[sorted[2].id].score = 0;
      gameState.tournament.currentRound = 'semifinal';
      gameState.tournament.matches = [
        { team1: sorted[1].id, team2: sorted[2].id, questions: 3 }
      ];
      gameState.tournament.currentMatch = 0;
      gameState.tournament.questionsAnswered = 0;
      gameState.currentQ++;
      gameState.wrong = 0;
      gameState.flippedCards = [];
      gameState.boardScore = 0;
      gameState.phase = 'game';
      logger.info('Proceeding to semi-final');
      break;
    }

    case 'RESTART': {
      saveGameSession(gameState);
      resetState();
      currentRoomCode = null;
      logger.info('Game restarted');
      break;
    }
  }

  broadcast();
}

function _setupFinal() {
  const sorted = [...gameState.tournament.teams].sort((a, b) => b.score - a.score);
  const rank1  = sorted[0].id;
  const match  = gameState.tournament.matches[0];
  const t1     = gameState.tournament.teams[match.team1];
  const t2     = gameState.tournament.teams[match.team2];
  const winner   = t1.score > t2.score ? match.team1 : match.team2;
  const opponent = winner === rank1 ? sorted[1].id : rank1;

  gameState.tournament.teams[winner].score   = 0;
  gameState.tournament.teams[opponent].score = 0;
  gameState.tournament.currentRound = 'final';
  gameState.tournament.matches = [{ team1: winner, team2: opponent, questions: 3 }];
  gameState.tournament.currentMatch = 0;
  gameState.tournament.questionsAnswered = 0;
  gameState.currentQ++;
  gameState.wrong = 0;
  gameState.flippedCards = [];
  gameState.boardScore = 0;
  gameState.phase = 'game';
  logger.info('Final round set up');
}

// ── Global error handlers ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error('Unhandled Express error', { error: err.message, stack: err.stack, path: req.path });
  res.status(500).json({ error: 'Internal server error' });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: String(reason) });
});

// ── All other routes → React app ──────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(CLIENT_DIST, 'index.html'));
});

server.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
  // Warn clearly if client dist is missing
  const fs = require('fs');
  if (!fs.existsSync(CLIENT_DIST)) {
    logger.error(`CLIENT DIST NOT FOUND at ${CLIENT_DIST} — run 'npm run build' in client/`);
  } else {
    logger.info(`Serving client from ${CLIENT_DIST}`);
  }
});
