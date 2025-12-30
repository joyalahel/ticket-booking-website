const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Event = require('../models/Event');
const EmailService = require('../services/emailService');
const QRService = require('../services/qrService');
const PaymentMethod = require('../models/PaymentMethod');

class PaymentController {
    // SINGLE PAYMENT ROUTE - Creates and processes payment
    static async createPayment(req, res) {
        try {
            const { booking_id, method } = req.body;
            const user_id = req.user.id;

            console.log('[Payment] Processing payment for booking:', booking_id);

            if (!booking_id) {
                console.log('[Payment] Missing booking_id');
                return res.status(400).json({ error: 'Booking ID is required' });
            }

            // Get booking and verify ownership
            const booking = await Booking.getById(booking_id);
            if (!booking) {
                console.log('[Payment] Booking not found:', booking_id);
                return res.status(404).json({ error: 'Booking not found' });
            }

            if (booking.user_id !== user_id) {
                console.log('[Payment] User not authorized for booking:', booking_id);
                return res.status(403).json({ error: 'Not authorized to pay for this booking' });
            }

            if (booking.payment_status === 'paid') {
                console.log('[Payment] Booking already paid');
                return res.status(400).json({ error: 'Booking is already paid' });
            }

            // Validate payment method from DB
            if (!method) {
                return res.status(400).json({ error: 'Payment method is required' });
            }

                const activeMethods = await PaymentMethod.getActiveMethods();
                const validCodes = activeMethods.map(m => m.code);
                const hasCard = activeMethods.some(m => ['card', 'visa', 'debit_card'].includes(m.code));
                if (hasCard && !validCodes.includes('card')) {
                    validCodes.push('card');
                }
                if (!validCodes.includes(method)) {
                    console.log('[Payment] Invalid payment method:', method);
                    return res.status(400).json({ error: `Invalid payment method. Valid methods: ${validCodes.join(', ')}` });
                }

                // Normalize merged card option
                const effectiveMethod = (method === 'card' && hasCard) ? 'card' : method;

                // Generate transaction ID
                const transaction_id = PaymentController.generateTransactionId(effectiveMethod);

            console.log('[Payment] Creating payment with:', {
                    booking_id,
                    method: effectiveMethod,
                    transaction_id,
                    status: 'success'
                });

                const paymentData = {
                    booking_id,
                    method: effectiveMethod,
                    payment_method: effectiveMethod,
                    transaction_id,
                    status: 'success'
                };

            const paymentId = await Payment.create(paymentData);
            console.log('[Payment] Payment created with ID:', paymentId);

                // Update booking payment method and status
                await Payment.updateBookingPaymentMethod(booking_id, effectiveMethod);
            await Booking.updatePaymentStatus(booking_id, 'paid');
            console.log('[Payment] Booking status updated to paid');

            // Lock any reserved seats so they don't expire after payment
            let lockedSeatIds = [];
            try {
                lockedSeatIds = await Booking.finalizeSeatReservations(booking_id);
                if (lockedSeatIds.length) {
                    console.log(`[Payment] Locked ${lockedSeatIds.length} seats for booking ${booking_id}`);
                }
            } catch (seatError) {
                console.error('[Payment] Failed to lock seats after payment:', seatError);
                return res.status(500).json({
                    error: 'Payment recorded but failed to lock your seats. Please contact support with your booking reference.'
                });
            }

            // Ensure individual tickets exist
            let individualTickets = await Booking.getIndividualTickets(booking_id);
            if (individualTickets.length === 0 && booking.quantity > 0) {
                console.log('[Payment] Creating missing individual tickets for booking:', booking_id);
                const seatsForTickets = lockedSeatIds.length ? lockedSeatIds : [];
                await Booking.createIndividualTickets(booking_id, booking.quantity, seatsForTickets);
                individualTickets = await Booking.getIndividualTickets(booking_id);
            }

            const payment = await Payment.getById(paymentId);

            // Send PDF confirmation email
            try {
                const user = await User.findById(user_id);
                const event = await Event.getById(booking.event_id);
                // Refresh tickets to include any seat assignments
                individualTickets = individualTickets.length ? individualTickets : await Booking.getIndividualTickets(booking_id);
                await EmailService.sendBookingConfirmationWithPDF({
                    booking,
                    user,
                    event,
                    individualTickets
                });
                console.log('[Payment] PDF tickets email sent successfully');
            } catch (emailError) {
                console.log('[Payment] PDF email failed, but payment was processed:', emailError.message);
            }

            res.status(201).json({
                message: `Payment completed successfully via ${PaymentController.getMethodDisplayName(method)}`,
                payment: {
                    id: payment.id,
                    booking_reference: payment.booking_reference,
                    amount: payment.total_price,
                    method: payment.method,
                    transaction_id: payment.transaction_id,
                    status: payment.status
                }
            });

        } catch (error) {
            console.error('[Payment] Payment processing error:', error);
            res.status(500).json({ error: 'Internal server error: ' + error.message });
        }
    }

    static generateTransactionId(method) {
        const prefixes = {
            paypal: 'PPL',
            checkout: 'CHK',
            stripe: 'STR',
            debit_card: 'DC',
            visa: 'VISA',
            bank_transfer: 'BANK',
            whish: 'WHISH',
            omt: 'OMT',
            bob_finance: 'BOB'
        };

        const prefix = prefixes[method] || 'TXN';
        return `${prefix}_${Date.now()}`;
    }

    static getMethodDisplayName(method) {
        const displayNames = {
            paypal: 'PayPal',
            checkout: 'Checkout.com',
            stripe: 'Stripe',
            debit_card: 'Debit Card',
            visa: 'Visa Card',
            bank_transfer: 'Bank Transfer',
            whish: 'Whish Money',
            omt: 'OMT',
            bob_finance: 'Bob Finance'
        };

        return displayNames[method] || method;
    }

    static async getPayment(req, res) {
        try {
            const payment = await Payment.getById(req.params.id);

            if (!payment) {
                return res.status(404).json({ error: 'Payment not found' });
            }

            if (payment.user_id !== req.user.id && req.user.role !== 'admin') {
                return res.status(403).json({ error: 'Not authorized to view this payment' });
            }

            res.json({ payment });

        } catch (error) {
            console.error('Get payment error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    static async getBookingPayments(req, res) {
        try {
            const bookingId = req.params.bookingId;

            const booking = await Booking.getById(bookingId);
            if (!booking) {
                return res.status(404).json({ error: 'Booking not found' });
            }

            if (booking.user_id !== req.user.id && req.user.role !== 'admin') {
                return res.status(403).json({ error: 'Not authorized to view these payments' });
            }

            const payments = await Payment.getByBooking(bookingId);
            res.json({ payments });

        } catch (error) {
            console.error('Get booking payments error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Get available payment methods from DB
    static async getPaymentMethods(req, res) {
        try {
            const methods = await PaymentMethod.getActiveMethods();

            if (!methods.length) {
                return res.status(404).json({
                    success: false,
                    error: 'No payment methods configured'
                });
            }

            // Merge visa/debit into a single card entry if present
            const hasCard = methods.some(m => ['card', 'visa', 'debit_card'].includes(m.code));
            let normalized = methods.filter(m => !['visa', 'debit_card'].includes(m.code));
            if (hasCard && !normalized.find(m => m.code === 'card')) {
                normalized.push({
                    code: 'card',
                    name: 'Card',
                    description: 'Visa / Debit card',
                    category: 'cards',
                    requires_online: true,
                    instant_confirmation: true,
                    logo: methods.find(m => m.code === 'card')?.logo
                });
            }

            res.json({
                success: true,
                payment_methods: normalized
            });
        } catch (error) {
            console.error('Get payment methods error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}

module.exports = PaymentController;
