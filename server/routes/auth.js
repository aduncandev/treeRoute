const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authMiddleware, JWT_SECRET } = require('../auth');

const router = express.Router();

// POST /api/register
router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    if (username.length < 3 || username.length > 20) {
        return res.status(400).json({ error: 'Username must be 3-20 characters' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
        // Check if username or email already exists
        const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
        if (existing) {
            return res.status(409).json({ error: 'Username or email already taken' });
        }

        const password_hash = await bcrypt.hash(password, 10);

        const result = db.prepare(
            'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
        ).run(username, email, password_hash);

        const token = jwt.sign(
            { id: result.lastInsertRowid, username },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.status(201).json({
            token,
            user: {
                id: result.lastInsertRowid,
                username,
                email,
                xp: 0,
                level: 1,
                current_streak: 0,
                longest_streak: 0
            }
        });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
        if (!user) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                xp: user.xp,
                level: user.level,
                current_streak: user.current_streak,
                longest_streak: user.longest_streak
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/me - Get current user info
router.get('/me', authMiddleware, (req, res) => {
    try {
        const user = db.prepare(
            'SELECT id, username, email, xp, level, current_streak, longest_streak FROM users WHERE id = ?'
        ).get(req.userId);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user });
    } catch (err) {
        console.error('Me error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;