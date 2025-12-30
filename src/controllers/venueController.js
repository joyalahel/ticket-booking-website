const Venue = require('../models/Venue');

class VenueController {
    // Get all venues
    static async getAllVenues(req, res) {
        try {
            const venues = await Venue.getAll();
            res.json({
                success: true,
                venues: venues
            });
        } catch (error) {
            console.error('Get venues error:', error);
            res.status(500).json({ 
                success: false,
                error: 'Failed to get venues' 
            });
        }
    }

    // Get venue by ID
    static async getVenue(req, res) {
        try {
            const venue = await Venue.getById(req.params.id);
            
            if (!venue) {
                return res.status(404).json({ 
                    success: false,
                    error: 'Venue not found' 
                });
            }

            res.json({
                success: true,
                venue: venue
            });

        } catch (error) {
            console.error('Get venue error:', error);
            res.status(500).json({ 
                success: false,
                error: 'Failed to get venue' 
            });
        }
    }

    // Get venue with full seating layout
    static async getVenueWithSeating(req, res) {
        try {
            const venue = await Venue.getVenueWithSeating(req.params.id);
            
            if (!venue) {
                return res.status(404).json({ 
                    success: false,
                    error: 'Venue not found' 
                });
            }

            res.json({
                success: true,
                venue: venue
            });

        } catch (error) {
            console.error('Get venue seating error:', error);
            res.status(500).json({ 
                success: false,
                error: 'Failed to get venue seating' 
            });
        }
    }

    // Create new venue
    static async createVenue(req, res) {
        try {
            const { name, address, capacity, layout_type, layout_config } = req.body;

            // Validation
            if (!name || !capacity) {
                return res.status(400).json({ 
                    success: false,
                    error: 'Name and capacity are required' 
                });
            }

            const venueId = await Venue.create({
                name,
                address,
                capacity,
                layout_type,
                layout_config
            });

            const venue = await Venue.getById(venueId);

            res.status(201).json({
                success: true,
                message: 'Venue created successfully',
                venue: venue
            });

        } catch (error) {
            console.error('Create venue error:', error);
            res.status(500).json({ 
                success: false,
                error: 'Failed to create venue' 
            });
        }
    }

    // Update venue
    static async updateVenue(req, res) {
        try {
            const { name, address, capacity, layout_type, layout_config } = req.body;

            const updated = await Venue.update(req.params.id, {
                name,
                address,
                capacity,
                layout_type,
                layout_config
            });

            if (!updated) {
                return res.status(404).json({ 
                    success: false,
                    error: 'Venue not found' 
                });
            }

            const venue = await Venue.getById(req.params.id);

            res.json({
                success: true,
                message: 'Venue updated successfully',
                venue: venue
            });

        } catch (error) {
            console.error('Update venue error:', error);
            res.status(500).json({ 
                success: false,
                error: 'Failed to update venue' 
            });
        }
    }

    // Update venue seating layout
    static async updateVenueSeating(req, res) {
        try {
            const { sections } = req.body;

            if (!sections || !Array.isArray(sections)) {
                return res.status(400).json({ 
                    success: false,
                    error: 'Sections array is required' 
                });
            }

            // You'll need to implement this method in your Venue model
            const updated = await Venue.updateSeatingLayout(req.params.id, sections);

            if (!updated) {
                return res.status(404).json({ 
                    success: false,
                    error: 'Venue not found or update failed' 
                });
            }

            const venue = await Venue.getVenueWithSeating(req.params.id);

            res.json({
                success: true,
                message: 'Venue seating layout updated successfully',
                venue: venue
            });

        } catch (error) {
            console.error('Update venue seating error:', error);
            const status = error.message?.toLowerCase().includes('capacity') ? 400 : 500;
            res.status(status).json({ 
                success: false,
                error: error.message || 'Failed to update venue seating' 
            });
        }
    }

    // Delete venue
    static async deleteVenue(req, res) {
        try {
            // You'll need to implement this method in your Venue model
            const deleted = await Venue.delete(req.params.id);

            if (!deleted) {
                return res.status(404).json({ 
                    success: false,
                    error: 'Venue not found' 
                });
            }

            res.json({
                success: true,
                message: 'Venue deleted successfully'
            });

        } catch (error) {
            console.error('Delete venue error:', error);
            res.status(500).json({ 
                success: false,
                error: 'Failed to delete venue' 
            });
        }
    }
}

module.exports = VenueController;
