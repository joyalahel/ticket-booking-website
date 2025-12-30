const Booking = require('../models/Booking');
const Event = require('../models/Event');

class RealtimeController {
  // Get real-time availability for an event
  static async getEventAvailability(req, res) {
    try {
      const { eventId } = req.params;
      
      const availability = await Booking.getRealTimeAvailability(parseInt(eventId));
      
      if (!availability) {
        return res.status(404).json({
          success: false,
          message: 'Event not found'
        });
      }
      
      res.json({
        success: true,
        data: availability
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
  
  // Get availability for multiple events
  static async getBatchAvailability(req, res) {
    try {
      const { eventIds } = req.body;
      
      if (!eventIds || !Array.isArray(eventIds)) {
        return res.status(400).json({
          success: false,
          message: 'Event IDs array is required'
        });
      }
      
      const availability = await Booking.getBatchAvailability(eventIds);
      
      res.json({
        success: true,
        data: availability
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
  
  // Subscribe to event updates (WebSocket endpoint)
  static async subscribeToEvent(req, res) {
    try {
      const { eventId } = req.params;
      const io = req.app.get('io');
      
      // Verify event exists
      const event = await Event.getById(eventId);
      if (!event) {
        return res.status(404).json({
          success: false,
          message: 'Event not found'
        });
      }
      
      // Get current availability
      const availability = await Booking.getRealTimeAvailability(parseInt(eventId));
      
      res.json({
        success: true,
        data: {
          eventId: parseInt(eventId),
          currentAvailability: availability,
          subscribed: true
        }
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
  
  // Get popular events with real-time availability
  static async getPopularEventsWithAvailability(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 10;
      
      // Get popular events (you can modify this query based on your criteria)
      const [events] = await pool.execute(
        `SELECT e.*, u.name as organizer_name,
                COUNT(b.id) as booking_count
         FROM events e
         JOIN users u ON e.organizer_id = u.id
         LEFT JOIN bookings b ON e.id = b.event_id AND b.payment_status = 'paid'
         WHERE e.is_active = TRUE AND e.event_date > NOW()
         GROUP BY e.id
         ORDER BY booking_count DESC, e.created_at DESC
         LIMIT ?`,
        [limit]
      );
      
      // Get availability for each event
      const eventIds = events.map(event => event.id);
      const availability = await Booking.getBatchAvailability(eventIds);
      
      // Combine event data with availability
      const eventsWithAvailability = events.map(event => {
        const eventAvailability = availability.find(avail => avail.eventId === event.id);
        return {
          ...event,
          image_url: event.image_url ? `/uploads/events/${event.image_url}` : null,
          available_tickets: eventAvailability ? eventAvailability.availableTickets : event.capacity,
          availability_status: eventAvailability ? eventAvailability.status : 'available'
        };
      });
      
      res.json({
        success: true,
        data: eventsWithAvailability
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = RealtimeController;