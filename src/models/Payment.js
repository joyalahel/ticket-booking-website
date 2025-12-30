const pool = require('../config/database');

class Payment {
    // Create new payment
    static async create(paymentData) {
        const { booking_id, payment_method, method, transaction_id, status = 'pending', payment_data = null } = paymentData;
        
        // ✅ FIX: Handle both payment_method (from booking) and method (from payment table)
        const actualPaymentMethod = payment_method || method;
        
        console.log('🔍 [Payment Model] Creating payment with:', {
            booking_id,
            payment_method: actualPaymentMethod,
            transaction_id,
            status,
            payment_data
        });

        // ✅ FIX: Validate all required fields
        if (!booking_id || !actualPaymentMethod || !transaction_id || !status) {
            console.log('❌ [Payment Model] Missing required fields:', {
                booking_id,
                payment_method: actualPaymentMethod,
                transaction_id,
                status
            });
            throw new Error('Missing required payment fields');
        }

        const [result] = await pool.execute(
            `INSERT INTO payments (booking_id, method, transaction_id, status, payment_data) 
             VALUES (?, ?, ?, ?, ?)`,
            [booking_id, actualPaymentMethod, transaction_id, status, payment_data]
        );
        return result.insertId;
    }

    // Get payment by ID
    static async getById(id) {
        const [rows] = await pool.execute(
            `SELECT p.*, b.booking_reference, b.total_price, b.user_id, b.payment_method as booking_payment_method,
                    e.title as event_title, u.name as user_name, u.email as user_email
             FROM payments p
             JOIN bookings b ON p.booking_id = b.id
             JOIN events e ON b.event_id = e.id
             JOIN users u ON b.user_id = u.id
             WHERE p.id = ?`,
            [id]
        );
        return rows[0];
    }

    static async getByTransactionId(transactionId) {
        const [rows] = await pool.execute(
            `SELECT * FROM payments WHERE transaction_id = ?`,
            [transactionId]
        );
        return rows[0];
    }

    // Get payments by booking
    static async getByBooking(bookingId) {
        const [rows] = await pool.execute(
            `SELECT p.* 
             FROM payments p
             WHERE p.booking_id = ?
             ORDER BY p.created_at DESC`,
            [bookingId]
        );
        return rows;
    }

    // Update payment status
    static async updateStatus(paymentId, status, transactionId = null) {
        let query = 'UPDATE payments SET status = ?';
        let params = [status];

        if (transactionId) {
            query += ', transaction_id = ?';
            params.push(transactionId);
        }

        query += ' WHERE id = ?';
        params.push(paymentId);

        const [result] = await pool.execute(query, params);
        return result.affectedRows > 0;
    }

    // Update payment status by booking ID
    static async updateStatusByBooking(bookingId, status, transactionId = null) {
        let query = 'UPDATE payments SET status = ?';
        let params = [status];

        if (transactionId) {
            query += ', transaction_id = ?';
            params.push(transactionId);
        }

        query += ' WHERE booking_id = ?';
        params.push(bookingId);

        const [result] = await pool.execute(query, params);
        return result.affectedRows > 0;
    }

    // ✅ ADD: Update booking's payment_method when payment is created
    static async updateBookingPaymentMethod(bookingId, paymentMethod) {
        const [result] = await pool.execute(
            'UPDATE bookings SET payment_method = ? WHERE id = ?',
            [paymentMethod, bookingId]
        );
        return result.affectedRows > 0;
    }

    // ✅ ADD: Get pending payments (for admin)
    static async getPendingPayments() {
        const [rows] = await pool.execute(
            `SELECT p.*, b.booking_reference, b.total_price, b.user_id, b.payment_method,
                    e.title as event_title, u.name as user_name, u.email as user_email
             FROM payments p
             JOIN bookings b ON p.booking_id = b.id
             JOIN events e ON b.event_id = e.id
             JOIN users u ON b.user_id = u.id
             WHERE p.status = 'pending'
             ORDER BY p.created_at DESC`
        );
        return rows;
    }

    // ✅ FIX: Get payments by method
    static async getByMethod(method) {
        const [rows] = await pool.execute(
            `SELECT p.*, b.booking_reference, b.total_price, b.payment_method
             FROM payments p
             JOIN bookings b ON p.booking_id = b.id
             WHERE p.method = ?
             ORDER BY p.created_at DESC`,
            [method]
        );
        return rows;
    }
}

module.exports = Payment;