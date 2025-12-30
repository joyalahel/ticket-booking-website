const pool = require('../config/database');
const path = require('path'); // Add this for image URL handling
const Booking = require('./Booking');

class Event {
    // Create new event
    static async create(eventData) {
        const { title, description, venue, event_date, price, capacity, organizer_id, category, image_url, venue_id, base_price, section_pricing, status = 'draft' } = eventData;
        const sectionPricingJson = section_pricing ? JSON.stringify(section_pricing) : null;
        
        const [result] = await pool.execute(
            `INSERT INTO events (title, description, venue, event_date, price, capacity, organizer_id, category, image_url, venue_id, base_price, section_pricing, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [title, description, venue, event_date, price, capacity, organizer_id, category, image_url || null, venue_id, base_price, sectionPricingJson, status]
        );
        return result.insertId;
    }

    // Get all events (with available tickets calculation)
    static async getAll() {
        const [rows] = await pool.execute(
            `SELECT e.*, u.name as organizer_name,
             (e.capacity - COALESCE(SUM(CASE WHEN b.payment_status IN ('pending', 'paid') THEN b.quantity ELSE 0 END), 0)) as available_tickets
             FROM events e 
             JOIN users u ON e.organizer_id = u.id 
             LEFT JOIN bookings b ON e.id = b.event_id
             WHERE e.event_date > NOW() AND e.is_active = TRUE AND e.status = 'published'
             GROUP BY e.id
             ORDER BY e.event_date ASC`
        );
        
        // Add full image URLs and seat-based availability override (clamped to capacity)
        return Promise.all(rows.map(async event => {
            const seatAvailability = await Booking.getSeatAvailability(event.id);
            if (seatAvailability) {
                const seatTotal = Number(seatAvailability.totalSeats) || 0;
                const eventCapacity = Number(event.capacity);
                const capacity = Number.isFinite(eventCapacity) && eventCapacity > 0
                    ? Math.min(eventCapacity, seatTotal || eventCapacity)
                    : seatTotal;
                const bookedSeats = Number(seatAvailability.bookedSeats) || 0;
                const reservedSeats = Number(seatAvailability.reservedSeats) || 0;
                const paidSeats = Number(seatAvailability.paidSeats) || 0;
                const maxAvailable = Math.max(0, capacity - (bookedSeats + reservedSeats));
                const rawAvailable = Number(seatAvailability.availableSeats) || 0;

                event.capacity = capacity;
                event.available_tickets = Math.max(0, Math.min(rawAvailable, capacity, maxAvailable));
                event.paid_tickets = Math.max(0, Math.min(paidSeats, capacity));
            } else {
                event.available_tickets = Math.max(0, parseInt(event.available_tickets));
                const [paidRows] = await pool.execute(
                    `SELECT COALESCE(SUM(quantity),0) as paid_tickets
                     FROM bookings
                     WHERE event_id = ? AND payment_status = 'paid'`,
                    [event.id]
                );
                event.paid_tickets = Math.max(0, parseInt(paidRows?.[0]?.paid_tickets || 0));
            }
            if (event.image_url) {
                event.image_url = `/uploads/events/${event.image_url}`;
            }
            return event;
        }));
    }

    // Get event by ID (active only)
    static async getById(id) {
        return this.getByIdAny(id, true);
    }

    // Get event by ID (optionally include inactive)
    static async getByIdAny(id, activeOnly = false) {
        const whereActive = activeOnly ? 'AND e.is_active = TRUE' : '';
        const [rows] = await pool.execute(
            `SELECT e.*, u.name as organizer_name,
             (e.capacity - COALESCE(SUM(CASE WHEN b.payment_status IN ('pending', 'paid') THEN b.quantity ELSE 0 END), 0)) as available_tickets
             FROM events e 
             JOIN users u ON e.organizer_id = u.id 
             LEFT JOIN bookings b ON e.id = b.event_id
             WHERE e.id = ? ${whereActive}
             GROUP BY e.id`,
            [id]
        );
        
        const event = rows[0];
        if (event) {
            if (event.section_pricing) {
                try {
                    const raw = Buffer.isBuffer(event.section_pricing)
                        ? event.section_pricing.toString()
                        : event.section_pricing;
                    event.section_pricing = typeof raw === 'string' ? JSON.parse(raw) : raw;
                } catch (e) {
                    event.section_pricing = null;
                }
            }
            const seatAvailability = await Booking.getSeatAvailability(event.id);
            if (seatAvailability) {
                const seatTotal = Number(seatAvailability.totalSeats) || 0;
                const eventCapacity = Number(event.capacity);
                const capacity = Number.isFinite(eventCapacity) && eventCapacity > 0
                    ? Math.min(eventCapacity, seatTotal || eventCapacity)
                    : seatTotal;
                const bookedSeats = Number(seatAvailability.bookedSeats) || 0;
                const reservedSeats = Number(seatAvailability.reservedSeats) || 0;
                const maxAvailable = Math.max(0, capacity - (bookedSeats + reservedSeats));
                const rawAvailable = Number(seatAvailability.availableSeats) || 0;

                event.capacity = capacity;
                event.available_tickets = Math.max(0, Math.min(rawAvailable, capacity, maxAvailable));
                event.paid_tickets = Math.max(0, Math.min(Number(seatAvailability.paidSeats) || 0, capacity));
            } else {
                event.available_tickets = Math.max(0, parseInt(event.available_tickets));
                const [paidRows] = await pool.execute(
                    `SELECT COALESCE(SUM(quantity),0) as paid_tickets
                     FROM bookings
                     WHERE event_id = ? AND payment_status = 'paid'`,
                    [event.id]
                );
                event.paid_tickets = Math.max(0, parseInt(paidRows?.[0]?.paid_tickets || 0));
            }
            if (event.image_url) {
                event.image_url = `/uploads/events/${event.image_url}`;
            }
        }
        
        return event;
    }

    // Get events by organizer
    static async getByOrganizer(organizerId) {
        const [rows] = await pool.execute(
            `SELECT e.*, 
             (e.capacity - COALESCE(SUM(CASE WHEN b.payment_status IN ('pending', 'paid') THEN b.quantity ELSE 0 END), 0)) as available_tickets
             FROM events e 
             LEFT JOIN bookings b ON e.id = b.event_id
             WHERE e.organizer_id = ? AND e.is_active = TRUE
             GROUP BY e.id
             ORDER BY e.event_date ASC`,
            [organizerId]
        );
        
        // Add full image URLs and seat-based availability override
        return Promise.all(rows.map(async event => {
            if (event.section_pricing) {
                try {
                    const raw = Buffer.isBuffer(event.section_pricing)
                        ? event.section_pricing.toString()
                        : event.section_pricing;
                    event.section_pricing = typeof raw === 'string' ? JSON.parse(raw) : raw;
                } catch (e) {
                    event.section_pricing = null;
                }
            }
            const seatAvailability = await Booking.getSeatAvailability(event.id);
            if (seatAvailability) {
                const seatTotal = Number(seatAvailability.totalSeats) || 0;
                const eventCapacity = Number(event.capacity);
                const capacity = Number.isFinite(eventCapacity) && eventCapacity > 0
                    ? Math.min(eventCapacity, seatTotal || eventCapacity)
                    : seatTotal;
                const bookedSeats = Number(seatAvailability.bookedSeats) || 0;
                const reservedSeats = Number(seatAvailability.reservedSeats) || 0;
                const maxAvailable = Math.max(0, capacity - (bookedSeats + reservedSeats));
                const rawAvailable = Number(seatAvailability.availableSeats) || 0;

                event.capacity = capacity;
                event.available_tickets = Math.max(0, Math.min(rawAvailable, capacity, maxAvailable));
                event.paid_tickets = Math.max(0, Math.min(Number(seatAvailability.paidSeats) || 0, capacity));
            } else {
                event.available_tickets = Math.max(0, parseInt(event.available_tickets));
                const [paidRows] = await pool.execute(
                    `SELECT COALESCE(SUM(quantity),0) as paid_tickets
                     FROM bookings
                     WHERE event_id = ? AND payment_status = 'paid'`,
                    [event.id]
                );
                event.paid_tickets = Math.max(0, parseInt(paidRows?.[0]?.paid_tickets || 0));
            }
            if (event.image_url) {
                event.image_url = `/uploads/events/${event.image_url}`;
            }
            return event;
        }));
    }

    // Update event - FIXED VERSION
static async update(id, eventData) {
    try {
        console.log('🔧 [Event.update] Received data:', eventData);
        
        // Get existing event data first to fill in missing fields (include inactive)
        const existingEvent = await Event.getByIdAny(id, false);
        if (!existingEvent) {
            console.log('❌ [Event.update] Event not found:', id);
            return false;
        }

        // Create sanitized data with proper field names and no undefined values
        const sanitizedData = {};
        
        // Define all expected fields and use existing values as defaults
        const expectedFields = [
            'title', 'description', 'venue', 'event_date', 'price', 
            'capacity', 'category', 'image_url', 'venue_id', 'base_price', 'section_pricing', 'status'
        ];
        
        // Process each field
        expectedFields.forEach(field => {
            let value = eventData[field];

            // Treat empty string as "not provided" so we keep existing values on partial updates
            const isMissing = value === undefined || value === '';
            sanitizedData[field] = isMissing ? existingEvent[field] : value;
        });

        console.log('🔧 [Event.update] Sanitized data:', sanitizedData);

        // Ensure is_active reflects status
        const newStatus = sanitizedData.status || existingEvent.status || 'draft';
        const isActive = (newStatus === 'published' || newStatus === 'sold_out');

        const query = `
            UPDATE events 
            SET title = ?, description = ?, venue = ?, event_date = ?, 
                price = ?, capacity = ?, category = ?, image_url = ?,
                venue_id = ?, base_price = ?, section_pricing = ?, status = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `;
        
        const params = [
            sanitizedData.title,
            sanitizedData.description,
            sanitizedData.venue,
            sanitizedData.event_date,
            sanitizedData.price,
            sanitizedData.capacity,
            sanitizedData.category,
            sanitizedData.image_url,
            sanitizedData.venue_id,
            sanitizedData.base_price,
            sanitizedData.section_pricing ? JSON.stringify(sanitizedData.section_pricing) : null,
            newStatus,
            isActive,
            id
        ];

        console.log('🔧 [Event.update] Final params:', params);

        // Check for any undefined values in params (safety check)
        const hasUndefined = params.some(param => param === undefined);
        if (hasUndefined) {
            console.error('❌ [Event.update] Found undefined in params:', params);
            throw new Error('Cannot have undefined values in SQL parameters');
        }

        const [result] = await pool.execute(query, params);
        console.log('✅ [Event.update] Update successful, affected rows:', result.affectedRows);
        return result.affectedRows > 0;
        
    } catch (error) {
        console.error('❌ [Event.update] Error:', error);
        throw error;
    }
}
    // Delete event (soft delete)
    static async delete(id) {
        const [result] = await pool.execute(
            'UPDATE events SET is_active = FALSE WHERE id = ?',
            [id]
        );
        return result.affectedRows > 0;
    }

    // Restore soft-deleted event
    static async restore(id) {
        const [result] = await pool.execute(
            'UPDATE events SET is_active = TRUE WHERE id = ?',
            [id]
        );
        return result.affectedRows > 0;
    }

    // Check if user is event organizer
    static async isOrganizer(eventId, userId) {
        const [rows] = await pool.execute(
            'SELECT id FROM events WHERE id = ? AND organizer_id = ?',
            [eventId, userId]
        );
        return rows.length > 0;
    }

   // In your Event model - search method
static async search(filters = {}) {
    console.log('🔍 [Event.search] Starting search with filters:', filters);
    
    let query = `
        SELECT e.*, u.name as organizer_name,
        (e.capacity - COALESCE(SUM(CASE WHEN b.payment_status IN ('pending', 'paid') THEN b.quantity ELSE 0 END), 0)) as available_tickets
        FROM events e 
        JOIN users u ON e.organizer_id = u.id 
        LEFT JOIN bookings b ON e.id = b.event_id
        WHERE e.event_date > NOW() AND e.is_active = TRUE
    `;
    
    const params = [];
    const conditions = [];

    // Title/Description search
    if (filters.search) {
        conditions.push('(e.title LIKE ? OR e.description LIKE ? OR e.venue LIKE ?)');
        const searchTerm = `%${filters.search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
        console.log('🔍 [Event.search] Added search condition:', searchTerm);
    }

    // Category filter
    if (filters.category) {
        conditions.push('e.category = ?');
        params.push(filters.category);
    }

    // Date range
    if (filters.start_date) {
        conditions.push('e.event_date >= ?');
        params.push(filters.start_date);
    }
    if (filters.end_date) {
        conditions.push('e.event_date <= ?');
        params.push(filters.end_date);
    }

    // Price range
    if (filters.min_price) {
        conditions.push('e.price >= ?');
        params.push(parseFloat(filters.min_price));
    }
    if (filters.max_price) {
        conditions.push('e.price <= ?');
        params.push(parseFloat(filters.max_price));
    }

    // Venue filter
    if (filters.venue) {
        conditions.push('e.venue LIKE ?');
        params.push(`%${filters.venue}%`);
    }

    // Organizer filter
    if (filters.organizer) {
        conditions.push('u.name LIKE ?');
        params.push(`%${filters.organizer}%`);
    }

    // Add conditions to query
    if (conditions.length > 0) {
        query += ' AND ' + conditions.join(' AND ');
    }

    query += ' GROUP BY e.id';

    // Sorting
    if (filters.sort) {
        const sortMap = {
            'date_asc': 'e.event_date ASC',
            'date_desc': 'e.event_date DESC',
            'price_asc': 'e.price ASC', 
            'price_desc': 'e.price DESC',
            'name_asc': 'e.title ASC',
            'name_desc': 'e.title DESC',
            'popular': 'available_tickets DESC',
            'soonest': 'e.event_date ASC'
        };
        query += ` ORDER BY ${sortMap[filters.sort] || 'e.event_date ASC'}`;
        console.log('🔍 [Event.search] Sorting by:', filters.sort);
    } else {
        query += ' ORDER BY e.event_date ASC';
    }

    // ✅ FIX: Add LIMIT and OFFSET directly to the query (not as parameters)
    if (filters.limit) {
        const limit = parseInt(filters.limit, 10);
        query += ` LIMIT ${limit}`;
    }
    if (filters.offset) {
        const offset = parseInt(filters.offset, 10);
        query += ` OFFSET ${offset}`;
    }

    console.log('🔍 [Event.search] Final query:', query);
    console.log('🔍 [Event.search] Final params:', params);

    try {
        const [rows] = await pool.execute(query, params);
        console.log('🔍 [Event.search] Found events:', rows.length);
        
        // Add full image URLs
        return rows.map(event => {
            if (event.image_url) {
                event.image_url = `/uploads/events/${event.image_url}`;
            }
            return event;
        });
    } catch (error) {
        console.error('❌ [Event.search] Database error:', error);
        console.error('❌ [Event.search] Failed query:', query);
        console.error('❌ [Event.search] Failed params:', params);
        throw error;
    }}

    // Get distinct categories for filters
    static async getCategories() {
        const [rows] = await pool.execute(
            'SELECT DISTINCT category FROM events WHERE category IS NOT NULL AND is_active = TRUE ORDER BY category'
        );
        return rows.map(row => row.category);
    }

    // Get distinct venues for filters
    static async getVenues() {
        const [rows] = await pool.execute(
            'SELECT DISTINCT venue FROM events WHERE venue IS NOT NULL AND is_active = TRUE ORDER BY venue'
        );
        return rows.map(row => row.venue);
    }

    // Get search results count for pagination
    static async getSearchCount(filters = {}) {
        let query = `
            SELECT COUNT(DISTINCT e.id) as total
            FROM events e 
            JOIN users u ON e.organizer_id = u.id 
            LEFT JOIN bookings b ON e.id = b.event_id
            WHERE e.event_date > NOW() AND e.is_active = TRUE
        `;
        
        const params = [];
        const conditions = [];

        // Title/Description search
        if (filters.search) {
            conditions.push('(e.title LIKE ? OR e.description LIKE ? OR e.venue LIKE ?)');
            const searchTerm = `%${filters.search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        // Category filter
        if (filters.category) {
            conditions.push('e.category = ?');
            params.push(filters.category);
        }

        // Date range
        if (filters.start_date) {
            conditions.push('e.event_date >= ?');
            params.push(filters.start_date);
        }
        if (filters.end_date) {
            conditions.push('e.event_date <= ?');
            params.push(filters.end_date);
        }

        // Price range
        if (filters.min_price) {
            conditions.push('e.price >= ?');
            params.push(parseFloat(filters.min_price));
        }
        if (filters.max_price) {
            conditions.push('e.price <= ?');
            params.push(parseFloat(filters.max_price));
        }

        // Add conditions to query
        if (conditions.length > 0) {
            query += ' AND ' + conditions.join(' AND ');
        }

        const [rows] = await pool.execute(query, params);
        return rows[0].total;
    }

    // Get event statistics for search page
    static async getSearchStats() {
        const [stats] = await pool.execute(`
            SELECT 
                COUNT(*) as total_events,
                MIN(price) as min_price,
                MAX(price) as max_price,
                MIN(event_date) as earliest_date,
                MAX(event_date) as latest_date
            FROM events 
            WHERE event_date > NOW() AND is_active = TRUE
        `);
        return stats[0];
    }
    static async getEventWithWaitingList(id, userId = null) {
    const event = await Event.getById(id);
    
    if (event) {
        // Get waiting list stats
        const WaitingList = require('./WaitingList');
        event.waiting_list_stats = await WaitingList.getStats(id);
        
        // Check if user is on waiting list
        if (userId) {
            event.user_waiting_list_entry = await WaitingList.getUserWaitingListEntry(userId, id);
        }
        
        // Check if event is sold out
        event.is_sold_out = event.available_tickets <= 0;
    }
    
    return event;
}

// Add method to trigger waiting list processing when tickets become available
static async handleTicketAvailabilityChange(eventId) {
    const WaitingList = require('./WaitingList');
    const EmailService = require('../services/emailService');
    const availableTickets = await WaitingList.getAvailableTickets(eventId);
    
    if (availableTickets > 0) {
        // Process waiting list if tickets become available
        const notifications = await WaitingList.processWaitingList(eventId, availableTickets);

        if (notifications.length) {
            const event = await Event.getById(eventId);

            await Promise.all(
                notifications.map(async (notification) => {
                    const { waitingListEntry, ticketsAvailable } = notification;
                    const user = {
                        id: waitingListEntry.user_id,
                        name: waitingListEntry.user_name,
                        email: waitingListEntry.user_email
                    };

                    return EmailService.sendTicketsAvailableNotification(
                        user,
                        event,
                        waitingListEntry,
                        ticketsAvailable
                    ).catch(err => console.error('Waiting list email failed:', err.message));
                })
            );
        }

        return notifications;
    }
    
    return [];
}
}

module.exports = Event;
