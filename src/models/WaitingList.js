const pool = require('../config/database');

class WaitingList {
    // Join waiting list for sold-out event
    static async join(waitingListData) {
        const { user_id, event_id, quantity = 1, notes = '' } = waitingListData;
        
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Check if event exists and is active
            const [events] = await connection.execute(
                'SELECT id, capacity FROM events WHERE id = ? AND is_active = TRUE',
                [event_id]
            );
            
            if (events.length === 0) {
                throw new Error('Event not found or inactive');
            }

            // Check if event still has available tickets
            const availableTickets = await this.getAvailableTickets(event_id);
            if (availableTickets > 0) {
                throw new Error('Event still has available tickets. Please book directly.');
            }

            // Check if user is already on waiting list
            const existingEntry = await this.getUserWaitingListEntry(user_id, event_id);
            if (existingEntry) {
                throw new Error('You are already on the waiting list for this event');
            }

            // Get next position in line
            const [positionResult] = await connection.execute(
                'SELECT COALESCE(MAX(position), 0) + 1 as next_position FROM waiting_list WHERE event_id = ? AND status = "waiting"',
                [event_id]
            );
            const nextPosition = positionResult[0].next_position;

            // Add to waiting list
            const [result] = await connection.execute(
                `INSERT INTO waiting_list (user_id, event_id, quantity, notes, position) 
                 VALUES (?, ?, ?, ?, ?)`,
                [user_id, event_id, quantity, notes, nextPosition]
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

    // Get waiting list entry for user
    static async getUserWaitingListEntry(userId, eventId) {
        const [rows] = await pool.execute(
            `SELECT wl.*, e.title as event_title, e.event_date, e.venue,
                    (SELECT COUNT(*) FROM waiting_list WHERE event_id = ? AND status = 'waiting' AND created_at < wl.created_at) as position
             FROM waiting_list wl
             JOIN events e ON wl.event_id = e.id
             WHERE wl.user_id = ? AND wl.event_id = ? AND wl.status = 'waiting'`,
            [eventId, userId, eventId]
        );
        return rows[0];
    }

    // Get all waiting list entries for an event
    static async getByEvent(eventId, organizerId = null) {
        let query = `
            SELECT wl.*, u.name as user_name, u.email as user_email, u.phone,
                   (SELECT COUNT(*) + 1 FROM waiting_list WHERE event_id = ? AND created_at < wl.created_at AND status = 'waiting') as position
            FROM waiting_list wl
            JOIN users u ON wl.user_id = u.id
            JOIN events e ON wl.event_id = e.id
            WHERE wl.event_id = ? AND wl.status = 'waiting'
        `;
        
        const params = [eventId, eventId];
        
        if (organizerId) {
            query += ' AND e.organizer_id = ?';
            params.push(organizerId);
        }
        
        query += ' ORDER BY wl.created_at ASC';
        
        const [rows] = await pool.execute(query, params);
        return rows;
    }

    // Get next person on waiting list
    static async getNextOnWaitingList(eventId) {
        const [rows] = await pool.execute(
            `SELECT wl.*, u.name, u.email, u.phone
             FROM waiting_list wl
             JOIN users u ON wl.user_id = u.id
             WHERE wl.event_id = ? AND wl.status = 'waiting'
             ORDER BY wl.created_at ASC
             LIMIT 1`,
            [eventId]
        );
        return rows[0];
    }

    // Update waiting list status
    static async updateStatus(waitingListId, status, bookingId = null) {
        const updates = ['status = ?, updated_at = CURRENT_TIMESTAMP'];
        const params = [status];

        if (bookingId) {
            updates.push('booking_id = ?');
            params.push(bookingId);
        }

        if (status === 'converted') {
            updates.push('converted_at = NOW()');
        } else if (status === 'notified') {
            updates.push('notification_sent_at = NOW(), notification_expires_at = DATE_ADD(NOW(), INTERVAL 24 HOUR)');
        }

        const [result] = await pool.execute(
            `UPDATE waiting_list SET ${updates.join(', ')} WHERE id = ?`,
            [...params, waitingListId]
        );
        return result.affectedRows > 0;
    }

    // Notify user and set expiration for response
    static async notifyUser(waitingListId) {
        const [result] = await pool.execute(
            `UPDATE waiting_list 
             SET status = 'notified', 
                 notification_sent_at = NOW(),
                 notification_expires_at = DATE_ADD(NOW(), INTERVAL 24 HOUR),
                 updated_at = CURRENT_TIMESTAMP 
             WHERE id = ? AND status = 'waiting'`,
            [waitingListId]
        );
        return result.affectedRows > 0;
    }

    // Leave waiting list
    static async leave(waitingListId, userId) {
        const [result] = await pool.execute(
            'UPDATE waiting_list SET status = "cancelled", updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
            [waitingListId, userId]
        );
        return result.affectedRows > 0;
    }

    // Get user's waiting list entries
    static async getByUser(userId) {
        const [rows] = await pool.execute(
            `SELECT wl.*, e.title, e.event_date, e.venue, e.image_url, e.price,
                    (SELECT COUNT(*) + 1 FROM waiting_list WHERE event_id = wl.event_id AND created_at < wl.created_at AND status = 'waiting') as position
             FROM waiting_list wl
             JOIN events e ON wl.event_id = e.id
             WHERE wl.user_id = ? AND wl.status = 'waiting'
             ORDER BY wl.created_at DESC`,
            [userId]
        );
        return rows;
    }

    // Get available tickets (reuse from Booking model)
    static async getAvailableTickets(eventId) {
        const Booking = require('./Booking');
        const availability = await Booking.getRealTimeAvailability(eventId);
        return availability?.availableTickets || 0;
    }

    // Process waiting list when tickets become available
    static async processWaitingList(eventId, availableTickets = null) {
        const connection = await pool.getConnection();
        
        try {
            await connection.beginTransaction();

            // Get current available tickets if not provided
            let ticketsAvailable = availableTickets;
            if (ticketsAvailable === null) {
                ticketsAvailable = await this.getAvailableTickets(eventId);
            }

            if (ticketsAvailable <= 0) {
                return []; // No tickets available
            }

            const notifications = [];
            let remainingTickets = ticketsAvailable;
            
            // Get waiting list entries in order
            const waitingList = await this.getByEvent(eventId);
            
            for (const entry of waitingList) {
                if (remainingTickets <= 0) break;
                
                if (entry.quantity <= remainingTickets) {
                    // Can fulfill entire request
                    await this.notifyUser(entry.id);
                    notifications.push({
                        waitingListEntry: entry,
                        canBook: true,
                        ticketsAvailable: entry.quantity,
                        priority: notifications.length + 1,
                        type: 'full'
                    });
                    remainingTickets -= entry.quantity;
                } else {
                    // Can only fulfill partial request
                    await this.notifyUser(entry.id);
                    notifications.push({
                        waitingListEntry: entry,
                        canBook: true,
                        ticketsAvailable: remainingTickets,
                        priority: notifications.length + 1,
                        type: 'partial'
                    });
                    remainingTickets = 0;
                }
            }
            
            await connection.commit();
            return notifications;

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // Get expired notifications
    static async getExpiredNotifications() {
        const [rows] = await pool.execute(
            `SELECT wl.*, u.name, u.email, e.title as event_title
             FROM waiting_list wl
             JOIN users u ON wl.user_id = u.id
             JOIN events e ON wl.event_id = e.id
             WHERE wl.status = 'notified' AND wl.notification_expires_at <= NOW()`
        );
        return rows;
    }

    // Get events that currently have people waiting
    static async getEventsWithWaitingList() {
        const [rows] = await pool.execute(
            `SELECT DISTINCT event_id 
             FROM waiting_list 
             WHERE status = 'waiting'`
        );
        return rows.map(r => r.event_id);
    }

    // Expire old notifications and move to next in line
    static async expireOldNotifications() {
        const connection = await pool.getConnection();
        
        try {
            await connection.beginTransaction();

            const expiredEntries = await this.getExpiredNotifications();
            
            for (const entry of expiredEntries) {
                // Mark as expired
                await connection.execute(
                    'UPDATE waiting_list SET status = "expired", updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [entry.id]
                );
            }

            await connection.commit();
            return expiredEntries.length;

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // Get waiting list stats for organizer
    static async getStats(eventId, organizerId = null) {
        let query = `
            SELECT 
                COUNT(*) as total_waiting,
                SUM(quantity) as total_tickets_requested,
                MIN(created_at) as oldest_entry,
                COUNT(CASE WHEN status = 'notified' THEN 1 END) as notified_count,
                COUNT(CASE WHEN status = 'converted' THEN 1 END) as converted_count
            FROM waiting_list wl
            JOIN events e ON wl.event_id = e.id
            WHERE wl.event_id = ?
        `;
        
        const params = [eventId];
        
        if (organizerId) {
            query += ' AND e.organizer_id = ?';
            params.push(organizerId);
        }
        
        const [rows] = await pool.execute(query, params);
        return rows[0];
    }

    // Check if user can convert waiting list to booking
    static async canConvertToBooking(waitingListId, userId) {
        const [rows] = await pool.execute(
            `SELECT wl.*, e.price, e.title as event_title
             FROM waiting_list wl
             JOIN events e ON wl.event_id = e.id
             WHERE wl.id = ? AND wl.user_id = ? AND wl.status = 'notified' AND wl.notification_expires_at > NOW()`,
            [waitingListId, userId]
        );
        return rows[0];
    }
}

module.exports = WaitingList;
