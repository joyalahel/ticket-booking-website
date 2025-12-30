const Wishlist = require('../models/Wishlist');
const Event = require('../models/Event');

class WishlistController {
    // Add event to wishlist
    static async addToWishlist(req, res) {
        try {
            const { eventId } = req.params;
            const userId = req.user.id;

            const wishlistId = await Wishlist.addToWishlist(userId, parseInt(eventId));

            res.status(201).json({
                success: true,
                message: 'Event added to wishlist',
                data: { wishlistId }
            });

        } catch (error) {
            res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }

    // Remove event from wishlist
    static async removeFromWishlist(req, res) {
        try {
            const { wishlistId } = req.params;
            const userId = req.user.id;

            const success = await Wishlist.removeFromWishlist(userId, wishlistId);

            if (success) {
                res.json({
                    success: true,
                    message: 'Event removed from wishlist'
                });
            } else {
                res.status(404).json({
                    success: false,
                    message: 'Wishlist item not found'
                });
            }

        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // Remove from wishlist by event ID
    static async removeFromWishlistByEvent(req, res) {
        try {
            const { eventId } = req.params;
            const userId = req.user.id;

            const success = await Wishlist.removeFromWishlistByEvent(userId, parseInt(eventId));

            if (success) {
                res.json({
                    success: true,
                    message: 'Event removed from wishlist'
                });
            } else {
                res.status(404).json({
                    success: false,
                    message: 'Event not found in wishlist'
                });
            }

        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // Get user's wishlist
    static async getWishlist(req, res) {
        try {
            const userId = req.user.id;
            const filters = req.query;

            const wishlist = await Wishlist.getByUser(userId, filters);
            const count = await Wishlist.getCount(userId);

            res.json({
                success: true,
                data: {
                    wishlist: wishlist,
                    total_count: count
                }
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // Get wishlist with availability status
    static async getWishlistWithAvailability(req, res) {
        try {
            const userId = req.user.id;

            const wishlist = await Wishlist.getWishlistWithAvailability(userId);

            res.json({
                success: true,
                data: wishlist
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // Check if event is in wishlist
    static async checkInWishlist(req, res) {
        try {
            const { eventId } = req.params;
            const userId = req.user.id;

            const isInWishlist = await Wishlist.isInWishlist(userId, parseInt(eventId));

            res.json({
                success: true,
                data: {
                    in_wishlist: isInWishlist
                }
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // Clear entire wishlist
    static async clearWishlist(req, res) {
        try {
            const userId = req.user.id;

            const deletedCount = await Wishlist.clearWishlist(userId);

            res.json({
                success: true,
                message: `Cleared ${deletedCount} items from wishlist`
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // Toggle wishlist status
    static async toggleWishlist(req, res) {
        try {
            const { eventId } = req.params;
            const userId = req.user.id;

            const isInWishlist = await Wishlist.isInWishlist(userId, parseInt(eventId));

            if (isInWishlist) {
                // Remove from wishlist
                await Wishlist.removeFromWishlistByEvent(userId, parseInt(eventId));
                res.json({
                    success: true,
                    message: 'Event removed from wishlist',
                    action: 'removed'
                });
            } else {
                // Add to wishlist
                const wishlistId = await Wishlist.addToWishlist(userId, parseInt(eventId));
                res.status(201).json({
                    success: true,
                    message: 'Event added to wishlist',
                    action: 'added',
                    data: { wishlistId }
                });
            }

        } catch (error) {
            res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }

    // Get wishlist stats
    static async getWishlistStats(req, res) {
        try {
            const userId = req.user.id;

            const wishlist = await Wishlist.getWishlistWithAvailability(userId);
            
            const stats = {
                total_items: wishlist.length,
                available_events: wishlist.filter(item => item.availability_status === 'available').length,
                limited_events: wishlist.filter(item => item.availability_status === 'limited').length,
                sold_out_events: wishlist.filter(item => item.availability_status === 'sold_out').length,
                categories: [...new Set(wishlist.map(item => item.category).filter(Boolean))],
                total_value: wishlist.reduce((sum, item) => sum + parseFloat(item.price), 0)
            };

            res.json({
                success: true,
                data: stats
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
}

module.exports = WishlistController;