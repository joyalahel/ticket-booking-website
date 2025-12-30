const express = require('express');
const router = express.Router();
const BookingController = require('../controllers/bookingController');
const { authenticateToken } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authenticateToken);

// Booking routes
router.post('/', BookingController.createBooking);
router.get('/my-bookings', BookingController.getMyBookings);
router.get('/:id', BookingController.getBooking);
router.delete('/:id/cancel', BookingController.cancelBooking);
router.get('/event/:eventId/available', BookingController.getAvailableTickets);
// Confirm booking (reserve seats for 10 minutes)
router.post('/:id/confirm', BookingController.confirmBooking);
module.exports = router;