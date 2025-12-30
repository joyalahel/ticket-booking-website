const pool = require('../config/database');

class OrganizerRequest {
    static async create(userId, notes = null) {
        const [exists] = await pool.execute(
            `SELECT id FROM organizer_requests 
             WHERE user_id = ? AND status = 'pending'`,
            [userId]
        );
        if (exists.length) {
            throw new Error('You already have a pending organizer request');
        }

        const [result] = await pool.execute(
            `INSERT INTO organizer_requests (user_id, notes, status) VALUES (?, ?, 'pending')`,
            [userId, notes || null]
        );
        return result.insertId;
    }

    static async getPending() {
        const [rows] = await pool.execute(
            `SELECT r.*, u.name, u.email 
             FROM organizer_requests r
             JOIN users u ON r.user_id = u.id
             WHERE r.status = 'pending'
             ORDER BY r.created_at ASC`
        );
        return rows;
    }

    static async getById(id) {
        const [rows] = await pool.execute(
            `SELECT r.*, u.name, u.email 
             FROM organizer_requests r
             JOIN users u ON r.user_id = u.id
             WHERE r.id = ?`,
            [id]
        );
        return rows[0];
    }

    static async decide(id, approve, adminNotes = null) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const [rows] = await connection.execute(
                'SELECT * FROM organizer_requests WHERE id = ? FOR UPDATE',
                [id]
            );
            if (!rows.length) {
                throw new Error('Request not found');
            }
            const request = rows[0];
            if (request.status !== 'pending') {
                throw new Error('Request already processed');
            }

            const newStatus = approve ? 'approved' : 'rejected';

            await connection.execute(
                `UPDATE organizer_requests 
                 SET status = ?, admin_notes = ?, reviewed_at = NOW() 
                 WHERE id = ?`,
                [newStatus, adminNotes || null, id]
            );

            if (approve) {
                await connection.execute(
                    'UPDATE users SET role = "organizer" WHERE id = ?',
                    [request.user_id]
                );
            }

            await connection.commit();
            return { ...request, status: newStatus, admin_notes: adminNotes || null };
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    }
}

module.exports = OrganizerRequest;
