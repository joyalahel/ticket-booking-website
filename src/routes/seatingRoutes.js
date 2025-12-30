const express = require('express');
const router = express.Router();
const SeatingController = require('../controllers/seatingController');
const { authenticateToken, requireOrganizer } = require('../middleware/authMiddleware');

// Public routes
router.get('/event/:eventId', SeatingController.getEventSeating);
router.get('/venue/:venueId', SeatingController.getVenueSeating);

// Protected routes
router.post('/event/:eventId/reserve', authenticateToken, SeatingController.reserveSeats);
router.post('/booking/:bookingId/confirm-seats', authenticateToken, SeatingController.confirmSeatBooking);

// Organizer only routes
router.post('/venue/:venueId/layout', authenticateToken, requireOrganizer, SeatingController.updateVenueSeating);

module.exports = router;