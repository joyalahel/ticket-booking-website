const express = require('express');
const router = express.Router();
const ContactController = require('../controllers/contactController');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');

router.post('/contact', ContactController.submit);
router.get('/admin/inquiries', authenticateToken, requireAdmin, ContactController.list);

module.exports = router;
