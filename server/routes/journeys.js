const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../auth');

const router = express.Router();

// Updated CO2 factors (kg CO2 per km) - UK BEIS 2024 averages
const CO2_FACTORS = {
  car: 0.171,       // Average petrol car
  bus: 0.097,       // Local bus average occupancy
  train: 0.035,     // National rail average
  bike: 0,
  walk: 0,
  eScooter: 0.005   // Lifecycle emissions including charging
};

// Calories per km (MET-based estimates for 70kg person)
const CALORIE_FACTORS = {
  car: 0, bus: 0, train: 0,
  bike: 28,    // ~MET 6.8 at 16km/h
  walk: 57,    // ~MET 3.5 at 5km/h
  eScooter: 4
};

// Average urban speeds km/h for travel time estimation
const SPEED_FACTORS = {
  car: 30, bus: 12, train: 45,
  bike: 15, walk: 5, eScooter: 20
};

const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1600, 2400, 3500, 5000, 7000];
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
    first_steps: stats.totalJourneys >= 1, hot_streak: user.current_streak >= 3,
    week_warrior: user.current_streak >= 7, month_master: user.current_streak >= 30,
    pedal_power: bikeJourneys >= 10, walking_legend: walkDistance >= 50,
    carbon_crusher: stats.totalCo2Saved >= 20, century_club: stats.totalCo2Saved >= 100,
    calorie_burner: stats.totalCalories >= 1000, distance_king: stats.totalDistance >= 200,
    five_a_day: todayJourneys >= 5, speed_demon: stats.totalJourneys >= 10
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
  else newStreak = 1;
  const longestStreak = Math.max(newStreak, user.longest_streak);
  await db.run('UPDATE users SET current_streak = ?, longest_streak = ?, last_journey_date = ? WHERE id = ?', [newStreak, longestStreak, today, userId]);
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

router.post('/', authMiddleware, async (req, res) => {
  const { origin, destination, mode, distance_km, origin_lat, origin_lng, dest_lat, dest_lng, route_distance_km, route_duration_min } = req.body;
  if (!origin || !destination || !mode) return res.status(400).json({ error: 'Missing fields' });
  if (!CO2_FACTORS.hasOwnProperty(mode)) return res.status(400).json({ error: 'Invalid mode' });

  let dist;
  if (route_distance_km && route_distance_km > 0) {
    dist = parseFloat(route_distance_km);
  } else if (distance_km && parseFloat(distance_km) > 0) {
    dist = parseFloat(distance_km);
  } else if (origin_lat && origin_lng && dest_lat && dest_lng) {
    dist = haversineKm(origin_lat, origin_lng, dest_lat, dest_lng) * 1.3;
  } else {
    return res.status(400).json({ error: 'Please provide distance or select locations on the map' });
  }

  dist = +dist.toFixed(2);
  if (isNaN(dist) || dist <= 0) return res.status(400).json({ error: 'Invalid distance' });

  try {
    const co2_emitted = +(dist * CO2_FACTORS[mode]).toFixed(3);
    const ecosystemPenalty = ['car', 'bus', 'train'].includes(mode) ? +(co2_emitted * 0.10).toFixed(3) : 0;
    const co2_saved = +((dist * CO2_FACTORS.car) - co2_emitted - ecosystemPenalty).toFixed(3);
    const calories_burned = +(dist * (CALORIE_FACTORS[mode] || 0)).toFixed(1);
    const travel_time_min = route_duration_min && route_duration_min > 0
      ? +parseFloat(route_duration_min).toFixed(1)
      : +((dist / SPEED_FACTORS[mode]) * 60).toFixed(1);

    let xp_earned = Math.round(10 + (dist * 2) + (Math.max(0, co2_saved) * 5));
    // XP multipliers: reward clean transport, heavily nerf polluting modes
    const XP_MULTIPLIERS = { walk: 2, bike: 2, eScooter: 2, train: 0.75, bus: 0.5, car: 0.25 };
    xp_earned = Math.max(1, Math.round(xp_earned * (XP_MULTIPLIERS[mode] || 1)));

    const result = await db.run(
      `INSERT INTO journeys (user_id, origin, destination, mode, distance_km, co2_emitted, co2_saved, calories_burned, travel_time_min, xp_earned) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.userId, origin, destination, mode, dist, co2_emitted, co2_saved, calories_burned, travel_time_min, xp_earned]
    );

    const user = await db.get('SELECT xp, level FROM users WHERE id = ?', [req.userId]);
    const newXp = user.xp + xp_earned;
    const newLevel = calculateLevel(newXp);
    const leveledUp = newLevel > user.level;
    await db.run('UPDATE users SET xp = ?, level = ? WHERE id = ?', [newXp, newLevel, req.userId]);
    if (mode !== 'car') await updateStreak(req.userId);
    const newAchievements = await checkAndAwardAchievements(req.userId);

    const modeComparisons = {};
    for (const [m, factor] of Object.entries(CO2_FACTORS)) {
      modeComparisons[m] = {
        co2: +(dist * factor).toFixed(3),
        time: +((dist / SPEED_FACTORS[m]) * 60).toFixed(1),
        calories: +(dist * (CALORIE_FACTORS[m] || 0)).toFixed(0)
      };
    }

    res.status(201).json({
      journey: { id: result.lastInsertRowid, origin, destination, mode, distance_km: dist, co2_emitted, co2_saved, calories_burned, travel_time_min, xp_earned },
      comparison: { car_co2: +(dist * CO2_FACTORS.car).toFixed(3), car_time: +((dist / SPEED_FACTORS.car) * 60).toFixed(1), co2_saved, trees_equivalent: +(co2_saved / 21).toFixed(3), modes: modeComparisons },
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
module.exports.CO2_FACTORS = CO2_FACTORS;