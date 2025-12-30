const express = require('express');
const router = express.Router();
const VenueController = require('../controllers/venueController');
const { authenticateToken, requireOrganizer } = require('../middleware/authMiddleware');

// Public routes
router.get('/', VenueController.getAllVenues);
router.get('/:id', VenueController.getVenue);

// Organizer only routes
router.post('/', authenticateToken, requireOrganizer, VenueController.createVenue);
router.put('/:id', authenticateToken, requireOrganizer, VenueController.updateVenue);
router.delete('/:id', authenticateToken, requireOrganizer, VenueController.deleteVenue);

// Seating layout routes
router.get('/:id/seating', VenueController.getVenueWithSeating);
router.post('/:id/layout', authenticateToken, requireOrganizer, VenueController.updateVenueSeating);

module.exports = router;