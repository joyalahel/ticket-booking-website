const Event = require('../models/Event');
const Venue = require('../models/Venue');
const { upload, handleUploadErrors } = require('../middleware/uploadMiddleware');

class EventController {
    // Create new event with image upload
    static async createEvent(req, res) {
        try {
            const { title, description, venue, event_date, price, capacity, category, venue_id, base_price, section_pricing, status } = req.body;
            console.log('[EventController.createEvent] section_pricing raw:', section_pricing);
            const organizer_id = req.user.id;

            // Validation
            if (!title || !venue || !event_date || capacity === undefined || !venue_id) {
                return res.status(400).json({ error: 'Title, venue, date, capacity, and venue_id are required' });
            }

                  // ✅ FIX: Clean the date string (remove extra quotes and spaces)
            let cleanEventDate = event_date;
            if (typeof event_date === 'string') {
                // Remove extra quotes and trim whitespace
                cleanEventDate = event_date.replace(/['"]/g, '').trim();
            }

            // Validate date is in future
            const eventDate = new Date(cleanEventDate);
            if (eventDate <= new Date()) {
                return res.status(400).json({ error: 'Event date must be in the future' });
            }

            const numericCapacity = Number(capacity);
            if (Number.isNaN(numericCapacity) || numericCapacity < 1) {
                return res.status(400).json({ error: 'Capacity must be at least 1' });
            }

            // Require image upload
            if (!req.file) {
                return res.status(400).json({ error: 'Event image is required' });
            }

            // Make sure venue exists
            const venueExists = await Venue.getById(venue_id);
            if (!venueExists) {
                return res.status(400).json({ error: 'Venue not found' });
            }

            // Lock capacity to venue capacity (allow only reductions, not increases)
            const venueCapacity = Number(venueExists.capacity) || 0;
            if (!venueCapacity) {
                return res.status(400).json({ error: 'Venue has no capacity set' });
            }
            let effectiveCapacity = venueCapacity;
            if (!Number.isNaN(numericCapacity) && numericCapacity > 0) {
                if (numericCapacity > venueCapacity) {
                    return res.status(400).json({ error: `Capacity cannot exceed venue capacity (${venueCapacity})` });
                }
                effectiveCapacity = numericCapacity;
            }

            const image_url = req.file.filename; // Store just the filename

        // Parse section pricing JSON if present
        let parsedSectionPricing = null;
        if (section_pricing) {
            try {
                parsedSectionPricing = typeof section_pricing === 'string'
                    ? JSON.parse(section_pricing)
                    : section_pricing;
            } catch (err) {
                return res.status(400).json({ error: 'section_pricing must be valid JSON' });
            }
        }

        // Determine headline/base price from section prices (fallback to provided price/base_price)
        let numericPrice = Number(price);
        let numericBasePrice = Number(base_price);
        if (parsedSectionPricing && Array.isArray(parsedSectionPricing.sections)) {
            const prices = parsedSectionPricing.sections
                .map(s => Number(s.price || 0))
                .filter(v => !Number.isNaN(v) && v >= 0);
            const minPrice = prices.length ? Math.min(...prices) : 0;
            numericPrice = minPrice;
            numericBasePrice = minPrice;
        }

            if (numericPrice < 0) {
                return res.status(400).json({ error: 'Price must be positive' });
            }
            if (numericBasePrice < 0) {
                return res.status(400).json({ error: 'Base price must be positive' });
            }

            const eventId = await Event.create({
                title,
                description,
                venue,
                event_date,
                price: numericPrice,
                capacity: effectiveCapacity,
                organizer_id,
                category,
                image_url,
                venue_id,
                base_price: numericBasePrice,
                section_pricing: parsedSectionPricing,
                status: status || 'draft'
            });

            const event = await Event.getById(eventId);

            res.status(201).json({
                message: 'Event created successfully' + (req.file ? ' with image' : ''),
                event
            });

        } catch (error) {
            console.error('Create event error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Update event with image upload (COMBINED METHOD)
   static async updateEvent(req, res) {
    try {
        const eventId = req.params.id;
        const userId = req.user.id;

        console.log('📋 [EventController] Update request body:', req.body);

        // Check if user is the organizer
        const isOrganizer = await Event.isOrganizer(eventId, userId);
        if (!isOrganizer) {
            return res.status(403).json({ error: 'Not authorized to update this event' });
        }

        const { 
            title, description, venue, event_date, price, capacity, category,
            venue_id, base_price, status, section_pricing
        } = req.body;
        console.log('[EventController.updateEvent] section_pricing raw:', section_pricing);

        // Handle image upload
        let image_url = null;
        if (req.file) {
            image_url = req.file.filename;
        } else {
            // If no new image, keep the existing one
            const existingEvent = await Event.getByIdAny(eventId, false);
            if (existingEvent && existingEvent.image_url) {
                // Extract filename from full URL
                image_url = existingEvent.image_url.split('/').pop();
            }
        }

        // ✅ PASS venue_id and base_price to the Event model
        // Parse section pricing JSON if present
        let parsedSectionPricing = null;
        if (section_pricing) {
            try {
                parsedSectionPricing = typeof section_pricing === 'string'
                    ? JSON.parse(section_pricing)
                    : section_pricing;
            } catch (err) {
                return res.status(400).json({ error: 'section_pricing must be valid JSON' });
            }
        }

        // Derive headline/base price from section pricing if provided
        let numericPrice = price !== undefined ? Number(price) : undefined;
        let numericBasePrice = base_price !== undefined ? Number(base_price) : undefined;
        if (parsedSectionPricing && Array.isArray(parsedSectionPricing.sections)) {
            const prices = parsedSectionPricing.sections
                .map(s => Number(s.price || 0))
                .filter(v => !Number.isNaN(v) && v >= 0);
            const minPrice = prices.length ? Math.min(...prices) : 0;
            numericPrice = minPrice;
            numericBasePrice = minPrice;
        }

        const updated = await Event.update(eventId, {
            title, description, venue, event_date, price: numericPrice, capacity, category, image_url,
            venue_id, base_price: numericBasePrice, status, section_pricing: parsedSectionPricing
        });
        
        if (!updated) {
            return res.status(404).json({ error: 'Event not found' });
        }

        const event = await Event.getById(eventId);
        res.json({ 
            message: 'Event updated successfully' + (req.file ? ' with new image' : ''),
            event 
        });

    } catch (error) {
        console.error('Update event error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}
    // Delete event image
    static async deleteEventImage(req, res) {
        try {
            const eventId = req.params.id;
            const userId = req.user.id;

            // Check if user is the organizer
            const isOrganizer = await Event.isOrganizer(eventId, userId);
            if (!isOrganizer) {
                return res.status(403).json({ error: 'Not authorized to update this event' });
            }

            // Get current event to check if it has an image
            const event = await Event.getById(eventId);
            if (!event) {
                return res.status(404).json({ error: 'Event not found' });
            }

            if (!event.image_url) {
                return res.status(400).json({ error: 'Event does not have an image' });
            }

            // Remove image from event (set image_url to null)
            const updated = await Event.update(eventId, {
                title: event.title,
                description: event.description,
                venue: event.venue,
                event_date: event.event_date,
                price: event.price,
                capacity: event.capacity,
                category: event.category,
                image_url: null
            });

            if (!updated) {
                return res.status(404).json({ error: 'Event not found' });
            }

            res.json({ 
                message: 'Event image removed successfully',
                event: await Event.getById(eventId)
            });

        } catch (error) {
            console.error('Delete event image error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Get all events (Public)
    static async getAllEvents(req, res) {
        try {
            const events = await Event.getAll();
            res.json({ events });
        } catch (error) {
            console.error('Get events error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Get single event (Public)
    static async getEvent(req, res) {
        try {
            const event = await Event.getById(req.params.id);
            
            if (!event) {
                return res.status(404).json({ error: 'Event not found' });
            }

            res.json({ event });
        } catch (error) {
            console.error('Get event error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Get organizer's events
    static async getMyEvents(req, res) {
        try {
            const events = await Event.getByOrganizer(req.user.id);
            res.json({ events });
        } catch (error) {
            console.error('Get my events error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Delete event (Organizer only)
    static async deleteEvent(req, res) {
        try {
            const eventId = req.params.id;
            const userId = req.user.id;

            // Check if user is the organizer
            const isOrganizer = await Event.isOrganizer(eventId, userId);
            if (!isOrganizer) {
                return res.status(403).json({ error: 'Not authorized to delete this event' });
            }

            const deleted = await Event.delete(eventId);
            
            if (!deleted) {
                return res.status(404).json({ error: 'Event not found' });
            }

            res.json({ message: 'Event deleted successfully' });

        } catch (error) {
            console.error('Delete event error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Restore deleted event (Organizer only)
    static async restoreEvent(req, res) {
        try {
            const eventId = req.params.id;
            const userId = req.user.id;

            // Check if user was the original organizer
            const isOrganizer = await Event.isOrganizer(eventId, userId);
            if (!isOrganizer) {
                return res.status(403).json({ error: 'Not authorized to restore this event' });
            }

            const restored = await Event.restore(eventId);
            
            if (!restored) {
                return res.status(404).json({ error: 'Event not found or already active' });
            }

            const event = await Event.getById(eventId);
            res.json({ 
                message: 'Event restored successfully',
                event 
            });

        } catch (error) {
            console.error('Restore event error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

     // Search events with filters - FIXED VERSION
static async searchEvents(req, res) {
    try {
        const {
            search, 
            category, 
            venue,
            organizer,
            start_date, 
            end_date,
            min_price, 
            max_price, 
            sort = 'soonest', 
            limit = 12, 
            page = 1
        } = req.query;

        console.log('🔍 Received search request with filters:', req.query);

        // ✅ FIX: Separate the filters from limit/offset
        const filters = {
            search: search?.trim() || '',
            category: category || '',
            venue: venue || '',
            organizer: organizer || '',
            start_date: start_date || '',
            end_date: end_date || '',
            min_price: min_price ? parseFloat(min_price) : null,
            max_price: max_price ? parseFloat(max_price) : null,
            sort: sort || 'soonest'
        };

        // Remove empty filters
        Object.keys(filters).forEach(key => {
            if (filters[key] === '' || filters[key] === null || filters[key] === undefined) {
                delete filters[key];
            }
        });

        // ✅ FIX: Pass limit and offset as separate parameters
        const limitValue = parseInt(limit, 10) || 12;
        const offsetValue = (parseInt(page, 10) - 1) * limitValue;

        console.log('🔍 Processed filters:', filters);
        console.log('🔍 Pagination - limit:', limitValue, 'offset:', offsetValue);

        // ✅ FIX: Pass limit and offset in the filters object
        const events = await Event.search({
            ...filters,
            limit: limitValue,
            offset: offsetValue
        });

        console.log('🔍 Events found:', events.length);

        // Get total count for pagination (without limit/offset)
        const totalEvents = await Event.getSearchCount(filters);
        console.log('🔍 Total events count:', totalEvents);

        // Get search statistics
        const stats = await Event.getSearchStats();

        res.json({
            success: true,
            events: events,
            pagination: {
                page: parseInt(page, 10) || 1,
                limit: limitValue,
                total: totalEvents,
                pages: Math.ceil(totalEvents / limitValue)
            },
            stats: {
                total_events: totalEvents,
                price_range: {
                    min: stats.min_price || 0,
                    max: stats.max_price || 0
                },
                date_range: {
                    earliest: stats.earliest_date || null,
                    latest: stats.latest_date || null
                }
            },
            filters_used: filters
        });

    } catch (error) {
        console.error('❌ Search events error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Search failed',
            details: error.message 
        });
    }
    }
    // Get all categories
    static async getCategories(req, res) {
        try {
            const categories = await Event.getCategories();
            res.json({ categories });
        } catch (error) {
            console.error('Get categories error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Get all venues
    static async getVenues(req, res) {
        try {
            const venues = await Event.getVenues();
            res.json({ venues });
        } catch (error) {
            console.error('Get venues error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Get search statistics
    static async getSearchStats(req, res) {
        try {
            const stats = await Event.getSearchStats();
            res.json({ stats });
        } catch (error) {
            console.error('Get search stats error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}

module.exports = EventController;
