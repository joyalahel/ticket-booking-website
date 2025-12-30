const express = require('express');
const router = express.Router();
const PaymentController = require('../controllers/paymentController');
const { authenticateToken,requireAdmin , requireOrganizer } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authenticateToken);

// All routes require authentication
router.use(authenticateToken);

// ✅ SINGLE PAYMENT ROUTE - Creates and processes payment
router.post('/', PaymentController.createPayment);

// ✅ GET payment methods
router.get('/methods', PaymentController.getPaymentMethods);

// ✅ GET payment details by ID
router.get('/:id', PaymentController.getPayment);

// ✅ GET payments for a specific booking
router.get('/booking/:bookingId', PaymentController.getBookingPayments);


module.exports = router;