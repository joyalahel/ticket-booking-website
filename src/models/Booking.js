const pool = require('../config/database');
const generateBookingReference = require('../utils/generateReference');

class Booking {
   // Update the existing create method to create individual tickets
   static async create(bookingData) {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();

        const { user_id, event_id, quantity, seatIds = [] } = bookingData;
        const booking_reference = generateBookingReference();
        
        // Get event price and check availability
        const [events] = await connection.execute(
            'SELECT price, capacity FROM events WHERE id = ? AND is_active = TRUE',
            [event_id]
        );
        
        if (events.length === 0) {
            throw new Error('Event not found or inactive');
        }

        const event = events[0];
        const total_price = event.price * quantity;

        // Check available tickets
        const available = await this.getAvailableTickets(event_id);
        if (available < quantity) {
            throw new Error(`Not enough tickets available. Only ${available} tickets left.`);
        }

        // Create booking
        const [result] = await connection.execute(
            `INSERT INTO bookings (user_id, event_id, quantity, total_price, booking_reference, payment_status) 
             VALUES (?, ?, ?, ?, ?, 'pending')`,
            [user_id, event_id, quantity, total_price, booking_reference]
        );

        const bookingId = result.insertId;

        // Create individual ticket records
        await this.createIndividualTickets(bookingId, quantity, seatIds);

        await connection.commit();

        // EMIT REAL-TIME UPDATE AFTER SUCCESSFUL BOOKING
        setTimeout(async () => {
            try {
                const availability = await this.getRealTimeAvailability(event_id);
                const io = global.io;
                if (io && availability) {
                    io.to(`event-${event_id}`).emit('ticket-update', {
                        eventId: parseInt(event_id),
                        availableTickets: availability.availableTickets,
                        lastAction: 'booking_created',
                        bookingReference: booking_reference,
                        ticketsBooked: quantity,
                        timestamp: new Date().toISOString()
                    });

                    // Push seat-level updates so UI reflects reserved seats without refresh
                    if (seatIds && seatIds.length) {
                        io.to(`event-${event_id}`).emit('seat-status', {
                            eventId: parseInt(event_id),
                            seats: seatIds,
                            status: 'reserved',
                            timestamp: new Date().toISOString()
                        });
                    }
                }
                await this.checkLowAvailability(event_id);
            } catch (error) {
                console.error('Error emitting real-time update after booking:', error);
            }
        }, 100);

        return {
            bookingId: bookingId,
            bookingReference: booking_reference,
            totalPrice: total_price
        };

    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

    // Get available tickets for an event
    static async getAvailableTickets(eventId) {
        const [rows] = await pool.execute(
            `SELECT e.capacity - COALESCE(SUM(b.quantity), 0) as available 
             FROM events e 
             LEFT JOIN bookings b ON e.id = b.event_id AND b.payment_status = 'paid'
             WHERE e.id = ? AND e.is_active = TRUE
             GROUP BY e.id`,
            [eventId]
        );
        return rows[0]?.available || 0;
    }

    // Update the getById method to include individual tickets
   static async getById(id) {
    const [rows] = await pool.execute(
        `SELECT b.*, e.title, e.venue, e.event_date, e.price, e.organizer_id,
                u.name as user_name, u.email as user_email,
                org.name as organizer_name
         FROM bookings b
         JOIN events e ON b.event_id = e.id
         JOIN users u ON b.user_id = u.id
         LEFT JOIN users org ON e.organizer_id = org.id
         WHERE b.id = ?`,
        [id]
    );
    
    if (rows[0]) {
        // Get individual tickets for this booking
        const individualTickets = await this.getIndividualTickets(id);
        rows[0].individualTickets = individualTickets;
        // ✅ FIX: Ensure the quantity is correctly set from the booking record
        rows[0].quantity = parseInt(rows[0].quantity);
    }
    
    return rows[0];
}
// ✅ ADD: Get bookings with pending payments
static async getBookingsWithPendingPayments() {
    const [rows] = await pool.execute(
        `SELECT b.*, p.method as payment_method, p.transaction_id,
                e.title as event_title, u.name as user_name, u.email as user_email
         FROM bookings b
         JOIN payments p ON b.id = p.booking_id
         JOIN events e ON b.event_id = e.id
         JOIN users u ON b.user_id = u.id
         WHERE p.status = 'pending'
         ORDER BY b.created_at DESC`
    );
    return rows;
}
    // Get user's bookings
static async getByUser(userId) {
        const [rows] = await pool.execute(
            `SELECT 
                b.*,
                COALESCE(b.payment_method, pm.method) as payment_method,
                e.title, e.venue, e.event_date, e.image_url, e.organizer_id,
                u.name as organizer_name
             FROM bookings b
             JOIN events e ON b.event_id = e.id
             LEFT JOIN users u ON e.organizer_id = u.id
             LEFT JOIN (
                 SELECT p.booking_id, p.method
                 FROM payments p
                 INNER JOIN (
                     SELECT booking_id, MAX(created_at) as max_created
                     FROM payments
                     GROUP BY booking_id
                 ) latest ON latest.booking_id = p.booking_id AND latest.max_created = p.created_at
             ) pm ON pm.booking_id = b.id
             WHERE b.user_id = ?
             ORDER BY b.created_at DESC`,
            [userId]
        );
        return rows;
    }

    // Get bookings by event (for organizers)
    static async getByEvent(eventId, organizerId = null) {
        let query = `
            SELECT b.*, u.name as user_name, u.email as user_email
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            JOIN events e ON b.event_id = e.id
            WHERE b.event_id = ?
        `;
        
        const params = [eventId];
        
        // If organizerId provided, verify they own the event
        if (organizerId) {
            query += ' AND e.organizer_id = ?';
            params.push(organizerId);
        }
        
        query += ' ORDER BY b.created_at DESC';
        
        const [rows] = await pool.execute(query, params);
        return rows;
    }

    // Update booking payment status
    static async updatePaymentStatus(bookingId, status) {
    const [result] = await pool.execute(
        'UPDATE bookings SET payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, bookingId]
    );
    return result.affectedRows > 0;
}

    // ✅ ADDED: Update payment details (for QR code automation)
    static async updatePaymentDetails(bookingId, paymentDetails) {
        const { payment_method, transaction_id } = paymentDetails;
        
        const [result] = await pool.execute(
            'UPDATE bookings SET payment_method = ?, transaction_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [payment_method, transaction_id, bookingId]
        );
        return result.affectedRows > 0;
    }

    // Update payment success method to include real-time updates
static async processPaymentSuccess(bookingId, paymentDetails) {
    console.log('🔍 [Booking] processPaymentSuccess called for:', bookingId);
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();

        // Update payment status
        const statusUpdated = await this.updatePaymentStatus(bookingId, 'paid');
        if (!statusUpdated) {
            throw new Error('Failed to update payment status');
        }

        // Update payment details
        const detailsUpdated = await this.updatePaymentDetails(bookingId, paymentDetails);
        if (!detailsUpdated) {
            throw new Error('Failed to update payment details');
        }

        // Get event ID for real-time update
        const [bookings] = await connection.execute(
            'SELECT event_id FROM bookings WHERE id = ?',
            [bookingId]
        );
        
        const eventId = bookings[0].event_id;

        await connection.commit();

        // Ensure seats stay booked after successful payment
        try {
            await this.finalizeSeatReservations(bookingId);
        } catch (seatError) {
            console.error('Failed to finalize seat reservations after payment:', seatError);
        }

        // EMIT REAL-TIME UPDATE AFTER PAYMENT CONFIRMATION
        setTimeout(async () => {
            try {
                const availability = await this.getRealTimeAvailability(eventId);
                const io = global.io;
                if (io && availability) {
                    io.to(`event-${eventId}`).emit('ticket-update', {
                        eventId: parseInt(eventId),
                        availableTickets: availability.availableTickets,
                        lastAction: 'payment_confirmed',
                        bookingReference: paymentDetails.booking_reference,
                        timestamp: new Date().toISOString()
                    });
                }
                await this.checkLowAvailability(eventId);
            } catch (error) {
                console.error('Error emitting real-time update after payment:', error);
            }
        }, 100);

        console.log('✅ [Booking] Payment processed successfully');
        return true;

    } catch (error) {
        await connection.rollback();
        console.error('❌ [Booking] Payment processing failed:', error);
        throw error;
    } finally {
        connection.release();
    }
}
   // Update cancellation to include real-time updates
static async cancel(bookingId, userId) {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();

        // Get booking details before cancellation
        const [bookings] = await connection.execute(
            'SELECT event_id, quantity, booking_reference FROM bookings WHERE id = ? AND user_id = ?',
            [bookingId, userId]
        );

        if (bookings.length === 0) {
            throw new Error('Booking not found or not authorized');
        }

        const booking = bookings[0];
        // Gather reserved seats for this booking
        const [reservedSeats] = await connection.execute(
            'SELECT seat_id FROM seat_reservations WHERE booking_id = ?',
            [bookingId]
        );
        const seatIds = reservedSeats.map(r => r.seat_id);
        
        const [result] = await connection.execute(
            'UPDATE bookings SET payment_status = "cancelled", updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND payment_status = "pending"',
            [bookingId, userId]
        );

        const success = result.affectedRows > 0;

        // Release seats and delete reservations if any
        if (success && seatIds.length > 0) {
            await connection.execute(
                `UPDATE seats SET status = 'available' WHERE id IN (${seatIds.map(() => '?').join(',')})`,
                seatIds
            );
            await connection.execute(
                'DELETE FROM seat_reservations WHERE booking_id = ?',
                [bookingId]
            );
        }

        await connection.commit();

        // EMIT REAL-TIME UPDATE AFTER CANCELLATION
        if (success) {
            setTimeout(async () => {
                try {
                    const availability = await this.getRealTimeAvailability(booking.event_id);
                    const io = global.io;
                    if (io) {
                        io.to(`event-${booking.event_id}`).emit('ticket-update', {
                            eventId: parseInt(booking.event_id),
                            availableTickets: availability.availableTickets,
                            lastAction: 'booking_cancelled',
                            bookingReference: booking.booking_reference,
                            ticketsReleased: booking.quantity,
                            timestamp: new Date().toISOString()
                        });
                        await this.checkLowAvailability(booking.event_id);
                    } else {
                        console.log('Skipping socket emit: io not available');
                    }
                } catch (error) {
                    console.error('Error emitting real-time update after cancellation:', error);
                }

                // Try to free seats for waiting list users when availability opens up
                try {
                    const Event = require('./Event');
                    await Event.handleTicketAvailabilityChange(booking.event_id);
                } catch (wlError) {
                    console.error('Waiting list processing failed after cancellation:', wlError.message);
                }
            }, 100);
        }

        return success;

    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }}

    // Check if user has already booked this event
    static async userHasBooking(userId, eventId) {
        const [rows] = await pool.execute(
            'SELECT id FROM bookings WHERE user_id = ? AND event_id = ? AND payment_status IN ("pending", "paid")',
            [userId, eventId]
        );
        return rows.length > 0;
    }
static async hasSeatReservations(bookingId) {
    const [rows] = await pool.execute(
        `SELECT COUNT(*) as reservation_count 
         FROM seat_reservations 
         WHERE booking_id = ?`,
        [bookingId]
    );
    return rows[0]?.reservation_count > 0;
}
    // Mark ticket as used (for QR check-in)
    static async markAsUsed(bookingId) {
        const [result] = await pool.execute(
            'UPDATE bookings SET is_used = TRUE, used_at = CURRENT_TIMESTAMP WHERE id = ? AND payment_status = "paid"',
            [bookingId]
        );
        return result.affectedRows > 0;
    }

    // Check if ticket is already used
    static async isTicketUsed(bookingId) {
        const [rows] = await pool.execute(
            'SELECT is_used FROM bookings WHERE id = ?',
            [bookingId]
        );
        return rows[0]?.is_used || false;
    }

    // Get booking by reference
    static async getByReference(reference) {
        const [rows] = await pool.execute(
            `SELECT b.*, e.title, e.venue, e.event_date, e.price,
                    u.name as user_name, u.email as user_email
             FROM bookings b
             JOIN events e ON b.event_id = e.id
             JOIN users u ON b.user_id = u.id
             WHERE b.booking_reference = ?`,
            [reference]
        );
        return rows[0];
    }

    // Get booking statistics for dashboard
    static async getStats(organizerId = null) {
        let query = `
            SELECT 
                COUNT(*) as total_bookings,
                SUM(CASE WHEN payment_status = 'paid' THEN quantity ELSE 0 END) as tickets_sold,
                SUM(CASE WHEN payment_status = 'paid' THEN total_price ELSE 0 END) as total_revenue,
                SUM(CASE WHEN payment_status = 'pending' THEN 1 ELSE 0 END) as pending_bookings
            FROM bookings b
            JOIN events e ON b.event_id = e.id
            WHERE e.is_active = TRUE
        `;
        
        const params = [];
        
        if (organizerId) {
            query += ' AND e.organizer_id = ?';
            params.push(organizerId);
        }
        
        const [rows] = await pool.execute(query, params);
        return rows[0];
    }

    // ✅ ADDED: Get paid bookings for email sending (batch processing)
    static async getPaidBookingsWithoutEmails() {
        const [rows] = await pool.execute(
            `SELECT b.*, e.title as event_title, e.event_date, e.venue,
                    u.name as user_name, u.email as user_email
             FROM bookings b
             JOIN events e ON b.event_id = e.id
             JOIN users u ON b.user_id = u.id
             WHERE b.payment_status = 'paid' 
             AND b.confirmation_sent = FALSE
             ORDER BY b.created_at DESC`
        );
        return rows;
    }

    static async markConfirmationSent(bookingId) {
    console.log('🔍 [Booking] markConfirmationSent called for:', bookingId);
    const [result] = await pool.execute(
        'UPDATE bookings SET confirmation_sent = TRUE WHERE id = ?',
        [bookingId]
    );
    console.log('✅ [Booking] Confirmation marked as sent');
    return result.affectedRows > 0;
}
static async createWithSeatReservation(bookingData, seatIds, reservationDuration = 10) {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();

        // Clean up expired reservations first
        await this.releaseExpiredSeatReservations();

        const { user_id, event_id, quantity } = bookingData;
        const booking_reference = generateBookingReference();
        
        // Get event price
        const [events] = await connection.execute(
            'SELECT price, capacity FROM events WHERE id = ? AND is_active = TRUE',
            [event_id]
        );
        
        if (events.length === 0) {
            throw new Error('Event not found or inactive');
        }

        const event = events[0];
        const total_price = event.price * quantity;

        // Check available tickets
        const available = await this.getAvailableTickets(event_id);
        if (available < quantity) {
            throw new Error(`Not enough tickets available. Only ${available} tickets left.`);
        }

        // Create booking with PENDING status and 10-minute confirmation window
        const confirmation_expires = new Date(Date.now() + reservationDuration * 60 * 1000); // 10 minutes
        const [result] = await connection.execute(
            `INSERT INTO bookings (user_id, event_id, quantity, total_price, booking_reference, booking_status, confirmation_expires) 
             VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
            [user_id, event_id, quantity, total_price, booking_reference, confirmation_expires]
        );

        const bookingId = result.insertId;

        // ✅ TEMPORARY: Reserve seats for ONLY 10 minutes (until confirmation)
        let reservation = null;
        if (seatIds && seatIds.length > 0) {
            if (seatIds.length !== quantity) {
                throw new Error(`Quantity (${quantity}) must match number of selected seats (${seatIds.length})`);
            }

            const reservationToken = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const reservationExpires = new Date(Date.now() + reservationDuration * 60 * 1000); // 10 minutes

            // Check if seats are available
            const placeholders = seatIds.map(() => '?').join(',');
            const [availableSeats] = await connection.execute(
                `SELECT id FROM seats 
                 WHERE id IN (${placeholders}) 
                 AND status <> 'disabled' 
                 AND id NOT IN (
                     SELECT seat_id FROM seat_reservations 
                     WHERE expires_at > NOW() AND event_id = ? AND status IN ('temporary', 'confirmed')
                 )`,
                [...seatIds, event_id]
            );

            if (availableSeats.length !== seatIds.length) {
                throw new Error('Some seats are no longer available');
            }

            // Create TEMPORARY 10-minute reservations
            for (const seatId of seatIds) {
                await connection.execute(
                    `INSERT INTO seat_reservations (seat_id, event_id, user_id, booking_id, reservation_token, expires_at, status)
                     VALUES (?, ?, ?, ?, ?, ?, 'temporary')`, // ✅ TEMPORARY status
                    [seatId, event_id, user_id, bookingId, reservationToken, reservationExpires]
                );
            }

            reservation = {
                token: reservationToken,
                expires_at: reservationExpires,
                minutes_remaining: reservationDuration,
                type: 'temporary' // 10-minute temporary hold
            };
        }

        await connection.commit();
        
        // Broadcast seat holds in real time
        if (reservation && seatIds.length > 0) {
            this.broadcastSeatStatus(event_id, seatIds, 'reserved', { expires_at: reservation.expires_at });
        }

        return {
            bookingId: bookingId,
            bookingReference: booking_reference,
            totalPrice: total_price,
            confirmationExpires: confirmation_expires, // 10 minutes to confirm
            reservation: reservation  // 10-minute temporary seat hold
        };

    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}
static async confirmBooking(bookingId) {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();

        // Check if booking is still within confirmation window
        const [bookings] = await connection.execute(
            `SELECT id, confirmation_expires, booking_status 
             FROM bookings 
             WHERE id = ? AND confirmation_expires > NOW() AND booking_status = 'pending'`,
            [bookingId]
        );

        if (bookings.length === 0) {
            throw new Error('Booking confirmation window has expired or booking is already confirmed');
        }

        // Update booking status to confirmed and set 24-hour payment window
        const payment_expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        await connection.execute(
            `UPDATE bookings 
             SET booking_status = 'confirmed', 
                 payment_expires = ?,
                 updated_at = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [payment_expires, bookingId]
        );

        // Convert temporary seat reservations to confirmed reservations
        await connection.execute(
            `UPDATE seat_reservations 
             SET status = 'confirmed', 
                 expires_at = ? 
             WHERE booking_id = ? AND status = 'temporary'`,
            [payment_expires, bookingId]
        );

        await connection.commit();
        return true;

    } catch (error) {
        await connection.rollback();
        console.error('Confirm booking error:', error);
        throw error;
    } finally {
        connection.release();
    }
}
// Get booking with reservation and payment status
static async getBookingWithTimers(bookingId) {
    const [rows] = await pool.execute(
        `SELECT b.*,
                sr.reservation_token,
                sr.expires_at as reservation_expires,
                TIMESTAMPDIFF(SECOND, NOW(), sr.expires_at) as reservation_seconds_remaining,
                TIMESTAMPDIFF(SECOND, NOW(), b.payment_expires) as payment_seconds_remaining,
                e.title as event_title,
                e.venue_id
         FROM bookings b
         JOIN events e ON b.event_id = e.id
         LEFT JOIN seat_reservations sr ON b.id = sr.booking_id
         WHERE b.id = ?
         LIMIT 1`,
        [bookingId]
    );
    return rows[0];
}

// Check if seat reservation is still valid
static async isSeatReservationValid(bookingId) {
    const [rows] = await pool.execute(
        `SELECT COUNT(*) as valid_reservations,
                COUNT(*) as total_reservations
         FROM seat_reservations 
         WHERE booking_id = ? AND expires_at > NOW()`,
        [bookingId]
    );
    
    // Return true only if ALL reservations are still valid
    return rows[0].valid_reservations === rows[0].total_reservations && rows[0].total_reservations > 0;
}

// Get bookings with expired seat reservations
static async getBookingsWithExpiredSeatReservations() {
    const [rows] = await pool.execute(
        `SELECT b.id, b.booking_reference, b.user_id, b.event_id, sr.seat_id
         FROM bookings b
         JOIN seat_reservations sr ON b.id = sr.booking_id
         WHERE sr.expires_at <= NOW() AND b.payment_status = 'pending'`
    );
    return rows;
}

// Release expired seat reservations
static async releaseExpiredSeatReservations() {
    const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const expiredBookings = await this.getBookingsWithExpiredSeatReservations();
            
            for (const booking of expiredBookings) {
                // Set seats back to available
                const [reservedSeats] = await connection.execute(
                    'SELECT seat_id, event_id FROM seat_reservations WHERE booking_id = ?',
                    [booking.id]
                );
                const seatIds = reservedSeats.map(r => r.seat_id);
                const eventId = reservedSeats[0]?.event_id || booking.event_id;
                if (seatIds.length > 0) {
                    await connection.execute(
                        `UPDATE seats SET status = 'available' WHERE id IN (${seatIds.map(() => '?').join(',')})`,
                        seatIds
                    );
                    // Broadcast release in real-time
                    this.broadcastSeatStatus(eventId, seatIds, 'available');
                }

                // Mark booking as cancelled/expired (payment window missed)
                await connection.execute(
                    `UPDATE bookings 
                     SET booking_status = 'cancelled',
                         payment_status = 'cancelled',
                         payment_expires = NULL,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?`,
                    [booking.id]
                );

                await connection.execute(
                    'DELETE FROM seat_reservations WHERE booking_id = ?',
                    [booking.id]
                );
            }

        await connection.commit();

        // Trigger waiting list processing for events that regained availability
        try {
            const Event = require('./Event');
            const eventIds = [...new Set(expiredBookings.map(b => b.event_id))];
            for (const eventId of eventIds) {
                await Event.handleTicketAvailabilityChange(eventId);
            }
        } catch (wlError) {
            console.error('Waiting list processing after reservation expiry failed:', wlError.message);
        }

        return expiredBookings.length;

    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}
// Lock seat reservations permanently once payment is completed
static async finalizeSeatReservations(bookingId) {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();

        const [reservations] = await connection.execute(
            'SELECT seat_id, event_id FROM seat_reservations WHERE booking_id = ?',
            [bookingId]
        );

        if (!reservations.length) {
            await connection.commit();
            return [];
        }

        const seatIds = reservations.map(r => r.seat_id);
        const eventId = reservations[0]?.event_id;
        const placeholders = seatIds.map(() => '?').join(',');

        // Promote reservations to long-lived confirmed holds (per-event)
        await connection.execute(
            `UPDATE seat_reservations 
             SET status = 'confirmed', expires_at = DATE_ADD(NOW(), INTERVAL 10 YEAR) 
             WHERE booking_id = ?`,
            [bookingId]
        );

        await connection.commit();

        // Broadcast booked status
        this.broadcastSeatStatus(eventId, seatIds, 'booked');
        return seatIds;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}
// Broadcast seat status changes to event room
static broadcastSeatStatus(eventId, seatIds, status, extra = {}) {
    const io = global.io;
    if (!io || !eventId || !seatIds || !seatIds.length) return;
    try {
        io.to(`event-${eventId}`).emit('seat-status', {
            eventId: parseInt(eventId),
            seats: seatIds,
            status,
            ...extra,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error('Seat status broadcast failed:', err.message);
    }
}
static async confirmSeatReservations(bookingId) {
    const [result] = await pool.execute(
        `UPDATE seat_reservations 
         SET status = 'confirmed', expires_at = NULL 
         WHERE booking_id = ? AND status = 'reserved'`,
        [bookingId]
    );
    return result.affectedRows;
}
// Check if booking is eligible for refund (within 48 hours)
static async isEligibleForRefund(bookingId) {
    try {
        const [rows] = await pool.execute(
            `SELECT b.*, p.payment_timestamp,
                    TIMESTAMPDIFF(HOUR, p.payment_timestamp, NOW()) as hours_since_payment
             FROM bookings b
             JOIN payments p ON b.id = p.booking_id
             WHERE b.id = ? AND p.status = 'success'`,
            [bookingId]
        );
        
        if (rows.length === 0) return false;
        
        const booking = rows[0];
        const hoursSincePayment = booking.hours_since_payment;
        
        // Eligible if paid and within 48 hours
        return booking.payment_status === 'paid' && hoursSincePayment <= 48;
    } catch (error) {
        console.error('Check refund eligibility error:', error);
        return false;
    }
}

// Request cancellation with refund
static async requestCancellation(bookingId, userId, reason = '') {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();

        // Verify ownership and eligibility
        const booking = await Booking.getById(bookingId);
        if (!booking || booking.user_id !== userId) {
            throw new Error('Booking not found or not authorized');
        }

        const isEligible = await Booking.isEligibleForRefund(bookingId);
        if (!isEligible) {
            throw new Error('Booking is not eligible for refund (48-hour window expired)');
        }

        // Update booking with cancellation request
        const [result] = await connection.execute(
            `UPDATE bookings 
             SET cancellation_requested = TRUE,
                 cancellation_reason = ?,
                 cancellation_requested_at = NOW(),
                 refund_status = 'requested',
                 refund_amount = total_price
             WHERE id = ? AND user_id = ?`,
            [reason, bookingId, userId]
        );

        if (result.affectedRows === 0) {
            throw new Error('Failed to request cancellation');
        }

        await connection.commit();
        return true;

    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

// Process refund (Admin only)
static async processRefund(bookingId, adminId, approve = true, adminNotes = '') {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();

        const booking = await Booking.getById(bookingId);
        if (!booking) {
            throw new Error('Booking not found');
        }

        if (!booking.cancellation_requested) {
            throw new Error('No cancellation requested for this booking');
        }

        let newStatus;

        // Normalize nullable fields to avoid undefined bindings
        let paymentId = booking.payment_id ?? null;
        const refundAmount = booking.refund_amount ?? booking.total_price ?? 0;
        const refundReason = booking.cancellation_reason ?? null;
        const notes = adminNotes ?? null;

        // If paymentId is missing, fetch latest payment for this booking
        if (!paymentId) {
            const [payments] = await connection.execute(
                `SELECT id FROM payments
                 WHERE booking_id = ?
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [bookingId]
            );
            paymentId = payments[0]?.id ?? null;
        }

        if (approve) {
            newStatus = 'processed';
            // Create refund record
            await connection.execute(
                `INSERT INTO refunds (booking_id, payment_id, user_id, amount, refund_reason, status, admin_notes, processed_at)
                 VALUES (?, ?, ?, ?, ?, 'processed', ?, NOW())`,
                [bookingId, paymentId, booking.user_id, refundAmount, refundReason, notes]
            );

            // Update booking status to cancelled (use allowed enum value)
            await connection.execute(
                'UPDATE bookings SET payment_status = "cancelled", booking_status = "cancelled", refund_status = ?, refund_processed_at = NOW(), refund_reason = ? WHERE id = ?',
                [newStatus, refundReason, bookingId]
            );

        } else {
            newStatus = 'rejected';
            await connection.execute(
                'UPDATE bookings SET refund_status = ?, refund_reason = ? WHERE id = ?',
                [newStatus, refundReason, bookingId]
            );
        }

        await connection.commit();
        return true;

    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

// Get user's cancellable bookings
static async getCancellableBookings(userId) {
    const [rows] = await pool.execute(
        `SELECT b.*, 
                TIMESTAMPDIFF(HOUR, p.payment_timestamp, NOW()) as hours_since_payment,
                (TIMESTAMPDIFF(HOUR, p.payment_timestamp, NOW()) <= 48) as is_refund_eligible
         FROM bookings b
         JOIN payments p ON b.id = p.booking_id
         WHERE b.user_id = ? 
         AND b.payment_status = 'paid'
         AND b.cancellation_requested = FALSE
         ORDER BY p.payment_timestamp DESC`,
        [userId]
    );
    return rows;
}
// Check cancellation status
static async getCancellationStatus(bookingId, userId) {
    try {
        const [rows] = await pool.execute(
            `SELECT cancellation_requested, cancellation_reason, cancellation_requested_at,
                    refund_status, refund_amount, refund_processed_at
             FROM bookings 
             WHERE id = ? AND user_id = ?`,
            [bookingId, userId]
        );
        
        if (rows.length === 0) {
            throw new Error('Booking not found');
        }
        
        return rows[0];
    } catch (error) {
        console.error('Get cancellation status error:', error);
        throw error;
    }
}
static async createFromWaitingList(waitingListId, userId) {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();

        // Verify waiting list entry is valid for conversion
        const [waitingEntries] = await connection.execute(
            `SELECT wl.*, e.price, e.id as event_id
             FROM waiting_list wl
             JOIN events e ON wl.event_id = e.id
             WHERE wl.id = ? AND wl.user_id = ? AND wl.status = 'notified' AND wl.notification_expires_at > NOW()`,
            [waitingListId, userId]
        );

        if (waitingEntries.length === 0) {
            throw new Error('Waiting list entry not found, expired, or already processed');
        }

        const waitingEntry = waitingEntries[0];
        
        // Check if tickets are still available
        const availableTickets = await this.getAvailableTickets(waitingEntry.event_id);
        if (availableTickets < waitingEntry.quantity) {
            throw new Error('Not enough tickets available anymore');
        }

        // Create booking using existing create method
        const bookingData = {
            user_id: waitingEntry.user_id,
            event_id: waitingEntry.event_id,
            quantity: waitingEntry.quantity
        };

        const bookingResult = await this.create(bookingData);

        // Update waiting list status to converted
        await connection.execute(
            'UPDATE waiting_list SET status = "converted", converted_at = NOW(), booking_id = ? WHERE id = ?',
            [bookingResult.bookingId, waitingListId]
        );

        await connection.commit();
        return {
            ...bookingResult,
            waitingListEntry: waitingEntry
        };

    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}
    static async getRealTimeAvailability(eventId) {
        // Prefer seat-based availability when seating exists
        const seatAvailability = await this.getSeatAvailability(eventId);
        if (seatAvailability) {
            const [eventRows] = await pool.execute(
                'SELECT title, venue, price, event_date, capacity FROM events WHERE id = ?',
                [eventId]
            );
            const eventMeta = eventRows[0] || {};
            const { totalSeats, availableSeats, bookedSeats, reservedSeats } = seatAvailability;
            const seatTotal = Number(totalSeats) || 0;
            const eventCapacity = Number(eventMeta.capacity);
            const capacity = Number.isFinite(eventCapacity) && eventCapacity > 0
                ? Math.min(eventCapacity, seatTotal || eventCapacity)
                : seatTotal;
            const confirmed = Number(seatAvailability.paidSeats) || 0; // paid only
            const booked = Number(bookedSeats) || 0; // pending + paid
            const pending = Math.max(0, booked - confirmed);
            const bookedTickets = Math.min(capacity || 0, booked + Number(reservedSeats) || 0);
            const maxAvailable = Math.max(0, (capacity || 0) - bookedTickets);
            const rawAvailable = Number(availableSeats) || 0;
            const availableTickets = Math.max(0, Math.min(rawAvailable, capacity || 0, maxAvailable));

            return {
                eventId: parseInt(eventId),
                eventTitle: eventMeta.title || null,
                capacity,
                bookedTickets,
                availableTickets,
                pendingBookings: pending,
                confirmedBookings: confirmed,
                price: eventMeta.price || null,
                eventDate: eventMeta.event_date || null,
                venue: eventMeta.venue || null,
                lastUpdated: new Date().toISOString(),
                status: availableTickets <= 0 ? 'sold_out' : 
                        availableTickets < 5 ? 'very_limited' :
                        availableTickets < 10 ? 'limited' : 'available',
                percentageSold: capacity ? Math.min(100, Math.round((bookedTickets / capacity) * 100)) : 0
            };
        }

        // Fallback: booking-based availability
        const [rows] = await pool.execute(
            `SELECT 
                e.id as event_id,
                e.title as event_title,
                e.capacity,
                e.price,
                e.event_date,
                e.venue,
                COALESCE(SUM(CASE WHEN b.payment_status IN ('pending', 'paid') THEN b.quantity ELSE 0 END), 0) as booked_tickets,
                COALESCE(SUM(CASE WHEN b.payment_status = 'paid' THEN b.quantity ELSE 0 END), 0) as paid_tickets,
                (e.capacity - COALESCE(SUM(CASE WHEN b.payment_status IN ('pending', 'paid') THEN b.quantity ELSE 0 END), 0)) as available_tickets,
                COUNT(CASE WHEN b.payment_status = 'pending' THEN 1 END) as pending_bookings,
                COUNT(CASE WHEN b.payment_status = 'paid' THEN 1 END) as confirmed_bookings
             FROM events e
             LEFT JOIN bookings b ON e.id = b.event_id
             WHERE e.id = ? AND e.is_active = TRUE
             GROUP BY e.id`,
            [eventId]
        );
        
        if (rows.length === 0) {
            return null;
        }

        const data = rows[0];
        const availableTickets = Math.max(0, parseInt(data.available_tickets));
        const paidTickets = Math.max(0, parseInt(data.paid_tickets));
        
        return {
            eventId: parseInt(eventId),
            eventTitle: data.event_title,
            capacity: data.capacity,
            bookedTickets: parseInt(data.booked_tickets),
            availableTickets: availableTickets,
            pendingBookings: parseInt(data.pending_bookings),
            confirmedBookings: paidTickets,
            price: parseFloat(data.price),
            eventDate: data.event_date,
            venue: data.venue,
            lastUpdated: new Date().toISOString(),
            status: availableTickets <= 0 ? 'sold_out' : 
                    availableTickets < 5 ? 'very_limited' :
                    availableTickets < 10 ? 'limited' : 'available',
            percentageSold: Math.min(100, Math.round((paidTickets / data.capacity) * 100))
        };
    }

// Get multiple events availability (for event listing)
    static async getBatchAvailability(eventIds) {
        if (!eventIds.length) return [];

        const results = [];
        for (const eventId of eventIds) {
            const seatAvailability = await this.getSeatAvailability(eventId);
            if (seatAvailability) {
                const [eventRows] = await pool.execute(
                    'SELECT title, venue, price, event_date, capacity FROM events WHERE id = ?',
                    [eventId]
                );
                const eventMeta = eventRows[0] || {};
                const { totalSeats, availableSeats, bookedSeats, reservedSeats } = seatAvailability;
                const seatTotal = Number(totalSeats) || 0;
                const eventCapacity = Number(eventMeta.capacity);
                const capacity = Number.isFinite(eventCapacity) && eventCapacity > 0
                    ? Math.min(eventCapacity, seatTotal || eventCapacity)
                    : seatTotal;
                const confirmed = Number(seatAvailability.paidSeats) || 0; // paid only
                const booked = Number(bookedSeats) || 0; // pending + paid
                const pending = Math.max(0, booked - confirmed);
                const bookedTickets = Math.min(capacity || 0, booked + Number(reservedSeats) || 0);
                const maxAvailable = Math.max(0, (capacity || 0) - bookedTickets);
                const rawAvailable = Number(availableSeats) || 0;
                const availableTickets = Math.max(0, Math.min(rawAvailable, capacity || 0, maxAvailable));

                results.push({
                    eventId,
                    eventTitle: eventMeta.title || null,
                    capacity,
                    bookedTickets,
                    availableTickets,
                    price: eventMeta.price || null,
                    eventDate: eventMeta.event_date || null,
                    venue: eventMeta.venue || null,
                    status: availableTickets <= 0 ? 'sold_out' : 
                            availableTickets < 5 ? 'very_limited' :
                            availableTickets < 10 ? 'limited' : 'available',
                    percentageSold: capacity ? Math.min(100, Math.round((bookedTickets / capacity) * 100)) : 0
                });
                continue;
            }
        }

        // If some events weren't covered by seating data, fall back to booking-based query
        const missingIds = eventIds.filter(id => !results.find(r => r.eventId === id));
        if (missingIds.length) {
            const placeholders = missingIds.map(() => '?').join(',');
            
            const [rows] = await pool.execute(
                `SELECT 
                    e.id as event_id,
                    e.title,
                    e.capacity,
                    e.price,
                    e.event_date,
                    e.venue,
                    COALESCE(SUM(CASE WHEN b.payment_status IN ('pending', 'paid') THEN b.quantity ELSE 0 END), 0) as booked_tickets,
                    (e.capacity - COALESCE(SUM(CASE WHEN b.payment_status IN ('pending', 'paid') THEN b.quantity ELSE 0 END), 0)) as available_tickets
                 FROM events e
                 LEFT JOIN bookings b ON e.id = b.event_id
                 WHERE e.id IN (${placeholders}) AND e.is_active = TRUE
                 GROUP BY e.id`,
                missingIds
            );
            
            rows.forEach(row => {
                const availableTickets = Math.max(0, parseInt(row.available_tickets));
                results.push({
                    eventId: row.event_id,
                    eventTitle: row.title,
                    capacity: row.capacity,
                    bookedTickets: parseInt(row.booked_tickets),
                    availableTickets: availableTickets,
                    price: parseFloat(row.price),
                    eventDate: row.event_date,
                    venue: row.venue,
                    status: availableTickets <= 0 ? 'sold_out' : 
                            availableTickets < 5 ? 'very_limited' :
                            availableTickets < 10 ? 'limited' : 'available',
                    percentageSold: Math.min(100, Math.round((parseInt(row.booked_tickets) / row.capacity) * 100))
                });
            });
        }

        return results;
    }

    // Seat-based availability helper (returns null if no seating found for this event)
    static async getSeatAvailability(eventId) {
        // Total seats for the venue used by this event
        const [[totalRow]] = await pool.execute(
            `SELECT COUNT(s.id) as total_seats
             FROM seats s
             JOIN seating_sections ss ON s.section_id = ss.id
             JOIN events e ON ss.venue_id = e.venue_id
             WHERE e.id = ?`,
            [eventId]
        );

        const totalSeats = parseInt(totalRow?.total_seats || 0);
        if (!totalSeats) return null;

        // Seats currently reserved for this event (not yet expired)
        const [[reservedRow]] = await pool.execute(
            `SELECT COUNT(DISTINCT seat_id) as reserved_seats
             FROM seat_reservations
             WHERE event_id = ? AND expires_at > NOW()`,
            [eventId]
        );

        // Seats booked for this event (pending + paid)
        const [[bookedRow]] = await pool.execute(
            `SELECT COUNT(DISTINCT it.seat_id) as booked_seats
             FROM individual_tickets it
             JOIN bookings b ON it.booking_id = b.id
             WHERE b.event_id = ? AND b.payment_status IN ('pending', 'paid')`,
            [eventId]
        );

        // Seats with paid bookings only (confirmed sales)
        const [[paidRow]] = await pool.execute(
            `SELECT COUNT(DISTINCT it.seat_id) as paid_seats
             FROM individual_tickets it
             JOIN bookings b ON it.booking_id = b.id
             WHERE b.event_id = ? AND b.payment_status = 'paid'`,
            [eventId]
        );

        const reservedSeats = parseInt(reservedRow?.reserved_seats || 0);
        const bookedSeats = parseInt(bookedRow?.booked_seats || 0);
        const paidSeats = parseInt(paidRow?.paid_seats || 0);
        const availableSeats = Math.max(0, totalSeats - bookedSeats - reservedSeats);

        return {
            totalSeats,
            availableSeats,
            bookedSeats,
            reservedSeats,
            paidSeats
        };
    }

// Check for low availability and trigger notifications
static async checkLowAvailability(eventId) {
    const availability = await this.getRealTimeAvailability(eventId);
    
    if (!availability) return null;

    // If tickets are available again, process waiting list immediately
    if (availability.availableTickets > 0) {
        try {
            const Event = require('./Event');
            await Event.handleTicketAvailabilityChange(eventId);
        } catch (err) {
            console.error('Waiting list processing after availability increase failed:', err.message);
        }
    }
    
    // Emit low availability warnings
    if (availability.availableTickets < 10 && availability.availableTickets > 0) {
        try {
            const io = global.io;
            
            if (io) {
                io.to(`event-${eventId}`).emit('low-availability', {
                    eventId,
                    availableTickets: availability.availableTickets,
                    message: `Only ${availability.availableTickets} tickets left for ${availability.eventTitle}!`,
                    urgency: availability.availableTickets < 3 ? 'high' : 
                             availability.availableTickets < 5 ? 'medium' : 'low',
                    timestamp: new Date().toISOString()
                });
            }
            
            console.log(`🚨 Low availability alert for event ${eventId}: ${availability.availableTickets} tickets left`);
        } catch (error) {
            console.error('Error emitting low availability warning:', error);
        }
    }
    
    return availability;
}

// Get trending events (most booked recently)
static async getTrendingEvents(limit = 10, days = 7) {
    const [rows] = await pool.execute(
        `SELECT 
            e.id,
            e.title,
            e.description,
            e.venue,
            e.event_date,
            e.price,
            e.image_url,
            e.capacity,
            u.name as organizer_name,
            COUNT(b.id) as recent_bookings,
            (e.capacity - COALESCE(SUM(CASE WHEN b2.payment_status IN ('pending', 'paid') THEN b2.quantity ELSE 0 END), 0)) as available_tickets
         FROM events e
         JOIN users u ON e.organizer_id = u.id
         LEFT JOIN bookings b ON e.id = b.event_id AND b.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         LEFT JOIN bookings b2 ON e.id = b2.event_id AND b2.payment_status IN ('pending', 'paid')
         WHERE e.is_active = TRUE AND e.event_date > NOW()
         GROUP BY e.id
         ORDER BY recent_bookings DESC, available_tickets ASC
         LIMIT ?`,
        [days, limit]
    );
    
    return rows.map(event => {
        const availableTickets = parseInt(event.available_tickets);
        return {
            ...event,
            image_url: event.image_url ? `/uploads/events/${event.image_url}` : null,
            available_tickets: availableTickets,
            status: availableTickets <= 0 ? 'sold_out' : 
                    availableTickets < 5 ? 'very_limited' :
                    availableTickets < 10 ? 'limited' : 'available',
            popularity: event.recent_bookings > 20 ? 'high' : 
                       event.recent_bookings > 10 ? 'medium' : 'low'
        };
    });
}

// Get availability history for analytics (last 30 days)
static async getAvailabilityHistory(eventId, days = 30) {
    const [rows] = await pool.execute(
        `SELECT 
            DATE(b.created_at) as date,
            COUNT(b.id) as daily_bookings,
            SUM(b.quantity) as daily_tickets_sold
         FROM bookings b
         WHERE b.event_id = ? AND b.payment_status = 'paid' 
               AND b.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         GROUP BY DATE(b.created_at)
         ORDER BY date ASC`,
        [eventId, days]
    );
    
    return rows;
}
 // In Booking.js - Update createIndividualTickets method
static async createIndividualTickets(bookingId, quantity, seatIds = []) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        console.log(`🔍 [Booking] Creating ${quantity} individual tickets for booking ${bookingId}`);
        console.log(`🔍 [Booking] Seat IDs provided:`, seatIds);

        // Get seat details if seatIds are provided
        let seatDetails = [];
        if (seatIds && seatIds.length > 0) {
            const placeholders = seatIds.map(() => '?').join(',');
            const [seats] = await connection.execute(
                `SELECT s.id, s.row_label, s.seat_number, ss.name as section_name, ss.id as section_id
                 FROM seats s
                 JOIN seating_sections ss ON s.section_id = ss.id
                 WHERE s.id IN (${placeholders})`,
                seatIds
            );
            seatDetails = seats;
            console.log(`🔍 [Booking] Found ${seatDetails.length} seat details`);
        }

        // Create individual ticket records
        for (let i = 0; i < quantity; i++) {
            const ticketId = `${bookingId}-${i + 1}`;
            const seatId = seatIds[i] || null;
            
            // Get seat details for this specific ticket
            const seatDetail = seatDetails.find(s => s.id === seatId) || null;
            
            await connection.execute(
                `INSERT INTO individual_tickets 
                 (booking_id, ticket_index, ticket_id, seat_id, status, created_at) 
                 VALUES (?, ?, ?, ?, 'active', NOW())`,
                [bookingId, i, ticketId, seatId]
            );

            console.log(`✅ Created ticket ${ticketId} with seat ID: ${seatId}`);
            if (seatDetail) {
                console.log(`   Seat details: ${seatDetail.section_name} - Row ${seatDetail.row_label}, Seat ${seatDetail.seat_number}`);
            }
        }

        await connection.commit();
        console.log(`✅ Successfully created ${quantity} individual tickets for booking ${bookingId}`);
        
        // Verify the tickets were created
        const verifyTickets = await connection.execute(
            'SELECT COUNT(*) as count FROM individual_tickets WHERE booking_id = ?',
            [bookingId]
        );
        console.log(`🔍 Verification: ${verifyTickets[0][0].count} tickets in database`);

    } catch (error) {
        await connection.rollback();
        console.error('❌ Failed to create individual tickets:', error);
        throw error;
    } finally {
        connection.release();
    }
}

    // Check if individual ticket is used
    static async isIndividualTicketUsed(bookingId, ticketIndex) {
        const [rows] = await pool.execute(
            `SELECT status FROM individual_tickets 
             WHERE booking_id = ? AND ticket_index = ?`,
            [bookingId, ticketIndex]
        );
        return rows[0]?.status === 'used' || false;
    }

    // Mark individual ticket as used
    static async markIndividualTicketAsUsed(bookingId, ticketIndex) {
        const [result] = await pool.execute(
            `UPDATE individual_tickets 
             SET status = 'used', used_at = NOW() 
             WHERE booking_id = ? AND ticket_index = ? AND status = 'active'`,
            [bookingId, ticketIndex]
        );
        return result.affectedRows > 0;
    }

    static async getIndividualTickets(bookingId) {
    console.log(`🔍 [Booking] Getting individual tickets for booking ${bookingId}`);
    
    try {
        const [rows] = await pool.execute(
            `SELECT it.*, 
                    s.id as seat_id,
                    s.row_label,
                    s.seat_number,
                    ss.name as section_name,
                    ss.id as section_id
             FROM individual_tickets it
             LEFT JOIN seats s ON it.seat_id = s.id
             LEFT JOIN seating_sections ss ON s.section_id = ss.id
             WHERE it.booking_id = ?
             ORDER BY it.ticket_index ASC`,
            [bookingId]
        );
        
        console.log(`🔍 [Booking] Found ${rows.length} individual tickets in database`);
        
        // Log each ticket for debugging
        rows.forEach((ticket, index) => {
            console.log(`🎫 Ticket ${index + 1}:`, {
                ticket_id: ticket.ticket_id,
                ticket_index: ticket.ticket_index,
                seat_id: ticket.seat_id,
                section_name: ticket.section_name,
                row_label: ticket.row_label,
                seat_number: ticket.seat_number
            });
        });
        
        return rows;
    } catch (error) {
        console.error('❌ [Booking] Error getting individual tickets:', error);
        return [];
    }
}
    static async getIndividualTicket(bookingId, ticketIndex) {
    const [rows] = await pool.execute(
        `SELECT it.*, 
                s.id as seat_id,
                s.row_label,
                s.seat_number,
                ss.name as section_name,
                ss.id as section_id
         FROM individual_tickets it
         LEFT JOIN seats s ON it.seat_id = s.id
         LEFT JOIN seating_sections ss ON s.section_id = ss.id
         WHERE it.booking_id = ? AND it.ticket_index = ?`,
        [bookingId, ticketIndex]
    );
    return rows[0];
}
}

module.exports = Booking;
