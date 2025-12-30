const express = require('express');
const router = express.Router();
const RefundController = require('../controllers/refundController');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authenticateToken);

// User routes
router.post('/request', RefundController.requestCancellation);
router.get('/eligibility/:booking_id', RefundController.checkRefundEligibility);
router.get('/cancellable-bookings', RefundController.getCancellableBookings);

// Admin routes
router.post('/process', requireAdmin, RefundController.processRefund);
router.get('/pending', requireAdmin, RefundController.getPendingRefunds);

module.exports = router;