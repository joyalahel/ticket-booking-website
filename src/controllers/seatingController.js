const Seating = require('../models/Seating');
const Venue = require('../models/Venue');
const Event = require('../models/Event');

class SeatingController {
    // Get available seats for an event
    static async getEventSeating(req, res) {
        try {
            const { eventId } = req.params;

            const seatingData = await Seating.getAvailableSeats(eventId);
            
            res.json({
                success: true,
                seating: seatingData
            });

        } catch (error) {
            console.error('Get event seating error:', error);
            res.status(500).json({ 
                success: false,
                error: 'Failed to get seating data' 
            });
        }
    }

    // Reserve seats temporarily
    static async reserveSeats(req, res) {
        try {
            const { eventId } = req.params;
            const { seatIds } = req.body;
            const userId = req.user.id;

            if (!seatIds || !Array.isArray(seatIds) || seatIds.length === 0) {
                return res.status(400).json({ 
                    success: false,
                    error: 'Please select at least one seat' 
                });
            }

            const reservation = await Seating.reserveSeats(seatIds, eventId, userId);

            res.json({
                success: true,
                reservation: {
                    token: reservation.reservationToken,
                    expires_at: reservation.expiresAt,
                    seat_count: seatIds.length
                },
                message: `Seats reserved for 10 minutes. Complete your booking before ${new Date(reservation.expiresAt).toLocaleTimeString()}`
            });

        } catch (error) {
            console.error('Reserve seats error:', error);
            res.status(400).json({ 
                success: false,
                error: error.message 
            });
        }
    }

    // Confirm seat booking (called after payment success)
    static async confirmSeatBooking(req, res) {
        try {
            const { bookingId } = req.params;
            const { seatIds, reservationToken } = req.body;

            await Seating.confirmSeatBooking(bookingId, seatIds, reservationToken);

            res.json({
                success: true,
                message: 'Seat booking confirmed successfully'
            });

        } catch (error) {
            console.error('Confirm seat booking error:', error);
            res.status(400).json({ 
                success: false,
                error: error.message 
            });
        }
    }

    // Get venue seating layout
    static async getVenueSeating(req, res) {
        try {
            const { venueId } = req.params;

            const venue = await Venue.getVenueWithSeating(venueId);

            res.json({
                success: true,
                venue: venue
            });

        } catch (error) {
            console.error('Get venue seating error:', error);
            res.status(500).json({ 
                success: false,
                error: 'Failed to get venue seating' 
            });
        }
    }

    // Create or update venue seating layout
    static async updateVenueSeating(req, res) {
        try {
            const { venueId } = req.params;
            const { sections } = req.body;
            const userId = req.user.id;

            // Verify user has permission (organizer/admin)
            // Add your authorization logic here

            await Venue.updateSeatingLayout(venueId, sections);

            res.json({
                success: true,
                message: 'Venue seating layout updated successfully'
            });

        } catch (error) {
            console.error('Update venue seating error:', error);
            const status = error.message?.toLowerCase().includes('capacity') ? 400 : 500;
            res.status(status).json({ 
                success: false,
                error: error.message || 'Failed to update venue seating' 
            });
        }
    }
}

module.exports = SeatingController;
