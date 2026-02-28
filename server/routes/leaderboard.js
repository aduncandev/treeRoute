const express = require('express');
const db = require('../db');
const { optionalAuth } = require('../auth');

const router = express.Router();

router.get('/', optionalAuth, async (req, res) => {
    const type = req.query.type || 'co2';
    const period = req.query.period || 'all';
    const validTypes = ['co2', 'distance', 'streak', 'xp'];
    if (!validTypes.includes(type)) return res.status(400).json({ error: 'Invalid leaderboard type' });

    try {
        let query;
        const dateFilter = period === 'week' ? "AND j.created_at >= datetime('now', '-7 days')" : '';

        if (type === 'co2') {
            query = `SELECT u.id, u.username, u.level, COALESCE(SUM(j.co2_saved), 0) as value FROM users u LEFT JOIN journeys j ON u.id = j.user_id ${dateFilter ? 'AND ' + dateFilter.slice(4) : ''} GROUP BY u.id ORDER BY value DESC LIMIT 20`;
        } else if (type === 'distance') {
            query = `SELECT u.id, u.username, u.level, COALESCE(SUM(j.distance_km), 0) as value FROM users u LEFT JOIN journeys j ON u.id = j.user_id ${dateFilter ? 'AND ' + dateFilter.slice(4) : ''} GROUP BY u.id ORDER BY value DESC LIMIT 20`;
        } else if (type === 'xp') {
            query = period === 'week'
                ? `SELECT u.id, u.username, u.level, COALESCE(SUM(j.xp_earned), 0) as value FROM users u LEFT JOIN journeys j ON u.id = j.user_id AND j.created_at >= datetime('now', '-7 days') GROUP BY u.id ORDER BY value DESC LIMIT 20`
                : `SELECT id, username, level, xp as value FROM users ORDER BY xp DESC LIMIT 20`;
        } else if (type === 'streak') {
            query = `SELECT id, username, level, ${period === 'week' ? 'current_streak' : 'longest_streak'} as value FROM users ORDER BY value DESC LIMIT 20`;
        }

        const rows = await db.all(query);
        let userRank = null;
        if (req.userId) {
            const idx = rows.findIndex(r => r.id === req.userId);
            if (idx >= 0) userRank = idx + 1;
        }
        const units = { co2: 'kg CO₂', distance: 'km', xp: 'XP', streak: 'days' };
        res.json({
            type, period, unit: units[type],
            entries: rows.map((r, i) => ({ rank: i + 1, username: r.username, level: r.level, value: +parseFloat(r.value).toFixed(1), isCurrentUser: r.id === req.userId })),
            user_rank: userRank
        });
    } catch (err) {
        console.error('Leaderboard error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;