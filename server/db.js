const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'treeroute.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_journey_date TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS journeys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    mode TEXT NOT NULL,
    distance_km REAL,
    co2_emitted REAL,
    co2_saved REAL,
    calories_burned REAL,
    travel_time_min REAL,
    xp_earned INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    achievement_key TEXT NOT NULL,
    unlocked_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, achievement_key)
  );

  CREATE TABLE IF NOT EXISTS daily_challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    challenge_key TEXT NOT NULL,
    date TEXT NOT NULL,
    completed INTEGER DEFAULT 0,
    UNIQUE(user_id, challenge_key, date)
  );

  CREATE INDEX IF NOT EXISTS idx_journeys_user ON journeys(user_id);
  CREATE INDEX IF NOT EXISTS idx_journeys_date ON journeys(created_at);
  CREATE INDEX IF NOT EXISTS idx_achievements_user ON achievements(user_id);
  CREATE INDEX IF NOT EXISTS idx_daily_challenges_user_date ON daily_challenges(user_id, date);
`);

module.exports = db;