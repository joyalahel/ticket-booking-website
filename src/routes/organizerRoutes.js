const express = require('express');
const router = express.Router();
const OrganizerController = require('../controllers/organizerController');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');

// User route
router.post('/apply', authenticateToken, OrganizerController.apply);

// Admin routes
router.get('/requests', authenticateToken, requireAdmin, OrganizerController.listPending);
router.post('/requests/:requestId/decision', authenticateToken, requireAdmin, OrganizerController.decide);

module.exports = router;
