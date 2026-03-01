const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../auth');
const { ACHIEVEMENTS, LEVEL_NAMES, LEVEL_THRESHOLDS } = require('./journeys');

const router = express.Router();

const CHALLENGE_POOL = [
    { key: 'walk_today', desc: 'Log a walking journey today', xp: 20, check: async (userId) => (await db.get("SELECT COUNT(*) as c FROM journeys WHERE user_id = ? AND mode = 'walk' AND date(created_at) = date('now')", [userId])).c >= 1 },
    { key: 'save_2kg', desc: 'Save 2kg CO2 today', xp: 30, check: async (userId) => (await db.get("SELECT COALESCE(SUM(co2_saved), 0) as s FROM journeys WHERE user_id = ? AND date(created_at) = date('now')", [userId])).s >= 2 },
    { key: 'log_3', desc: 'Log 3 journeys today', xp: 25, check: async (userId) => (await db.get("SELECT COUNT(*) as c FROM journeys WHERE user_id = ? AND date(created_at) = date('now')", [userId])).c >= 3 },
    { key: 'bike_today', desc: 'Log a bike journey today', xp: 20, check: async (userId) => (await db.get("SELECT COUNT(*) as c FROM journeys WHERE user_id = ? AND mode = 'bike' AND date(created_at) = date('now')", [userId])).c >= 1 },
    { key: 'burn_200cal', desc: 'Burn 200 calories today', xp: 25, check: async (userId) => (await db.get("SELECT COALESCE(SUM(calories_burned), 0) as c FROM journeys WHERE user_id = ? AND date(created_at) = date('now')", [userId])).c >= 200 },
    { key: 'distance_10', desc: 'Travel 10km sustainably today', xp: 30, check: async (userId) => (await db.get("SELECT COALESCE(SUM(distance_km), 0) as d FROM journeys WHERE user_id = ? AND mode != 'car' AND date(created_at) = date('now')", [userId])).d >= 10 },
];

async function getDailyChallenges(userId) {
    const today = new Date().toISOString().split('T')[0];
    const seed = today.split('-').join('');
    const indices = [];
    for (let i = 0; i < 3; i++) indices.push((parseInt(seed) + i * 7 + userId) % CHALLENGE_POOL.length);
    const unique = [...new Set(indices)];
    while (unique.length < 3) unique.push((unique[unique.length - 1] + 1) % CHALLENGE_POOL.length);
    return Promise.all(unique.slice(0, 3).map(async idx => {
        const ch = CHALLENGE_POOL[idx];
        const completed = await ch.check(userId);
        return { key: ch.key, desc: ch.desc, xp: ch.xp, completed };
    }));
}

function getEcosystemLevel(totalCo2Saved) {
    if (totalCo2Saved >= 500) return { level: 5, name: 'Thriving Rainforest', emoji: '🌳' };
    if (totalCo2Saved >= 200) return { level: 4, name: 'Dense Forest', emoji: '🌲' };
    if (totalCo2Saved >= 50) return { level: 3, name: 'Growing Woodland', emoji: '🌿' };
    if (totalCo2Saved >= 10) return { level: 2, name: 'Young Garden', emoji: '🪴' };
    return { level: 1, name: 'Barren Seedbed', emoji: '🌱' };
}

router.get('/', authMiddleware, async (req, res) => {
    try {
        const user = await db.get('SELECT id, username, xp, level, current_streak, longest_streak, last_journey_date FROM users WHERE id = ?', [req.userId]);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const totals = await db.get(`SELECT COUNT(*) as totalJourneys, COALESCE(SUM(distance_km), 0) as totalDistance, COALESCE(SUM(co2_emitted), 0) as totalCo2Emitted, COALESCE(SUM(co2_saved), 0) as totalCo2Saved, COALESCE(SUM(calories_burned), 0) as totalCalories, COALESCE(SUM(travel_time_min), 0) as totalTravelTime, COALESCE(SUM(xp_earned), 0) as totalXpEarned FROM journeys WHERE user_id = ?`, [req.userId]);

        const achievements = await db.all('SELECT achievement_key, unlocked_at FROM achievements WHERE user_id = ?', [req.userId]);
        const unlockedKeys = achievements.map(a => a.achievement_key);
        const allAchievements = Object.entries(ACHIEVEMENTS).map(([key, val]) => ({
            key, ...val, unlocked: unlockedKeys.includes(key),
            unlocked_at: achievements.find(a => a.achievement_key === key)?.unlocked_at || null
        }));

        const dailyChallenges = await getDailyChallenges(req.userId);

        const greenJourneys = (await db.get("SELECT COUNT(*) as c FROM journeys WHERE user_id = ? AND mode IN ('walk', 'bike', 'eScooter')", [req.userId])).c;
        const transitJourneys = (await db.get("SELECT COUNT(*) as c FROM journeys WHERE user_id = ? AND mode IN ('bus', 'train')", [req.userId])).c;
        const sustainabilityScore = totals.totalJourneys > 0 ? Math.min(100, Math.round(((greenJourneys * 1.0 + transitJourneys * 0.7) / totals.totalJourneys) * 100)) : 0;

        // Find top calorie-burning transport mode
        const topCalorieMode = await db.get("SELECT mode, SUM(calories_burned) as total_cal FROM journeys WHERE user_id = ? AND calories_burned > 0 GROUP BY mode ORDER BY total_cal DESC LIMIT 1", [req.userId]);

        // Generate multiple contextual recommendations
        const recommendations = [];
        const carJourneys = await db.get("SELECT COUNT(*) as c, COALESCE(AVG(distance_km), 0) as avgDist FROM journeys WHERE user_id = ? AND mode = 'car'", [req.userId]);
        if (carJourneys.c > 0) {
            const potentialSaved = +(carJourneys.avgDist * 0.171 * 2 * 4).toFixed(1);
            recommendations.push({ icon: '🚴', text: `Cycle instead of driving twice a week to save ~${potentialSaved}kg CO₂ per month` });
            if (carJourneys.avgDist <= 5) {
                recommendations.push({ icon: '🚶', text: `Your average car journey is only ${carJourneys.avgDist.toFixed(1)}km — that's walkable in about ${Math.round(carJourneys.avgDist / 5 * 60)} minutes` });
            }
            if (carJourneys.avgDist <= 10) {
                recommendations.push({ icon: '🛴', text: `An e-scooter could cover your ${carJourneys.avgDist.toFixed(1)}km car trips in ~${Math.round(carJourneys.avgDist / 20 * 60)} min with almost zero emissions` });
            }
        }

        const busJourneys = await db.get("SELECT COUNT(*) as c, COALESCE(AVG(distance_km), 0) as avgDist FROM journeys WHERE user_id = ? AND mode = 'bus'", [req.userId]);
        if (busJourneys.c > 0 && busJourneys.avgDist <= 8) {
            recommendations.push({ icon: '🚴', text: `Your average bus trip is ${busJourneys.avgDist.toFixed(1)}km — cycling that would burn ~${Math.round(busJourneys.avgDist * 28)} calories and produce zero emissions` });
        }

        if (user.current_streak > 0 && user.current_streak < user.longest_streak) {
            recommendations.push({ icon: '🔥', text: `You're on a ${user.current_streak}-day streak! Your record is ${user.longest_streak} days — keep going to beat it` });
        } else if (user.current_streak === 0 && totals.totalJourneys > 0) {
            recommendations.push({ icon: '📅', text: `Log a journey today to start a new streak! Your longest was ${user.longest_streak} days` });
        }

        if (totals.totalCo2Saved > 0 && totals.totalCo2Saved < 21) {
            const treesNeeded = (21 - totals.totalCo2Saved).toFixed(1);
            recommendations.push({ icon: '🌳', text: `Save ${treesNeeded}kg more CO₂ to match a whole tree's annual absorption (21kg)` });
        }

        if (sustainabilityScore < 50 && totals.totalJourneys >= 3) {
            recommendations.push({ icon: '🌱', text: `Your sustainability score is ${sustainabilityScore}% — try replacing one car trip with walking or cycling to boost it` });
        } else if (sustainabilityScore >= 80) {
            recommendations.push({ icon: '🌟', text: `Amazing ${sustainabilityScore}% sustainability score! You're a green transport champion` });
        }

        // Keep backward compat: recommendation = first item text
        const recommendation = recommendations.length > 0 ? recommendations[0].text : null;

        const currentLevel = user.level;
        const xpToNext = currentLevel < LEVEL_THRESHOLDS.length ? LEVEL_THRESHOLDS[currentLevel] - user.xp : 0;

        res.json({
            user: { username: user.username, xp: user.xp, level: currentLevel, level_name: LEVEL_NAMES[currentLevel - 1], xp_to_next: Math.max(0, xpToNext), xp_current_level: currentLevel > 1 ? LEVEL_THRESHOLDS[currentLevel - 1] : 0, xp_next_level: currentLevel < LEVEL_THRESHOLDS.length ? LEVEL_THRESHOLDS[currentLevel] : user.xp, current_streak: user.current_streak, longest_streak: user.longest_streak },
            totals: { journeys: totals.totalJourneys, distance_km: +totals.totalDistance.toFixed(1), co2_emitted_kg: +totals.totalCo2Emitted.toFixed(2), co2_saved_kg: +totals.totalCo2Saved.toFixed(2), calories_burned: +totals.totalCalories.toFixed(0), travel_time_min: +totals.totalTravelTime.toFixed(0), trees_equivalent: +(totals.totalCo2Saved / 21).toFixed(1), top_calorie_mode: topCalorieMode ? topCalorieMode.mode : null },
            sustainability_score: sustainabilityScore, ecosystem: getEcosystemLevel(totals.totalCo2Saved), achievements: allAchievements, daily_challenges: dailyChallenges, recommendation, recommendations
        });
    } catch (err) {
        console.error('Stats error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;