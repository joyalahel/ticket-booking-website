const express = require('express');
const router = express.Router();
const QRController = require('../controllers/qrController');
const { authenticateToken, requireOrganizer } = require('../middleware/authMiddleware');

// Public routes
router.post('/scan', QRController.processQRScan);

// Protected routes - users can access their own ticket QR codes
router.get('/ticket/:bookingId', authenticateToken, QRController.generateTicketQR);
router.get('/event/:eventId', QRController.generateEventQR);

// Organizer only routes
router.get('/checkin/:eventId', authenticateToken, requireOrganizer, QRController.generateCheckinQR);
router.post('/checkin/:bookingId', authenticateToken, requireOrganizer, QRController.checkInTicket);

module.exports = router;