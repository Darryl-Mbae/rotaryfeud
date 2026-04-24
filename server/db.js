const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'game.db');

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS game_sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    ended_at    TEXT,
    winner_name TEXT,
    final_state TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS host_config (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    pin_hash    TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

const stmts = {
  saveSession: db.prepare(`
    INSERT INTO game_sessions (final_state, winner_name, ended_at)
    VALUES (@finalState, @winnerName, datetime('now'))
  `),
  getRecentSessions: db.prepare(`
    SELECT id, started_at, ended_at, winner_name
    FROM game_sessions
    ORDER BY id DESC
    LIMIT 20
  `),
  getPin: db.prepare(`SELECT pin_hash FROM host_config WHERE id = 1`),
  setPin: db.prepare(`
    INSERT INTO host_config (id, pin_hash, updated_at)
    VALUES (1, @pinHash, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET pin_hash = @pinHash, updated_at = datetime('now')
  `)
};

function saveGameSession(gameState) {
  try {
    const winner = gameState.tournament?.teams?.reduce(
      (best, t) => (!best || t.score > best.score ? t : best), null
    );
    stmts.saveSession.run({
      finalState: JSON.stringify(gameState),
      winnerName: winner?.name ?? null
    });
    logger.info('Game session saved to database', { winner: winner?.name });
  } catch (err) {
    logger.error('Failed to save game session', { error: err.message });
  }
}

function getRecentSessions() {
  return stmts.getRecentSessions.all();
}

function getStoredPin() {
  const row = stmts.getPin.get();
  return row?.pin_hash ?? null;
}

function storePin(pinHash) {
  stmts.setPin.run({ pinHash });
}

function clearPin() {
  db.prepare(`DELETE FROM host_config WHERE id = 1`).run();
}

module.exports = { saveGameSession, getRecentSessions, getStoredPin, storePin, clearPin };
