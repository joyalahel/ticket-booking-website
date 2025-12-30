const Booking = require('../models/Booking');
const Event = require('../models/Event');
const QRService = require('../services/qrService'); // Add QR service
const EmailService = require('../services/emailService');
const User = require('../models/User');
const Seating = require('../models/Seating'); 
const Payment = require('../models/Payment');
class BookingController {
  
    static async createBooking(req, res) {
    try {
        const { event_id, quantity, seatIds } = req.body;
        const user_id = req.user.id;

        // Validation
        if (!event_id || !quantity) {
            return res.status(400).json({ error: 'Event ID and quantity are required' });
        }

        if (quantity < 1) {
            return res.status(400).json({ error: 'Quantity must be at least 1' });
        }

        console.log('🔍 Creating booking with seats:', seatIds);

        // Create booking with seat reservation
        const booking = await Booking.createWithSeatReservation({
            user_id,
            event_id,
            quantity
        }, seatIds, 10); // 10 minutes for seat reservation

        const fullBooking = await Booking.getById(booking.bookingId);
        const user = await User.findById(user_id);
        const event = await Event.getById(event_id);

        // Email sending is now deferred until the booking is confirmed.
        // The user will receive a separate email after calling the /confirm endpoint.

        // Prepare response
        const response = {
            success: true,
            message: 'Booking created successfully',
            booking: {
                id: booking.bookingId,
                reference: booking.bookingReference,
                totalPrice: booking.totalPrice,
                status: 'pending',
                payment_expires: booking.paymentExpires,
                payment_minutes_remaining: 24 * 60 // 24 hours
            }
        };

        // Add seat reservation info if seats were reserved
        if (booking.reservation) {
            response.reservation = {
                token: booking.reservation.token,
                expires_at: booking.reservation.expires_at,
                minutes_remaining: 10,
                seat_count: seatIds ? seatIds.length : 0
            };
            response.message += ' Seats reserved for 10 minutes. Complete your booking to confirm seats.';
        }

        response.message += ` You have 24 hours to complete payment.`;

        res.status(201).json(response);

    } catch (error) {
        console.error('Create booking error:', error);
        
        if (error.message === 'Event not found or inactive') {
            return res.status(404).json({ error: 'Event not found' });
        }
        
        if (error.message.includes('Not enough tickets available')) {
            return res.status(400).json({ error: error.message });
        }

        if (error.message.includes('seats are no longer available')) {
            return res.status(400).json({ error: error.message });
        }

        res.status(500).json({ 
            success: false,
            error: 'Internal server error: ' + error.message 
        });
    }
}

   static async handlePaymentSuccess(req, res) {
    console.log('🎯 [1] handlePaymentSuccess METHOD CALLED!');
    console.log('📦 [1] Request body:', req.body);
    
    try {
        const { booking_id, transaction_id, payment_method = 'card', seatIds, reservationToken } = req.body;
        console.log('🔍 [2] Extracted parameters:', { booking_id, transaction_id, payment_method, seatIds, reservationToken });

        if (!booking_id) {
            console.log('❌ [3] Missing booking_id');
            return res.status(400).json({ error: 'Booking ID is required' });
        }

        console.log('🔍 [4] Processing payment for booking:', booking_id);

        // ✅ ADD: Get booking with timer information
        console.log('🔍 [4.1] Checking booking timers...');
        const bookingWithTimers = await Booking.getBookingWithTimers(booking_id);
        
        if (!bookingWithTimers) {
            console.log('❌ [4.2] Booking not found:', booking_id);
            return res.status(404).json({ error: 'Booking not found' });
        }

        // ✅ ADD: Check if payment period expired (24 hours)
        if (bookingWithTimers.payment_seconds_remaining < 0) {
            console.log('❌ [4.3] Payment period expired for booking:', booking_id);
            return res.status(400).json({ 
                success: false,
                error: 'Payment period expired (24 hours). Please create a new booking.' 
            });
        }

        // ✅ ADD: Check if seat reservation expired (10 minutes) - only if seats were reserved
        let seatReservationValid = true;
        if (seatIds && reservationToken) {
            console.log('🔍 [4.4] Checking seat reservation timer...');
            const seatReservation = await Booking.isSeatReservationValid(booking_id);
            
            if (!seatReservation) {
                console.log('❌ [4.5] Seat reservation expired for booking:', booking_id);
                seatReservationValid = false;
                
                // Check if this booking originally had seat reservations
                const hadSeatReservations = await Booking.hasSeatReservations(booking_id);
                if (hadSeatReservations) {
                    return res.status(400).json({ 
                        success: false,
                        error: 'Seat reservation expired (10 minutes). Seats have been released. Please create a new booking.' 
                    });
                }
            } else {
                console.log('✅ [4.5] Seat reservation still valid, minutes remaining:', Math.floor(seatReservation.seconds_remaining / 60));
            }
        }

        console.log('🔍 [5] Updating payment status...');
        const paymentUpdated = await Booking.updatePaymentStatus(booking_id, 'paid');
        if (!paymentUpdated) {
            console.log('❌ [6] Failed to update payment status');
            return res.status(404).json({ error: 'Booking not found or could not update payment status' });
        }
        console.log('✅ [6] Payment status updated successfully');

        // Update payment details
        console.log('🔍 [7] Updating payment details...');
        try {
            if (Booking.updatePaymentDetails) {
                await Booking.updatePaymentDetails(booking_id, {
                    payment_method,
                    transaction_id
                });
                console.log('✅ [8] Payment details updated');
            }
        } catch (detailError) {
            console.log('⚠️ [8] Payment details update failed:', detailError.message);
        }

        // Get complete booking details
        console.log('🔍 [9] Fetching booking details...');
        const booking = await Booking.getById(booking_id);
        if (!booking) {
            console.log('❌ [10] Booking not found:', booking_id);
            return res.status(404).json({ error: 'Booking not found' });
        }
        console.log('✅ [11] Booking found:', { id: booking.id, user_id: booking.user_id, quantity: booking.quantity });

        console.log('🔍 [12] Fetching user details...');
        const user = await User.findById(booking.user_id);
        if (!user) {
            console.log('❌ [13] User not found for booking:', booking.user_id);
            return res.status(404).json({ error: 'User not found' });
        }
        console.log('✅ [14] User found:', { name: user.name, email: user.email });

        console.log('🔍 [15] Fetching event details...');
        const event = await Event.getById(booking.event_id);
        if (!event) {
            console.log('❌ [16] Event not found:', booking.event_id);
            return res.status(404).json({ error: 'Event not found' });
        }
        console.log('✅ [17] Event found:', { title: event.title });

        // ✅ CRITICAL: Confirm seat booking if seats were reserved AND reservation is still valid
        let confirmedSeats = [];
        if (seatIds && reservationToken && seatReservationValid) {
            console.log('🔍 [18] Confirming seat booking...');
            try {
                await Seating.confirmSeatBooking(booking_id, seatIds, reservationToken);
                console.log('✅ [19] Seats confirmed for booking:', booking_id);
                
                // Get seat details for QR code and email
                confirmedSeats = await Seating.getSeatDetails(seatIds);
                console.log('✅ [20] Seat details retrieved:', confirmedSeats.length, 'seats');
            } catch (seatError) {
                console.error('❌ [19] Seat confirmation FAILED:', seatError.message);
                return res.status(400).json({ 
                    success: false,
                    error: 'Seat reservation expired or invalid. Please select seats again.' 
                });
            }
        } else if (seatIds && reservationToken && !seatReservationValid) {
            console.log('⚠️ [18] Seat reservation expired, skipping seat confirmation');
            // Don't confirm seats, but continue with payment for non-seat tickets
        } else {
            console.log('⚠️ [18] No seat reservation data provided');
        }

        // ✅ NEW: Get individual tickets for this booking
        console.log('🔍 [21] Getting individual tickets...');
        let individualTickets = [];
        try {
            individualTickets = await Booking.getIndividualTickets(booking_id);
            console.log('✅ [22] Individual tickets retrieved:', individualTickets.length);
            
            // If individual tickets don't exist yet, create them
            if (individualTickets.length === 0) {
                console.log('🔍 [22.1] Creating individual tickets...');
                await Booking.createIndividualTickets(booking_id, booking.quantity, seatIds || []);
                individualTickets = await Booking.getIndividualTickets(booking_id);
                console.log('✅ [22.2] Individual tickets created:', individualTickets.length);
            }
        } catch (ticketError) {
            console.error('❌ [22] Individual tickets error:', ticketError.message);
            return res.status(500).json({ 
                success: false,
                error: 'Failed to process tickets. Please contact support.' 
            });
        }

        // ✅ NEW: Send PDF email with individual QR codes
        console.log('📧 [23] Sending PDF tickets email to:', user.email);
        try {
            await EmailService.sendBookingConfirmationWithPDF({
                booking: booking,
                user: user,
                event: event,
                individualTickets: individualTickets
            });
            console.log('✅ [24] PDF tickets email sent successfully!');
        } catch (emailError) {
            console.error('❌ [24] PDF email sending FAILED:', emailError.message);
            return res.status(500).json({ 
                success: false,
                error: 'Payment processed but failed to send tickets. Please contact support.' 
            });
        }

        // Mark confirmation as sent
        console.log('🔍 [25] Marking confirmation as sent...');
        try {
            if (Booking.markConfirmationSent) {
                await Booking.markConfirmationSent(booking_id);
                console.log('✅ [26] Confirmation marked as sent');
            }
        } catch (markError) {
            console.log('⚠️ [26] Mark confirmation failed:', markError.message);
        }

        // ✅ ADD: Clear any remaining seat reservations
        console.log('🔍 [27] Cleaning up seat reservations...');
        try {
            if (reservationToken) {
                await Seating.cleanupReservation(reservationToken);
                console.log('✅ [28] Seat reservations cleaned up');
            }
        } catch (cleanupError) {
            console.log('⚠️ [28] Seat cleanup failed:', cleanupError.message);
        }

        console.log('🎉 [29] Payment completed successfully' + (confirmedSeats.length > 0 ? ' with seats' : ''));
        
        // ✅ UPDATED: Success message for PDF tickets
        let successMessage = 'Payment successful! ';
        if (confirmedSeats.length > 0) {
            successMessage += `Your ${individualTickets.length} digital tickets with seat confirmation have been sent to your email as a PDF.`;
        } else if (seatIds && !seatReservationValid) {
            successMessage += `Payment processed, but seats were released due to timeout. Your ${individualTickets.length} general admission tickets have been sent as a PDF.`;
        } else {
            successMessage += `Your ${individualTickets.length} tickets have been sent to your email as a PDF.`;
        }

        res.json({
            success: true,
            message: successMessage,
            booking: {
                id: booking.id,
                reference: booking.booking_reference,
                status: 'paid',
                total_tickets: individualTickets.length,
                seats: confirmedSeats, // ✅ Return seat info (empty if no seats)
                had_seat_timeout: (seatIds && !seatReservationValid), // ✅ Indicate if seats timed out
                ticket_format: 'pdf' // ✅ Indicate tickets were sent as PDF
            }
        });

    } catch (error) {
        console.error('❌ [ERROR] Payment success handling error:', error);
        console.error('❌ [ERROR] Stack trace:', error.stack);
        res.status(500).json({ 
            success: false,
            error: 'Failed to process payment: ' + error.message 
        });
    }
}
static async confirmBooking(req, res) {
    try {
        const bookingId = req.params.id;
        const userId = req.user.id;

        // Get booking and verify ownership
        const booking = await Booking.getById(bookingId);
        if (!booking) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        if (booking.user_id !== userId) {
            return res.status(403).json({ error: 'Not authorized to confirm this booking' });
        }

        // Persist selected payment method (for pending payment page)
        const { payment_method } = req.body || {};
        if (payment_method) {
            try {
                await Payment.updateBookingPaymentMethod(bookingId, payment_method);
            } catch (pmError) {
                console.log('Payment method save failed:', pmError.message);
            }
        }

        // Confirm booking
        const confirmed = await Booking.confirmBooking(bookingId);
        
        if (!confirmed) {
            return res.status(400).json({ error: 'Failed to confirm booking. Confirmation window may have expired.' }); // FIXED: Removed extra backslash
        }

        const updatedBooking = await Booking.getById(bookingId);

        // Send booking confirmation email after confirmation
        const user = await User.findById(userId);
        const event = await Event.getById(updatedBooking.event_id);

        try {
            const sent = await EmailService.sendBookingConfirmation(updatedBooking, user, event);
            if (!sent) {
                console.log('Confirmation email failed to send (service returned false).');
                return res.status(500).json({ error: 'Booking confirmed, but email could not be sent. Please contact support.' });
            }
            console.log('Confirmation email sent after booking confirmation.');
        } catch (emailError) {
            console.log('Confirmation email sending failed after booking confirmation:', emailError.message);
            return res.status(500).json({ error: 'Booking confirmed, but email could not be sent. Please contact support.' });
        }

        res.json({
            success: true,
            message: 'Booking confirmed! You have 24 hours to complete payment.',
            booking: updatedBooking,
            payment_window: {
                expires_at: updatedBooking.payment_expires,
                hours_remaining: 24
            }
        });

    } catch (error) {
        console.error('Confirm booking error:', error);
        
        if (error.message.includes('confirmation window has expired')) {
            return res.status(400).json({ error: 'Confirmation window has expired. Please start over.' });
        }
        
        res.status(500).json({ error: 'Internal server error' });
    }
}
    // Get user's bookings
    static async getMyBookings(req, res) {
        try {
            const bookings = await Booking.getByUser(req.user.id);
            
            // ✅ ADDED: Include QR codes for paid bookings
            const bookingsWithQR = await Promise.all(
                bookings.map(async (booking) => {
                    if (booking.payment_status === 'paid') {
                        try {
                            const qrContent = QRService.generateTicketQRContent(
                                booking.id, 
                                booking.event_id, 
                                booking.user_id
                            );
                            booking.qr_code = await QRService.generateQRCodeDataURL(qrContent);
                        } catch (qrError) {
                            console.log('QR generation failed for booking:', booking.id, qrError.message);
                            booking.qr_code = null;
                        }
                    }
                    return booking;
                })
            );

            res.json({ 
                success: true,
                bookings: bookingsWithQR 
            });
        } catch (error) {
            console.error('Get bookings error:', error);
            res.status(500).json({ 
                success: false,
                error: 'Internal server error' 
            });
        }
    }

    // Get single booking
    static async getBooking(req, res) {
        try {
            const booking = await Booking.getById(req.params.id);
            
            if (!booking) {
                return res.status(404).json({ 
                    success: false,
                    error: 'Booking not found' 
                });
            }

            // Check if user owns this booking
            if (booking.user_id !== req.user.id && req.user.role !== 'admin') {
                return res.status(403).json({ 
                    success: false,
                    error: 'Not authorized to view this booking' 
                });
            }

            // ✅ ADDED: Generate QR code if booking is paid
            if (booking.payment_status === 'paid') {
                try {
                    const qrContent = QRService.generateTicketQRContent(
                        booking.id, 
                        booking.event_id, 
                        booking.user_id
                    );
                    booking.qr_code = await QRService.generateQRCodeDataURL(qrContent);
                } catch (qrError) {
                    console.log('QR generation failed for booking:', booking.id, qrError.message);
                    booking.qr_code = null;
                }
            }

        res.json({ 
                success: true,
                booking 
            });
        } catch (error) {
            console.error('Get booking error:', error);
            res.status(500).json({ 
                success: false,
                error: 'Internal server error' 
            });
        }
    }

    // Cancel booking
    static async cancelBooking(req, res) {
        try {
            const bookingId = req.params.id;
            const userId = req.user.id;

            const cancelled = await Booking.cancel(bookingId, userId);
            
            if (!cancelled) {
                return res.status(404).json({ 
                    success: false,
                    error: 'Booking not found or cannot be cancelled' 
                });
            }

        res.json({ 
                success: true,
                message: 'Booking cancelled successfully' 
            });
        } catch (error) {
            console.error('Cancel booking error:', error);
            res.status(500).json({ 
                success: false,
                error: 'Internal server error' 
            });
        }
    }

    // Get available tickets for an event
    static async getAvailableTickets(req, res) {
        try {
            const available = await Booking.getAvailableTickets(req.params.eventId);
            res.json({ 
                success: true,
                available_tickets: available 
            });
        } catch (error) {
            console.error('Get available tickets error:', error);
            res.status(500).json({ 
                success: false,
                error: 'Internal server error' 
            });
        }
    }

    // ✅ ADDED: Webhook for payment failures
    static async handlePaymentFailure(req, res) {
        try {
            const { booking_id, reason } = req.body;

            if (!booking_id) {
                return res.status(400).json({ error: 'Booking ID is required' });
            }

            await Booking.updatePaymentStatus(booking_id, 'failed');

            res.json({
                success: true,
                message: 'Payment failure recorded'
            });

        } catch (error) {
            console.error('Payment failure handling error:', error);
            res.status(500).json({ 
                success: false,
                error: 'Failed to process payment failure' 
            });
        }
    }

    // ✅ ADDED: Get booking by reference (for QR scanning)
    static async getBookingByReference(req, res) {
        try {
            const { reference } = req.params;
            
            const booking = await Booking.getByReference(reference);
            if (!booking) {
                return res.status(404).json({ 
                    success: false,
                    error: 'Booking not found' 
                });
            }

            // For organizers/admins, include QR validation info
            if (req.user.role === 'organizer' || req.user.role === 'admin') {
                // Verify organizer owns the event if they're not admin
                if (req.user.role === 'organizer') {
                    const isOrganizer = await Event.isOrganizer(booking.event_id, req.user.id);
                    if (!isOrganizer) {
                        return res.status(403).json({ 
                            success: false,
                            error: 'Not authorized to view this booking' 
                        });
                    }
                }

                // Add check-in status
                booking.can_check_in = booking.payment_status === 'paid' && !booking.is_used;
                booking.check_in_status = booking.is_used ? 
                    `Checked in at ${new Date(booking.used_at).toLocaleString()}` : 
                    'Not checked in';
            }

        res.json({ 
                success: true,
                booking 
            });

        } catch (error) {
            console.error('Get booking by reference error:', error);
            res.status(500).json({ 
                success: false,
                error: 'Internal server error' 
            });
        }
    }
    // Confirm booking (within 10 minutes) to keep seats and send 24h payment email
    static async confirmBooking(req, res) {
        try {
            const bookingId = req.params.id;
            const userId = req.user.id;

            // Get booking and verify ownership
            const booking = await Booking.getById(bookingId);
            if (!booking) {
                return res.status(404).json({ error: 'Booking not found' });
            }

            if (booking.user_id !== userId) {
                return res.status(403).json({ error: 'Not authorized to confirm this booking' });
            }

            // Persist selected payment method (for pending payment page)
            const { payment_method } = req.body || {};
            if (payment_method) {
                try {
                    await Payment.updateBookingPaymentMethod(bookingId, payment_method);
                } catch (pmError) {
                    console.log('Payment method save failed:', pmError.message);
                }
            }

            // Confirm booking
            const confirmed = await Booking.confirmBooking(bookingId);
            
            if (!confirmed) {
                return res.status(400).json({ error: 'Failed to confirm booking. Confirmation window may have expired.' });
            }

            const updatedBooking = await Booking.getById(bookingId);

            // Send booking confirmation email after confirmation
            const user = await User.findById(userId);
            const event = await Event.getById(updatedBooking.event_id);

            try {
                const sent = await EmailService.sendBookingConfirmation(updatedBooking, user, event);
                if (!sent) {
                    console.log('Confirmation email failed to send (service returned false).');
                    return res.status(500).json({ error: 'Booking confirmed, but email could not be sent. Please contact support.' });
                }
                console.log('Confirmation email sent after booking confirmation.');
            } catch (emailError) {
                console.log('Confirmation email sending failed after booking confirmation:', emailError.message);
                return res.status(500).json({ error: 'Booking confirmed, but email could not be sent. Please contact support.' });
            }

            res.json({
                success: true,
                message: 'Booking confirmed! You have 24 hours to complete payment.',
                booking: updatedBooking,
                payment_window: {
                    expires_at: updatedBooking.payment_expires,
                    hours_remaining: 24
                }
            });

        } catch (error) {
            console.error('Confirm booking error:', error);
            
            if (error.message.includes('confirmation window has expired')) {
                return res.status(400).json({ error: 'Confirmation window has expired. Please start over.' });
            }
            
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}

module.exports = BookingController;
