const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'treeroute.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');

  db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, xp INTEGER DEFAULT 0, level INTEGER DEFAULT 1, current_streak INTEGER DEFAULT 0, longest_streak INTEGER DEFAULT 0, last_journey_date TEXT, created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS journeys (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), origin TEXT NOT NULL, destination TEXT NOT NULL, mode TEXT NOT NULL, distance_km REAL, co2_emitted REAL, co2_saved REAL, calories_burned REAL, travel_time_min REAL, xp_earned INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS achievements (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), achievement_key TEXT NOT NULL, unlocked_at TEXT DEFAULT (datetime('now')), UNIQUE(user_id, achievement_key)
      );
      CREATE TABLE IF NOT EXISTS daily_challenges (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), challenge_key TEXT NOT NULL, date TEXT NOT NULL, completed INTEGER DEFAULT 0, UNIQUE(user_id, challenge_key, date)
      );
      CREATE INDEX IF NOT EXISTS idx_journeys_user ON journeys(user_id);
      CREATE INDEX IF NOT EXISTS idx_journeys_date ON journeys(created_at);
      CREATE INDEX IF NOT EXISTS idx_achievements_user ON achievements(user_id);
      CREATE INDEX IF NOT EXISTS idx_daily_challenges_user_date ON daily_challenges(user_id, date);
    `);
});

// Promise wrappers to save your routes from callback hell
module.exports = {
  get: (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row))),
  all: (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows))),
  run: (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (err) { err ? reject(err) : resolve({ lastInsertRowid: this.lastID, changes: this.changes }) })),
  db // Expose raw db just in case
};