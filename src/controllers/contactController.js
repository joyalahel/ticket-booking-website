const ContactInquiry = require('../models/ContactInquiry');

class ContactController {
    static async submit(req, res) {
        try {
            const { name, email, phone, country, address, event, message } = req.body || {};
            if (!name || !email || !message) {
                return res.status(400).json({ error: 'Name, email, and message are required' });
            }
            const id = await ContactInquiry.create({ name, email, phone, country, address, event, message });
            res.status(201).json({ success: true, inquiry_id: id });
        } catch (err) {
            console.error('Contact submit error:', err);
            res.status(500).json({ error: 'Could not submit inquiry' });
        }
    }

    static async list(req, res) {
        try {
            const inquiries = await ContactInquiry.list();
            res.json({ success: true, inquiries });
        } catch (err) {
            console.error('Contact list error:', err);
            res.status(500).json({ error: 'Could not load inquiries' });
        }
    }
}

module.exports = ContactController;
