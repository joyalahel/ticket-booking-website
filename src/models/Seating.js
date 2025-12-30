const pool = require('../config/database');
const Venue = require('./Venue');

class Seating {
    // Reserve seats for a limited time
    static async reserveSeats(seatIds, eventId, userId, durationMinutes = 10) {
        const connection = await pool.getConnection();
        
        try {
            await connection.beginTransaction();

            const reservationToken = `res_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const expiresAt = new Date(Date.now() + durationMinutes * 60000);

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
                [...seatIds, eventId]
            );

            if (availableSeats.length !== seatIds.length) {
                throw new Error('Some seats are no longer available');
            }

            // Create reservations
            for (const seatId of seatIds) {
                await connection.execute(
                    `INSERT INTO seat_reservations (seat_id, event_id, user_id, reservation_token, expires_at)
                     VALUES (?, ?, ?, ?, ?)`,
                    [seatId, eventId, userId, reservationToken, expiresAt]
                );
            }

            await connection.commit();
            return { reservationToken, expiresAt };

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // Confirm seat booking (persist seats to booking; reservations are removed)
    static async confirmSeatBooking(bookingId, seatIds, reservationToken) {
        const connection = await pool.getConnection();
        
        try {
            await connection.beginTransaction();

            // Verify reservation is still valid
            const [validReservations] = await connection.execute(
                `SELECT seat_id FROM seat_reservations 
                 WHERE reservation_token = ? AND expires_at > NOW()`,
                [reservationToken]
            );

            if (validReservations.length !== seatIds.length) {
                throw new Error('Seat reservation expired or invalid');
            }

            // Store seat data in booking
            const seatData = await this.getSeatDetails(seatIds);
            await connection.execute(
                'UPDATE bookings SET seat_data = ? WHERE id = ?',
                [JSON.stringify(seatData), bookingId]
            );

            // Remove reservations
            await connection.execute(
                'DELETE FROM seat_reservations WHERE reservation_token = ?',
                [reservationToken]
            );

            await connection.commit();
            return true;

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // Get seat details
    static async getSeatDetails(seatIds) {
        const placeholders = seatIds.map(() => '?').join(',');
        const [seats] = await pool.execute(
            `SELECT s.*, ss.name as section_name, ss.price_multiplier
             FROM seats s
             JOIN seating_sections ss ON s.section_id = ss.id
             WHERE s.id IN (${placeholders})`,
            seatIds
        );
        return seats;
    }

    static async getBookedSeatIds(eventId) {
        const [rows] = await pool.execute(
            `SELECT seat_data FROM bookings 
             WHERE event_id = ? AND payment_status = 'paid'`,
            [eventId]
        );
        const ids = new Set();
        for (const row of rows) {
            if (!row.seat_data) continue;
            try {
                const parsed = JSON.parse(row.seat_data);
                parsed.forEach(seat => {
                    if (seat.id) ids.add(Number(seat.id));
                });
            } catch (err) {
                // ignore malformed seat_data
            }
        }
        return ids;
    }

    // Get available seats for an event
    static async getAvailableSeats(eventId) {
        const [event] = await pool.execute(
            'SELECT venue_id, base_price, section_pricing FROM events WHERE id = ?',
            [eventId]
        );

        if (!event[0]) throw new Error('Event not found');

        const venueId = event[0].venue_id;
        const basePrice = event[0].base_price;
        const [[venueRow]] = await pool.execute(
            'SELECT capacity FROM venues WHERE id = ?',
            [venueId]
        );
        const venueCapacity = Number(venueRow?.capacity) || 0;

        let sectionOverrides = null;
        if (event[0].section_pricing) {
            try {
                const raw = Buffer.isBuffer(event[0].section_pricing)
                    ? event[0].section_pricing.toString()
                    : event[0].section_pricing;
                sectionOverrides = typeof raw === 'string' ? JSON.parse(raw) : raw;
            } catch (err) {
                sectionOverrides = null;
            }
        }
        const overrideSections = Array.isArray(sectionOverrides)
            ? sectionOverrides
            : sectionOverrides?.sections || [];

        let [sections] = await pool.execute(
            `SELECT ss.*, 
                    COUNT(s.id) as total_seats,
                    SUM(CASE WHEN s.status = 'available' THEN 1 ELSE 0 END) as available_seats
             FROM seating_sections ss
             LEFT JOIN seats s ON ss.id = s.section_id
             WHERE ss.venue_id = ?
             GROUP BY ss.id
             ORDER BY ss.order, ss.name`,
            [venueId]
        );

        // If no sections/seats exist yet, auto-create a default layout so seating works
        if (!sections.length && venueCapacity > 0) {
            await Venue.ensureDefaultSeating(venueId, venueCapacity);
            [sections] = await pool.execute(
                `SELECT ss.*, 
                        COUNT(s.id) as total_seats,
                        SUM(CASE WHEN s.status = 'available' THEN 1 ELSE 0 END) as available_seats
                 FROM seating_sections ss
                 LEFT JOIN seats s ON ss.id = s.section_id
                 WHERE ss.venue_id = ?
                 GROUP BY ss.id
                 ORDER BY ss.order, ss.name`,
                [venueId]
            );
        }

        const bookedSeatIds = await this.getBookedSeatIds(eventId);

        // Get available seats for each section
        for (let section of sections) {
            const [seats] = await pool.execute(
                `SELECT s.*, sr.expires_at as reservation_expires_at
                 FROM seats s
                 LEFT JOIN (
                     SELECT seat_id, MAX(expires_at) as expires_at
                     FROM seat_reservations
                     WHERE event_id = ?
                     GROUP BY seat_id
                 ) sr ON s.id = sr.seat_id
                 WHERE s.section_id = ?
                 ORDER BY s.row_label, s.seat_number`,
                [eventId, section.id]
            );

            // Apply per-section overrides from event.section_pricing (name-based, fallback by order)
            const norm = (v) => (v || '').toString().trim().toLowerCase();
            const matchOverride =
                overrideSections.find((o) => norm(o.name || o.section) === norm(section.name)) ||
                overrideSections[sections.indexOf(section)];
            const allowedSeats = matchOverride?.seats !== undefined
                ? Number(matchOverride.seats) || 0
                : seats.length;
            const trimmedSeats = seats.slice(0, Math.max(0, allowedSeats)).map(seat => {
                const isReserved = seat.reservation_expires_at && new Date(seat.reservation_expires_at) > new Date();
                const isBooked = bookedSeatIds.has(Number(seat.id));
                const isDisabled = seat.status === 'disabled';
                const current_status = isDisabled
                    ? 'disabled'
                    : isBooked
                        ? 'booked'
                        : isReserved
                            ? 'reserved'
                            : 'available';
                return { ...seat, current_status };
            });

            section.seats = trimmedSeats;
            section.available_seats = trimmedSeats.filter(seat => seat.current_status === 'available').length;
            section.reserved_seats = trimmedSeats.filter(seat => seat.current_status === 'reserved').length;

            const priceOverride = matchOverride?.price;
            const calculated = priceOverride !== undefined && priceOverride !== null
                ? Number(priceOverride)
                : basePrice * section.price_multiplier;
            section.calculated_price = Number(calculated || 0).toFixed(2);
            section.override_seats = allowedSeats;
        }

        return {
            venue_id: venueId,
            base_price: basePrice,
            sections: sections
        };
    }

    // Release expired reservations
    static async cleanupExpiredReservations() {
        const [result] = await pool.execute(
            'DELETE FROM seat_reservations WHERE expires_at <= NOW()'
        );
        return result.affectedRows;
    }

    // Get user's booked seats for an event
    static async getUserBookedSeats(userId, eventId) {
        const [bookings] = await pool.execute(
            `SELECT seat_data FROM bookings 
             WHERE user_id = ? AND event_id = ? AND payment_status = 'paid'`,
            [userId, eventId]
        );

        const seats = [];
        for (const booking of bookings) {
            if (booking.seat_data) {
                seats.push(...JSON.parse(booking.seat_data));
            }
        }

        return seats;
    }
    // Cleanup reservation by token
static async cleanupReservation(reservationToken) {
    const [result] = await pool.execute(
        'DELETE FROM seat_reservations WHERE reservation_token = ?',
        [reservationToken]
    );
    return result.affectedRows;
}
}

module.exports = Seating;
