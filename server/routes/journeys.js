const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../auth');

const router = express.Router();

const CO2_FACTORS = { car: 0.21, bus: 0.089, train: 0.041, bike: 0, walk: 0, eScooter: 0.005 };
const CALORIE_FACTORS = { car: 0, bus: 0, train: 0, bike: 30, walk: 65, eScooter: 5 };
const SPEED_FACTORS = { car: 50, bus: 25, train: 80, bike: 18, walk: 5, eScooter: 20 };
const LEVEL_THRESHOLDS = [0, 50, 150, 300, 500, 800, 1200, 1800, 2500, 3500];
const LEVEL_NAMES = ['Seedling', 'Sprout', 'Sapling', 'Young Tree', 'Growing Oak', 'Forest Guardian', 'Eco Warrior', 'Nature Champion', 'Earth Protector', 'Planet Hero'];

const ACHIEVEMENTS = {
  first_steps: { name: 'First Steps', icon: '🏃', desc: 'Log your first journey' },
  hot_streak: { name: 'Hot Streak', icon: '🔥', desc: '3-day sustainable streak' },
  week_warrior: { name: 'Week Warrior', icon: '🌿', desc: '7-day streak' },
  month_master: { name: 'Month Master', icon: '🏆', desc: '30-day streak' },
  pedal_power: { name: 'Pedal Power', icon: '🚴', desc: '10 bike journeys' },
  walking_legend: { name: 'Walking Legend', icon: '👟', desc: '50km walked' },
  carbon_crusher: { name: 'Carbon Crusher', icon: '🌍', desc: 'Save 20kg CO2' },
  century_club: { name: 'Century Club', icon: '💯', desc: 'Save 100kg CO2' },
  calorie_burner: { name: 'Calorie Burner', icon: '🔥', desc: 'Burn 1000 calories' },
  distance_king: { name: 'Distance King', icon: '📏', desc: '200km total distance' },
  five_a_day: { name: 'Five-a-Day', icon: '🎯', desc: '5 journeys in one day' },
  speed_demon: { name: 'Speed Demon', icon: '⚡', desc: '10 journeys logged' }
};

function calculateLevel(xp) {
  let level = 1;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) { level = i + 1; break; }
  }
  return Math.min(level, LEVEL_THRESHOLDS.length);
}

async function getStats(userId) {
  return await db.get(`SELECT COUNT(*) as totalJourneys, COALESCE(SUM(distance_km), 0) as totalDistance, COALESCE(SUM(co2_emitted), 0) as totalCo2Emitted, COALESCE(SUM(co2_saved), 0) as totalCo2Saved, COALESCE(SUM(calories_burned), 0) as totalCalories, COALESCE(SUM(travel_time_min), 0) as totalTravelTime FROM journeys WHERE user_id = ?`, [userId]);
}

async function checkAndAwardAchievements(userId) {
  const newAchievements = [];
  const rows = await db.all('SELECT achievement_key FROM achievements WHERE user_id = ?', [userId]);
  const existing = rows.map(a => a.achievement_key);

  const stats = await getStats(userId);
  const bikeJourneys = (await db.get("SELECT COUNT(*) as c FROM journeys WHERE user_id = ? AND mode = 'bike'", [userId])).c;
  const walkDistance = (await db.get("SELECT COALESCE(SUM(distance_km), 0) as d FROM journeys WHERE user_id = ? AND mode = 'walk'", [userId])).d;
  const todayJourneys = (await db.get("SELECT COUNT(*) as c FROM journeys WHERE user_id = ? AND date(created_at) = date('now')", [userId])).c;
  const user = await db.get('SELECT current_streak FROM users WHERE id = ?', [userId]);

  const checks = {
    first_steps: stats.totalJourneys >= 1, hot_streak: user.current_streak >= 3, week_warrior: user.current_streak >= 7, month_master: user.current_streak >= 30, pedal_power: bikeJourneys >= 10, walking_legend: walkDistance >= 50, carbon_crusher: stats.totalCo2Saved >= 20, century_club: stats.totalCo2Saved >= 100, calorie_burner: stats.totalCalories >= 1000, distance_king: stats.totalDistance >= 200, five_a_day: todayJourneys >= 5, speed_demon: stats.totalJourneys >= 10
  };

  for (const [key, met] of Object.entries(checks)) {
    if (met && !existing.includes(key)) {
      await db.run('INSERT OR IGNORE INTO achievements (user_id, achievement_key) VALUES (?, ?)', [userId, key]);
      newAchievements.push({ key, ...ACHIEVEMENTS[key] });
    }
  }
  return newAchievements;
}

async function updateStreak(userId) {
  const user = await db.get('SELECT last_journey_date, current_streak, longest_streak FROM users WHERE id = ?', [userId]);
  const today = new Date().toISOString().split('T')[0];
  const lastDate = user.last_journey_date;
  let newStreak = user.current_streak;

  if (lastDate === today) return;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  if (lastDate === yesterdayStr) newStreak += 1;
  else if (!lastDate) newStreak = 1;
  else newStreak = 1;

  const longestStreak = Math.max(newStreak, user.longest_streak);
  await db.run('UPDATE users SET current_streak = ?, longest_streak = ?, last_journey_date = ? WHERE id = ?', [newStreak, longestStreak, today, userId]);
}

router.post('/', authMiddleware, async (req, res) => {
  const { origin, destination, mode, distance_km } = req.body;
  if (!origin || !destination || !mode || !distance_km) return res.status(400).json({ error: 'Missing fields' });
  if (!CO2_FACTORS.hasOwnProperty(mode)) return res.status(400).json({ error: 'Invalid mode' });

  const dist = parseFloat(distance_km);
  if (isNaN(dist) || dist <= 0) return res.status(400).json({ error: 'Invalid distance' });

  try {
    const co2_emitted = +(dist * CO2_FACTORS[mode]).toFixed(3);
    const co2_saved = +((dist * CO2_FACTORS.car) - co2_emitted).toFixed(3);
    const calories_burned = +(dist * (CALORIE_FACTORS[mode] || 0)).toFixed(1);
    const travel_time_min = +((dist / SPEED_FACTORS[mode]) * 60).toFixed(1);

    let xp_earned = Math.round(10 + (dist * 2) + (Math.max(0, co2_saved) * 5));
    if (['walk', 'bike'].includes(mode)) xp_earned = Math.round(xp_earned * 2);

    const result = await db.run(`INSERT INTO journeys (user_id, origin, destination, mode, distance_km, co2_emitted, co2_saved, calories_burned, travel_time_min, xp_earned) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [req.userId, origin, destination, mode, dist, co2_emitted, co2_saved, calories_burned, travel_time_min, xp_earned]);

    const user = await db.get('SELECT xp, level FROM users WHERE id = ?', [req.userId]);
    const newXp = user.xp + xp_earned;
    const newLevel = calculateLevel(newXp);
    const leveledUp = newLevel > user.level;

    await db.run('UPDATE users SET xp = ?, level = ? WHERE id = ?', [newXp, newLevel, req.userId]);
    if (mode !== 'car') await updateStreak(req.userId);

    const newAchievements = await checkAndAwardAchievements(req.userId);

    res.status(201).json({
      journey: { id: result.lastInsertRowid, origin, destination, mode, distance_km: dist, co2_emitted, co2_saved, calories_burned, travel_time_min, xp_earned },
      comparison: { car_co2: +(dist * CO2_FACTORS.car).toFixed(3), car_time: +((dist / SPEED_FACTORS.car) * 60).toFixed(1), co2_saved, trees_equivalent: +(co2_saved / 21).toFixed(3) },
      gamification: { xp_earned, total_xp: newXp, level: newLevel, level_name: LEVEL_NAMES[newLevel - 1], leveled_up: leveledUp, xp_to_next: newLevel < LEVEL_THRESHOLDS.length ? LEVEL_THRESHOLDS[newLevel] - newXp : 0, new_achievements: newAchievements }
    });
  } catch (err) {
    console.error('Journey save error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', authMiddleware, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  try {
    const journeys = await db.all('SELECT * FROM journeys WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?', [req.userId, limit, (page - 1) * limit]);
    const total = (await db.get('SELECT COUNT(*) as c FROM journeys WHERE user_id = ?', [req.userId])).c;
    res.json({ journeys, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
module.exports.ACHIEVEMENTS = ACHIEVEMENTS;
module.exports.LEVEL_NAMES = LEVEL_NAMES;
module.exports.LEVEL_THRESHOLDS = LEVEL_THRESHOLDS;