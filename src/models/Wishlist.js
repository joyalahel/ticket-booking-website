const pool = require('../config/database');

class Wishlist {
    // Add event to wishlist
    static async addToWishlist(userId, eventId) {
        const connection = await pool.getConnection();
        
        try {
            await connection.beginTransaction();

            // Check if event exists and is active
            const [events] = await connection.execute(
                'SELECT id, title FROM events WHERE id = ? AND is_active = TRUE AND event_date > NOW()',
                [eventId]
            );
            
            if (events.length === 0) {
                throw new Error('Event not found, inactive, or has already passed');
            }

            // Check if already in wishlist
            const [existing] = await connection.execute(
                'SELECT id FROM wishlist WHERE user_id = ? AND event_id = ?',
                [userId, eventId]
            );

            if (existing.length > 0) {
                throw new Error('Event is already in your wishlist');
            }

            // Add to wishlist
            const [result] = await connection.execute(
                'INSERT INTO wishlist (user_id, event_id) VALUES (?, ?)',
                [userId, eventId]
            );

            await connection.commit();
            return result.insertId;

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // Remove event from wishlist
    static async removeFromWishlist(userId, wishlistId) {
        const [result] = await pool.execute(
            'DELETE FROM wishlist WHERE id = ? AND user_id = ?',
            [wishlistId, userId]
        );
        return result.affectedRows > 0;
    }

    // Remove by event ID
    static async removeFromWishlistByEvent(userId, eventId) {
        const [result] = await pool.execute(
            'DELETE FROM wishlist WHERE user_id = ? AND event_id = ?',
            [userId, eventId]
        );
        return result.affectedRows > 0;
    }

    // Get user's wishlist - COMPLETELY FIXED VERSION
    static async getByUser(userId, filters = {}) {
        // First get wishlist items
        let wishlistQuery = `
            SELECT w.id as wishlist_id, w.created_at as wishlist_created_at, w.event_id
            FROM wishlist w
            JOIN events e ON w.event_id = e.id
            WHERE w.user_id = ? AND e.is_active = TRUE AND e.event_date > NOW()
        `;

        const wishlistParams = [userId];
        const conditions = [];

        // Category filter
        if (filters.category) {
            conditions.push('e.category = ?');
            wishlistParams.push(filters.category);
        }

        // Price range
        if (filters.min_price) {
            conditions.push('e.price >= ?');
            wishlistParams.push(parseFloat(filters.min_price));
        }
        if (filters.max_price) {
            conditions.push('e.price <= ?');
            wishlistParams.push(parseFloat(filters.max_price));
        }

        // Date range
        if (filters.start_date) {
            conditions.push('e.event_date >= ?');
            wishlistParams.push(filters.start_date);
        }
        if (filters.end_date) {
            conditions.push('e.event_date <= ?');
            wishlistParams.push(filters.end_date);
        }

        // Add conditions
        if (conditions.length > 0) {
            wishlistQuery += ' AND ' + conditions.join(' AND ');
        }

        wishlistQuery += ' ORDER BY w.created_at DESC';

        // Pagination
        if (filters.limit) {
            wishlistQuery += ' LIMIT ?';
            wishlistParams.push(parseInt(filters.limit));
        }
        if (filters.offset) {
            wishlistQuery += ' OFFSET ?';
            wishlistParams.push(parseInt(filters.offset));
        }

        const [wishlistRows] = await pool.execute(wishlistQuery, wishlistParams);

        if (wishlistRows.length === 0) {
            return [];
        }

        // Get event IDs from wishlist
        const eventIds = wishlistRows.map(row => row.event_id);
        const placeholders = eventIds.map(() => '?').join(',');

        // Get events with availability
        const eventsQuery = `
            SELECT 
                e.id, e.title, e.description, e.venue, e.event_date, e.price, 
                e.image_url, e.organizer_id, e.category, e.capacity,
                u.name as organizer_name,
                (e.capacity - COALESCE(SUM(CASE WHEN b.payment_status IN ('pending', 'paid') THEN b.quantity ELSE 0 END), 0)) as available_tickets
            FROM events e
            JOIN users u ON e.organizer_id = u.id
            LEFT JOIN bookings b ON e.id = b.event_id
            WHERE e.id IN (${placeholders})
            GROUP BY e.id, e.title, e.description, e.venue, e.event_date, e.price, e.image_url, e.organizer_id, e.category, e.capacity, u.name
        `;

        const [eventRows] = await pool.execute(eventsQuery, eventIds);

        // Combine wishlist and event data
        const eventMap = new Map();
        eventRows.forEach(event => {
            eventMap.set(event.id, event);
        });

        return wishlistRows.map(wishlistItem => {
            const event = eventMap.get(wishlistItem.event_id);
            return {
                id: wishlistItem.wishlist_id,
                created_at: wishlistItem.wishlist_created_at,
                event: {
                    id: event.id,
                    title: event.title,
                    description: event.description,
                    venue: event.venue,
                    event_date: event.event_date,
                    price: event.price,
                    image_url: event.image_url ? `/uploads/events/${event.image_url}` : null,
                    organizer_id: event.organizer_id,
                    category: event.category,
                    capacity: event.capacity,
                    organizer_name: event.organizer_name,
                    available_tickets: event.available_tickets
                }
            };
        });
    }

    // Check if event is in user's wishlist
    static async isInWishlist(userId, eventId) {
        const [rows] = await pool.execute(
            'SELECT id FROM wishlist WHERE user_id = ? AND event_id = ?',
            [userId, eventId]
        );
        return rows.length > 0;
    }

    // Get wishlist item by ID
    static async getById(wishlistId, userId = null) {
        let query = `
            SELECT w.*, e.title, e.venue, e.event_date, e.price, e.image_url
            FROM wishlist w
            JOIN events e ON w.event_id = e.id
            WHERE w.id = ?
        `;
        
        const params = [wishlistId];
        
        if (userId) {
            query += ' AND w.user_id = ?';
            params.push(userId);
        }

        const [rows] = await pool.execute(query, params);
        return rows[0];
    }

    // Get wishlist count for user
    static async getCount(userId) {
        const [rows] = await pool.execute(
            `SELECT COUNT(*) as count 
             FROM wishlist w
             JOIN events e ON w.event_id = e.id
             WHERE w.user_id = ? AND e.is_active = TRUE AND e.event_date > NOW()`,
            [userId]
        );
        return rows[0].count;
    }

    // Clear user's wishlist
    static async clearWishlist(userId) {
        const [result] = await pool.execute(
            'DELETE FROM wishlist WHERE user_id = ?',
            [userId]
        );
        return result.affectedRows;
    }

    // Get wishlist events with availability status - FIXED VERSION
    static async getWishlistWithAvailability(userId) {
        // First get wishlist items
        const [wishlistRows] = await pool.execute(
            `SELECT w.id as wishlist_id, w.created_at as wishlist_created_at, w.event_id
             FROM wishlist w
             JOIN events e ON w.event_id = e.id
             WHERE w.user_id = ? AND e.is_active = TRUE AND e.event_date > NOW()
             ORDER BY w.created_at DESC`,
            [userId]
        );

        if (wishlistRows.length === 0) {
            return [];
        }

        // Get event IDs
        const eventIds = wishlistRows.map(row => row.event_id);
        const placeholders = eventIds.map(() => '?').join(',');

        // Get events with availability
        const [eventRows] = await pool.execute(
            `SELECT 
                e.id, e.title, e.venue, e.event_date, e.price, e.image_url, e.capacity,
                (e.capacity - COALESCE(SUM(CASE WHEN b.payment_status IN ('pending', 'paid') THEN b.quantity ELSE 0 END), 0)) as available_tickets,
                CASE 
                    WHEN (e.capacity - COALESCE(SUM(CASE WHEN b.payment_status IN ('pending', 'paid') THEN b.quantity ELSE 0 END), 0)) <= 0 THEN 'sold_out'
                    WHEN (e.capacity - COALESCE(SUM(CASE WHEN b.payment_status IN ('pending', 'paid') THEN b.quantity ELSE 0 END), 0)) < 10 THEN 'limited'
                    ELSE 'available'
                END as availability_status
             FROM events e
             LEFT JOIN bookings b ON e.id = b.event_id
             WHERE e.id IN (${placeholders})
             GROUP BY e.id, e.title, e.venue, e.event_date, e.price, e.image_url, e.capacity
             ORDER BY FIELD(e.id, ${placeholders})`,
            [...eventIds, ...eventIds] // Need to pass eventIds twice for FIELD function
        );

        // Combine data
        const eventMap = new Map();
        eventRows.forEach(event => {
            eventMap.set(event.id, event);
        });

        return wishlistRows.map(wishlistItem => {
            const event = eventMap.get(wishlistItem.event_id);
            return {
                id: wishlistItem.wishlist_id,
                created_at: wishlistItem.wishlist_created_at,
                event: {
                    id: event.id,
                    title: event.title,
                    venue: event.venue,
                    event_date: event.event_date,
                    price: event.price,
                    image_url: event.image_url ? `/uploads/events/${event.image_url}` : null,
                    capacity: event.capacity,
                    available_tickets: event.available_tickets,
                    availability_status: event.availability_status
                }
            };
        });
    }

    // Get popular wishlisted events - FIXED VERSION
    static async getPopularWishlistedEvents(limit = 10) {
        // First get event IDs with highest wishlist counts
        const [popularIds] = await pool.execute(
            `SELECT e.id, COUNT(w.id) as wishlist_count
             FROM events e
             JOIN wishlist w ON e.id = w.event_id
             WHERE e.is_active = TRUE AND e.event_date > NOW()
             GROUP BY e.id
             ORDER BY wishlist_count DESC
             LIMIT ?`,
            [limit]
        );

        if (popularIds.length === 0) {
            return [];
        }

        const eventIds = popularIds.map(row => row.id);
        const placeholders = eventIds.map(() => '?').join(',');

        // Get full event details
        const [eventRows] = await pool.execute(
            `SELECT 
                e.id, e.title, e.description, e.venue, e.event_date, e.price, 
                e.image_url, e.category, e.capacity,
                u.name as organizer_name,
                (SELECT COUNT(*) FROM wishlist WHERE event_id = e.id) as wishlist_count,
                (e.capacity - COALESCE(SUM(CASE WHEN b.payment_status IN ('pending', 'paid') THEN b.quantity ELSE 0 END), 0)) as available_tickets
             FROM events e
             JOIN users u ON e.organizer_id = u.id
             LEFT JOIN bookings b ON e.id = b.event_id
             WHERE e.id IN (${placeholders})
             GROUP BY e.id, e.title, e.description, e.venue, e.event_date, e.price, e.image_url, e.category, e.capacity, u.name
             ORDER BY FIELD(e.id, ${placeholders})`,
            [...eventIds, ...eventIds]
        );

        return eventRows.map(event => {
            if (event.image_url) {
                event.image_url = `/uploads/events/${event.image_url}`;
            }
            return event;
        });
    }
}

module.exports = Wishlist;