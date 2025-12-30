const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Event = require('../models/Event');

// Get real-time availability for an event
router.get('/events/:eventId/availability', async (req, res) => {
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
});

// Get availability for multiple events
router.post('/events/availability/batch', async (req, res) => {
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
});

// Get trending events
router.get('/events/trending', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const days = parseInt(req.query.days) || 7;
    
    const trendingEvents = await Booking.getTrendingEvents(limit, days);
    
    res.json({
      success: true,
      data: trendingEvents
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Subscribe to event updates
router.post('/events/:eventId/subscribe', async (req, res) => {
  try {
    const { eventId } = req.params;
    
    // Verify event exists
    const event = await Event.getById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }
    
    const availability = await Booking.getRealTimeAvailability(parseInt(eventId));
    
    res.json({
      success: true,
      data: {
        eventId: parseInt(eventId),
        currentAvailability: availability,
        subscribed: true,
        websocketEvent: `event-${eventId}`
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;