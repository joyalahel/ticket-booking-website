const OrganizerRequest = require('../models/OrganizerRequest');

class OrganizerController {
    static async apply(req, res) {
        try {
            const userId = req.user.id;
            const { notes = '' } = req.body || {};
            const requestId = await OrganizerRequest.create(userId, notes);
            const request = await OrganizerRequest.getById(requestId);
            res.status(201).json({ success: true, request });
        } catch (err) {
            console.error('Organizer apply error:', err);
            res.status(400).json({ error: err.message || 'Could not submit request' });
        }
    }

    static async listPending(req, res) {
        try {
            const requests = await OrganizerRequest.getPending();
            res.json({ success: true, requests });
        } catch (err) {
            console.error('Organizer pending list error:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    static async decide(req, res) {
        try {
            const { requestId } = req.params;
            const { approve, admin_notes = '' } = req.body || {};
            if (typeof approve !== 'boolean') {
                return res.status(400).json({ error: 'approve must be boolean' });
            }
            const result = await OrganizerRequest.decide(requestId, approve, admin_notes);
            res.json({ success: true, request: result });
        } catch (err) {
            console.error('Organizer decide error:', err);
            res.status(400).json({ error: err.message || 'Could not process request' });
        }
    }
}

module.exports = OrganizerController;
