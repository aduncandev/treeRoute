const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authMiddleware, JWT_SECRET } = require('../auth');

const router = express.Router();

router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'Username, email, and password are required' });
    if (username.length < 3 || username.length > 20) return res.status(400).json({ error: 'Username must be 3-20 characters' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    try {
        const existing = await db.get('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
        if (existing) return res.status(409).json({ error: 'Username or email already taken' });

        const password_hash = await bcrypt.hash(password, 10);
        const result = await db.run('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)', [username, email, password_hash]);

        const token = jwt.sign({ id: result.lastInsertRowid, username }, JWT_SECRET, { expiresIn: '30d' });
        res.status(201).json({ token, user: { id: result.lastInsertRowid, username, email, xp: 0, level: 1, current_streak: 0, longest_streak: 0 } });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

    try {
        const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ token, user: { id: user.id, username: user.username, email: user.email, xp: user.xp, level: user.level, current_streak: user.current_streak, longest_streak: user.longest_streak } });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/me', authMiddleware, async (req, res) => {
    try {
        const user = await db.get('SELECT id, username, email, xp, level, current_streak, longest_streak, created_at FROM users WHERE id = ?', [req.userId]);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ user });
    } catch (err) {
        console.error('Me error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.put('/profile', authMiddleware, async (req, res) => {
    const { username, email } = req.body;
    if (!username || username.length < 3 || username.length > 20) {
        return res.status(400).json({ error: 'Username must be 3-20 characters' });
    }

    try {
        const duplicate = await db.get(
            'SELECT id FROM users WHERE (username = ? OR email = ?) AND id != ?',
            [username, email || '', req.userId]
        );
        if (duplicate) {
            return res.status(409).json({ error: 'Username or email already taken' });
        }

        await db.run(
            'UPDATE users SET username = ?, email = ? WHERE id = ?',
            [username, email || '', req.userId]
        );

        const user = await db.get('SELECT id, username, email FROM users WHERE id = ?', [req.userId]);
        res.json({ user });
    } catch (err) {
        console.error('Profile update error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;