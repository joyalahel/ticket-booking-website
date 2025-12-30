const express = require('express');
const router = express.Router();
const WishlistController = require('../controllers/wishlistController');
const { authenticateToken } = require('../middleware/authMiddleware');

// Add to wishlist
router.post('/events/:eventId/wishlist', authenticateToken, WishlistController.addToWishlist);

// Remove from wishlist
router.delete('/wishlist/:wishlistId', authenticateToken, WishlistController.removeFromWishlist);
router.delete('/events/:eventId/wishlist', authenticateToken, WishlistController.removeFromWishlistByEvent);

// Get wishlist
router.get('/wishlist', authenticateToken, WishlistController.getWishlist);
router.get('/wishlist/with-availability', authenticateToken, WishlistController.getWishlistWithAvailability);

// Check if event is in wishlist
router.get('/events/:eventId/wishlist/check', authenticateToken, WishlistController.checkInWishlist);

// Toggle wishlist
router.post('/events/:eventId/wishlist/toggle', authenticateToken, WishlistController.toggleWishlist);

// Clear wishlist
router.delete('/wishlist', authenticateToken, WishlistController.clearWishlist);

// Get wishlist stats
router.get('/wishlist/stats', authenticateToken, WishlistController.getWishlistStats);

module.exports = router;