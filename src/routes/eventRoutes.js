const express = require('express');
const router = express.Router();
const EventController = require('../controllers/eventController');
const { authenticateToken, requireOrganizer } = require('../middleware/authMiddleware');
const { upload, handleUploadErrors } = require('../middleware/uploadMiddleware');

// Public routes
router.get('/', EventController.getAllEvents);
router.get('/search', EventController.searchEvents); // This MUST come before :id
router.get('/categories', EventController.getCategories);
router.get('/venues', EventController.getVenues);
router.get('/search/stats', EventController.getSearchStats);

// Protected routes
router.get('/organizer/my-events', authenticateToken, requireOrganizer, EventController.getMyEvents);

router.post('/', authenticateToken, requireOrganizer, upload.single('image'), handleUploadErrors, EventController.createEvent);
router.put('/:id', authenticateToken, requireOrganizer, upload.single('image'), handleUploadErrors, EventController.updateEvent);
router.delete('/:id/image', authenticateToken, requireOrganizer, EventController.deleteEventImage);
router.delete('/:id', authenticateToken, requireOrganizer, EventController.deleteEvent);
router.patch('/:id/restore', authenticateToken, requireOrganizer, EventController.restoreEvent);

// Dynamic route LAST
router.get('/:id', EventController.getEvent);

module.exports = router;
