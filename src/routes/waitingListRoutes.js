const express = require('express');
const router = express.Router();
const WaitingListController = require('../controllers/waitingListController');
const { authenticateToken  } = require('../middleware/authMiddleware');

// User routes
router.post('/events/:eventId/waiting-list', authenticateToken, WaitingListController.joinWaitingList);
router.get('/waiting-list/my-entries', authenticateToken, WaitingListController.getUserWaitingList);
router.get('/events/:eventId/waiting-list/status', authenticateToken, WaitingListController.getWaitingListStatus);
router.delete('/waiting-list/:waitingListId', authenticateToken, WaitingListController.leaveWaitingList);
router.post('/waiting-list/:waitingListId/convert', authenticateToken, WaitingListController.convertToBooking);

// Organizer routes
router.get('/events/:eventId/waiting-list', authenticateToken, WaitingListController.getEventWaitingList);
router.post('/events/:eventId/waiting-list/process', authenticateToken, WaitingListController.processWaitingList);

module.exports = router;