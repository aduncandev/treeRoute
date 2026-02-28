const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'treeroute-hackathon-secret-2026';

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.id;
        req.username = decoded.username;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

// Optional auth - sets userId if token present, but doesn't block
function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
            req.userId = decoded.id;
            req.username = decoded.username;
        } catch (err) {
            // Ignore invalid tokens
        }
    }
    next();
}

module.exports = { authMiddleware, optionalAuth, JWT_SECRET };