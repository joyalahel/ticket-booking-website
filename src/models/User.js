const pool = require('../config/database.js');
const bcrypt = require('bcryptjs');

class User {
    // Create new user
    static async create(userData) {
        const { name, email, password, phone, role = 'user' } = userData;
        
        // Hash password
        const password_hash = await bcrypt.hash(password, 10);
        
        const [result] = await pool.execute(
            'INSERT INTO users (name, email, password_hash, phone, role) VALUES (?, ?, ?, ?, ?)',
            [name, email, password_hash, phone, role]
        );
        return result.insertId;
    }

    // Find user by email
    static async findByEmail(email) {
        const [rows] = await pool.execute(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );
        return rows[0];
    }

    // Find user by ID (without password)
    static async findById(id) {
        const [rows] = await pool.execute(
            'SELECT id, name, email, phone, role, created_at FROM users WHERE id = ?',
            [id]
        );
        return rows[0];
    }

    // Verify password
    static async verifyPassword(plainPassword, hashedPassword) {
        return await bcrypt.compare(plainPassword, hashedPassword);
    }

    // Update user verification status
    static async verifyUser(userId) {
        await pool.execute(
            'UPDATE users SET is_verified = TRUE WHERE id = ?',
            [userId]
        );
    }

    // Change password with current password verification
    static async changePassword(userId, currentPassword, newPassword) {
        const [rows] = await pool.execute(
            'SELECT password_hash FROM users WHERE id = ?',
            [userId]
        );

        if (!rows.length) {
            throw new Error('User not found');
        }

        const user = rows[0];
        const matches = await bcrypt.compare(currentPassword, user.password_hash);
        if (!matches) {
            throw new Error('Current password is incorrect');
        }

        const newHash = await bcrypt.hash(newPassword, 10);
        await pool.execute(
            'UPDATE users SET password_hash = ? WHERE id = ?',
            [newHash, userId]
        );
        return true;
    }
    // Delete user (admin only)
    static async delete(userId) {
        const connection = await pool.getConnection();
        
        try {
            await connection.beginTransaction();

            // First, check if user has any events (if organizer)
            const [events] = await connection.execute(
                'SELECT id FROM events WHERE organizer_id = ?',
                [userId]
            );

            // If user is organizer with events, we need to handle this
            if (events.length > 0) {
                // Option 1: Transfer events to admin or delete them
                // Option 2: Prevent deletion (we'll do this for safety)
                throw new Error('Cannot delete organizer with active events. Transfer events first or set them inactive.');
            }

            // Delete user's bookings
            await connection.execute(
                'DELETE FROM bookings WHERE user_id = ?',
                [userId]
            );

            // Delete user's payments (through bookings)
            // Note: This might need adjustment based on your payment structure

            // Finally delete the user
            const [result] = await connection.execute(
                'DELETE FROM users WHERE id = ?',
                [userId]
            );

            await connection.commit();
            return result.affectedRows > 0;

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // Soft delete user (set as inactive instead of deleting)
    static async softDelete(userId) {
        const [result] = await pool.execute(
            'UPDATE users SET is_active = FALSE WHERE id = ?',
            [userId]
        );
        return result.affectedRows > 0;
    }

    // Get user details with activity info
    static async getUserWithStats(userId) {
        const [user] = await pool.execute(
            `SELECT u.*, 
             COUNT(DISTINCT e.id) as event_count,
             COUNT(DISTINCT b.id) as booking_count
             FROM users u
             LEFT JOIN events e ON u.id = e.organizer_id
             LEFT JOIN bookings b ON u.id = b.user_id
             WHERE u.id = ?
             GROUP BY u.id`,
            [userId]
        );
        return user[0];
    }
    // Soft delete user account (user can delete their own account)
    static async softDeleteUser(userId) {
        const connection = await pool.getConnection();
        
        try {
            await connection.beginTransaction();

            // Check if user has any pending bookings
            const [pendingBookings] = await connection.execute(
                'SELECT id FROM bookings WHERE user_id = ? AND payment_status = "pending"',
                [userId]
            );

            if (pendingBookings.length > 0) {
                throw new Error('Cannot delete account with pending bookings. Please cancel pending bookings first.');
            }

            // Check if user is organizer with active events
            const [activeEvents] = await connection.execute(
                'SELECT id FROM events WHERE organizer_id = ? AND is_active = TRUE',
                [userId]
            );

            if (activeEvents.length > 0) {
                throw new Error('Cannot delete organizer account with active events. Please transfer or deactivate events first.');
            }

            // Soft delete the user (set is_active = FALSE)
            const [result] = await connection.execute(
                'UPDATE users SET is_active = FALSE WHERE id = ?',
                [userId]
            );

            await connection.commit();
            return result.affectedRows > 0;

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // Check if user can delete their account
    static async canDeleteAccount(userId) {
        const [pendingBookings] = await pool.execute(
            'SELECT COUNT(*) as count FROM bookings WHERE user_id = ? AND payment_status = "pending"',
            [userId]
        );

        const [activeEvents] = await pool.execute(
            'SELECT COUNT(*) as count FROM events WHERE organizer_id = ? AND is_active = TRUE',
            [userId]
        );

        return {
            canDelete: pendingBookings[0].count === 0 && activeEvents[0].count === 0,
            pendingBookings: pendingBookings[0].count,
            activeEvents: activeEvents[0].count,
            reasons: []
        };
    }
}

module.exports = User;
