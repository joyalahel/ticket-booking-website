const jwt = require('jsonwebtoken');
const User = require('../models/User.js');

// JWT secret key (in production, use .env)
const JWT_SECRET = 'your_super_secret_jwt_key_here_change_in_production';

// Generate JWT token
const generateToken = (userId) => {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
};

// Verify JWT token middleware
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({ error: 'Access token required' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
};

// Admin middleware
const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

// Organizer middleware
const requireOrganizer = (req, res, next) => {
    if (req.user.role !== 'organizer' && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Organizer access required' });
    }
    next();
};

module.exports = {
    generateToken,
    authenticateToken,
    requireAdmin,
    requireOrganizer,
    JWT_SECRET
};
