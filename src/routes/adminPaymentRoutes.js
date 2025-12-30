const express = require('express');
const router = express.Router();
const PaymentController = require('../controllers/paymentController');
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');

// All admin routes require authentication and admin role
router.use(authenticateToken);
router.use(requireAdmin);

// Get all pending payments
router.get('/pending-payments', async (req, res) => {
    try {
        const payments = await Payment.getPendingPayments();
        res.json({ success: true, payments });
    } catch (error) {
        console.error('Get pending payments error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get payments by method
router.get('/payments-by-method/:method', async (req, res) => {
    try {
        const { method } = req.params;
        const payments = await Payment.getByMethod(method);
        res.json({ success: true, payments });
    } catch (error) {
        console.error('Get payments by method error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get payment statistics
router.get('/payment-stats', async (req, res) => {
    try {
        const [stats] = await pool.execute(`
            SELECT 
                COUNT(*) as total_payments,
                SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_payments,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_payments,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_payments,
                SUM(CASE WHEN status = 'success' THEN total_price ELSE 0 END) as total_revenue,
                method,
                COUNT(*) as method_count
            FROM payments p
            JOIN bookings b ON p.booking_id = b.id
            GROUP BY method
        `);

        res.json({ success: true, stats });
    } catch (error) {
        console.error('Get payment stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;