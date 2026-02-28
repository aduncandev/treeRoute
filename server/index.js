const express = require('express');
const cors = require('cors');
const path = require('path');

// Initialize database (creates tables)
require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api', require('./routes/auth'));
app.use('/api/journeys', require('./routes/journeys'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/leaderboard', require('./routes/leaderboard'));

// Serve static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
    }
});

app.listen(PORT, () => {
    console.log(`🌳 TreeRoute server running on http://localhost:${PORT}`);
});