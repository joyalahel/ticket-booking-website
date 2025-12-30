const User = require('../models/User');
const Event = require('../models/Event');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const pool=require('../config/database');
class AdminController {
    // Get system statistics
    static async getDashboardStats(req, res) {
        try {
            // Get total users
            const [userCount] = await pool.execute('SELECT COUNT(*) as total FROM users');
            
            // Get total events
            const [eventCount] = await pool.execute('SELECT COUNT(*) as total FROM events WHERE is_active = TRUE');
            
            // Get total bookings
            const [bookingCount] = await pool.execute('SELECT COUNT(*) as total FROM bookings');
            
            // Get total revenue
            const [revenue] = await pool.execute(
                `SELECT SUM(total_price) as total 
                 FROM bookings 
                 WHERE payment_status = 'paid'`
            );

            // Get recent activities
            const [recentBookings] = await pool.execute(
                `SELECT b.*, u.name as user_name, e.title as event_title
                 FROM bookings b
                 JOIN users u ON b.user_id = u.id
                 JOIN events e ON b.event_id = e.id
                 ORDER BY b.created_at DESC
                 LIMIT 5`
            );

            res.json({
                stats: {
                    total_users: userCount[0].total,
                    total_events: eventCount[0].total,
                    total_bookings: bookingCount[0].total,
                    total_revenue: revenue[0].total || 0
                },
                recent_bookings: recentBookings
            });

        } catch (error) {
            console.error('Get dashboard stats error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Get all users (with pagination - FIXED)
    static async getAllUsers(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const offset = (page - 1) * limit;

            // ✅ FIX: Use template literals instead of prepared statements for LIMIT/OFFSET
            const [users] = await pool.execute(
                `SELECT id, name, email, role, is_active, is_verified, created_at 
                 FROM users 
                 ORDER BY created_at DESC 
                 LIMIT ${limit} OFFSET ${offset}`
            );

            const [total] = await pool.execute('SELECT COUNT(*) as total FROM users');

            res.json({
                users,
                pagination: {
                    page,
                    limit,
                    total: total[0].total,
                    pages: Math.ceil(total[0].total / limit)
                }
            });

        } catch (error) {
            console.error('Get all users error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Get all events (including inactive - FIXED)
    static async getAllEvents(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const offset = (page - 1) * limit;

            // ✅ FIX: Use template literals for LIMIT/OFFSET
            const [events] = await pool.execute(
                `SELECT e.*, u.name as organizer_name,
                 (e.capacity - COALESCE(SUM(CASE WHEN b.payment_status IN ('pending', 'paid') THEN b.quantity ELSE 0 END), 0)) as available_tickets
                 FROM events e 
                 JOIN users u ON e.organizer_id = u.id 
                 LEFT JOIN bookings b ON e.id = b.event_id
                 GROUP BY e.id
                 ORDER BY e.created_at DESC 
                 LIMIT ${limit} OFFSET ${offset}`
            );

            const [total] = await pool.execute('SELECT COUNT(*) as total FROM events');

            res.json({
                events,
                pagination: {
                    page,
                    limit,
                    total: total[0].total,
                    pages: Math.ceil(total[0].total / limit)
                }
            });

        } catch (error) {
            console.error('Get all events error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Get all bookings (FIXED)
    static async getAllBookings(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const offset = (page - 1) * limit;

            // ✅ FIX: Use template literals for LIMIT/OFFSET
            const [bookings] = await pool.execute(
                `SELECT b.*, u.name as user_name, e.title as event_title
                 FROM bookings b
                 JOIN users u ON b.user_id = u.id
                 JOIN events e ON b.event_id = e.id
                 ORDER BY b.created_at DESC
                 LIMIT ${limit} OFFSET ${offset}`
            );

            const [total] = await pool.execute('SELECT COUNT(*) as total FROM bookings');

            res.json({
                bookings,
                pagination: {
                    page,
                    limit,
                    total: total[0].total,
                    pages: Math.ceil(total[0].total / limit)
                }
            });

        } catch (error) {
            console.error('Get all bookings error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Update user role (this should work fine as it doesn't use LIMIT/OFFSET)
    static async updateUserRole(req, res) {
        try {
            const { userId } = req.params;
            const { role } = req.body;

            if (!['user', 'organizer', 'admin'].includes(role)) {
                return res.status(400).json({ error: 'Invalid role' });
            }

            const [result] = await pool.execute(
                'UPDATE users SET role = ? WHERE id = ?',
                [role, userId]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            res.json({ message: 'User role updated successfully' });

        } catch (error) {
            console.error('Update user role error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Delete event (admin can delete any event)
    static async deleteEvent(req, res) {
        try {
            const { eventId } = req.params;

            const [result] = await pool.execute(
                'UPDATE events SET is_active = FALSE WHERE id = ?',
                [eventId]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Event not found' });
            }

            res.json({ message: 'Event deleted successfully' });

        } catch (error) {
            console.error('Admin delete event error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Restore any event
    static async restoreEvent(req, res) {
        try {
            const { eventId } = req.params;

            const [result] = await pool.execute(
                'UPDATE events SET is_active = TRUE WHERE id = ?',
                [eventId]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Event not found' });
            }

            res.json({ message: 'Event restored successfully' });

        } catch (error) {
            console.error('Admin restore event error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
    // Delete user (admin only)
    static async deleteUser(req, res) {
        try {
            const { userId } = req.params;

            // Prevent admin from deleting themselves
            if (parseInt(userId) === req.user.id) {
                return res.status(400).json({ error: 'Cannot delete your own account' });
            }

            // Get user details first
            const user = await User.getUserWithStats(userId);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            // Check if user is organizer with events
            if (user.role === 'organizer' && user.event_count > 0) {
                return res.status(400).json({ 
                    error: 'Cannot delete organizer with active events',
                    details: {
                        event_count: user.event_count,
                        suggestion: 'Transfer events to another organizer or set them inactive first'
                    }
                });
            }

            const deleted = await User.delete(userId);
            
            if (!deleted) {
                return res.status(404).json({ error: 'User not found' });
            }

            res.json({ 
                message: 'User deleted successfully',
                deleted_user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    events_owned: user.event_count,
                    bookings_made: user.booking_count
                }
            });

        } catch (error) {
            console.error('Delete user error:', error);
            
            if (error.message.includes('Cannot delete organizer with active events')) {
                return res.status(400).json({ error: error.message });
            }

            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Soft delete user (set inactive)
    static async softDeleteUser(req, res) {
        try {
            const { userId } = req.params;

            // Prevent admin from deactivating themselves
            if (parseInt(userId) === req.user.id) {
                return res.status(400).json({ error: 'Cannot deactivate your own account' });
            }

            const user = await User.getUserWithStats(userId);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            const deactivated = await User.softDelete(userId);
            
            if (!deactivated) {
                return res.status(404).json({ error: 'User not found' });
            }

            res.json({ 
                message: 'User deactivated successfully',
                deactivated_user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    is_active: false
                }
            });

        } catch (error) {
            console.error('Soft delete user error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Reactivate user
    static async reactivateUser(req, res) {
        try {
            const { userId } = req.params;

            const [result] = await pool.execute(
                'UPDATE users SET is_active = TRUE WHERE id = ?',
                [userId]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            const user = await User.findById(userId);

            res.json({ 
                message: 'User reactivated successfully',
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    is_active: true
                }
            });

        } catch (error) {
            console.error('Reactivate user error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Get user details with full stats
    static async getUserDetails(req, res) {
        try {
            const { userId } = req.params;

            const user = await User.getUserWithStats(userId);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            // Get user's events if organizer
            let events = [];
            if (user.role === 'organizer') {
                events = await Event.getByOrganizer(userId);
            }

            // Get user's bookings
            const bookings = await Booking.getByUser(userId);

            res.json({
                user,
                events,
                bookings: bookings.slice(0, 10) // Last 10 bookings
            });

        } catch (error) {
            console.error('Get user details error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}

module.exports = AdminController;
