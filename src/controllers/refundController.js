const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const User = require('../models/User');
const Event = require('../models/Event');
const pool = require('../config/database');
const EmailService = require('../services/emailService');

class RefundController {
    
    static async requestCancellation(req, res) {
    try {
        const { booking_id, reason = '' } = req.body;
        const user_id = req.user.id;

        if (!booking_id) {
            return res.status(400).json({ error: 'Booking ID is required' });
        }

        // ✅ ADD: First check current booking status
        const booking = await Booking.getById(booking_id);
        if (!booking || booking.user_id !== user_id) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        // ✅ ADD: Check if cancellation was already requested
        if (booking.cancellation_requested) {
            return res.status(400).json({ 
                error: 'Cancellation has already been requested for this booking',
                current_status: booking.refund_status,
                requested_at: booking.cancellation_requested_at
            });
        }

        // ✅ ADD: Check if refund was already processed
        if (booking.refund_status === 'processed' || booking.refund_status === 'approved') {
            return res.status(400).json({ 
                error: 'Refund has already been processed for this booking',
                refund_amount: booking.refund_amount,
                processed_at: booking.refund_processed_at
            });
        }

        const success = await Booking.requestCancellation(booking_id, user_id, reason);
        
        if (success) {
            // Send cancellation confirmation email
            try {
                const updatedBooking = await Booking.getById(booking_id);
                const user = await User.findById(user_id);
                const event = await Event.getById(updatedBooking.event_id);
                
                await EmailService.sendCancellationRequestEmail({
                    user: user,
                    booking: updatedBooking,
                    event: event,
                    reason: reason
                });
            } catch (emailError) {
                console.log('📧 Cancellation email failed:', emailError.message);
            }

            res.json({
                success: true,
                message: 'Cancellation requested successfully. Refund will be processed within 5-7 business days.',
                refund_eligible: true,
                cancellation_requested_at: new Date().toISOString()
            });
        } else {
            res.status(400).json({ error: 'Failed to request cancellation' });
        }

    } catch (error) {
        console.error('Request cancellation error:', error);
        
        // ✅ ADD: Handle specific error messages
        if (error.message.includes('already been requested') || 
            error.message.includes('already been processed')) {
            res.status(400).json({ error: error.message });
        } else {
            res.status(400).json({ error: error.message });
        }
    }
}

    // Check refund eligibility
    static async checkRefundEligibility(req, res) {
        try {
            const { booking_id } = req.params;
            const user_id = req.user.id;

            const booking = await Booking.getById(booking_id);
            if (!booking || booking.user_id !== user_id) {
                return res.status(404).json({ error: 'Booking not found' });
            }

            const isEligible = await Booking.isEligibleForRefund(booking_id);
            
            // Get hours since payment
            const [rows] = await pool.execute(
                `SELECT TIMESTAMPDIFF(HOUR, p.payment_timestamp, NOW()) as hours_since_payment
                 FROM payments p
                 WHERE p.booking_id = ? AND p.status = 'success'`,
                [booking_id]
            );
            
            const hoursSincePayment = rows[0]?.hours_since_payment || 0;

            res.json({
                success: true,
                is_eligible: isEligible,
                hours_since_payment: hoursSincePayment,
                hours_remaining: isEligible ? 48 - hoursSincePayment : 0,
                message: isEligible 
                    ? `Eligible for refund. ${48 - hoursSincePayment} hours remaining.`
                    : 'Not eligible for refund (48-hour window expired)'
            });

        } catch (error) {
            console.error('Check refund eligibility error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Get user's cancellable bookings
    static async getCancellableBookings(req, res) {
        try {
            const user_id = req.user.id;
            const bookings = await Booking.getCancellableBookings(user_id);
            
            res.json({
                success: true,
                bookings: bookings.map(booking => ({
                    ...booking,
                    refund_deadline: new Date(new Date(booking.payment_timestamp).getTime() + 48 * 60 * 60 * 1000)
                }))
            });

        } catch (error) {
            console.error('Get cancellable bookings error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Process refund (Admin only)
    static async processRefund(req, res) {
        try {
            const { booking_id, approve, admin_notes = '' } = req.body;
            const admin_id = req.user.id;

            if (!booking_id || typeof approve !== 'boolean') {
                return res.status(400).json({ error: 'Booking ID and approve status are required' });
            }

            const success = await Booking.processRefund(booking_id, admin_id, approve, admin_notes);
            
            if (success) {
                // Send refund processed email
                try {
                    const booking = await Booking.getById(booking_id);
                    const user = await User.findById(booking.user_id);
                    
                    await EmailService.sendRefundProcessedEmail({
                        user: user,
                        booking: booking,
                        approved: approve,
                        admin_notes: admin_notes
                    });
                } catch (emailError) {
                    console.log('📧 Refund email failed:', emailError.message);
                }

                res.json({
                    success: true,
                    message: approve 
                        ? 'Refund processed successfully' 
                        : 'Refund request rejected'
                });
            } else {
                res.status(400).json({ error: 'Failed to process refund' });
            }

        } catch (error) {
            console.error('Process refund error:', error);
            res.status(400).json({ error: error.message });
        }
    }

    // Get pending refund requests (Admin only)
    static async getPendingRefunds(req, res) {
        try {
            const [refunds] = await pool.execute(
                `SELECT b.*, u.name as user_name, u.email as user_email,
                        e.title as event_title, e.event_date,
                        TIMESTAMPDIFF(HOUR, p.payment_timestamp, NOW()) as hours_since_payment
                 FROM bookings b
                 JOIN users u ON b.user_id = u.id
                 JOIN events e ON b.event_id = e.id
                 JOIN payments p ON b.id = p.booking_id
                 WHERE b.refund_status = 'requested'
                 ORDER BY b.cancellation_requested_at DESC`
            );

            res.json({
                success: true,
                refunds: refunds
            });

        } catch (error) {
            console.error('Get pending refunds error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}

module.exports = RefundController;