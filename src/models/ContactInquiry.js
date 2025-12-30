const pool = require('../config/database');

class ContactInquiry {
    static async create(data) {
        const { name, email, phone, country, address, event, message } = data;
        const [result] = await pool.execute(
            `INSERT INTO inquiries (name, email, phone, country, address, event, message)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                name || null,
                email || null,
                phone || null,
                country || null,
                address || null,
                event || null,
                message || null
            ]
        );
        return result.insertId;
    }

    static async list() {
        const [rows] = await pool.execute(
            `SELECT * FROM inquiries ORDER BY created_at DESC`
        );
        return rows;
    }
}

module.exports = ContactInquiry;
