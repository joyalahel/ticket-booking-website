const WaitingList = require('../models/WaitingList');
const Booking = require('../models/Booking');
const Event = require('../models/Event');
const EmailService = require('../services/emailService');

class WaitingListController {
    // Join waiting list
    static async joinWaitingList(req, res) {
        try {
            const { eventId } = req.params;
            const { quantity, notes } = req.body;
            const userId = req.user.id;

            const waitingListId = await WaitingList.join({
                user_id: userId,
                event_id: parseInt(eventId),
                quantity: quantity || 1,
                notes: notes || ''
            });

            const entry = await WaitingList.getUserWaitingListEntry(userId, eventId);

            // Send confirmation without blocking the response
            const event = await Event.getById(eventId);
            EmailService.sendWaitingListConfirmation(req.user, event, entry).catch(err => {
                console.error('Waiting list confirmation email failed:', err.message);
            });

            res.status(201).json({
                success: true,
                message: 'Added to waiting list',
                data: entry
            });

        } catch (error) {
            res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }

    // Convert waiting list to booking
    static async convertToBooking(req, res) {
        try {
            const { waitingListId } = req.params;
            const userId = req.user.id;

            const result = await Booking.createFromWaitingList(waitingListId, userId);

            res.json({
                success: true,
                message: 'Booking created from waiting list',
                data: result
            });

        } catch (error) {
            res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }

    // Get user's waiting list
    static async getUserWaitingList(req, res) {
        try {
            const userId = req.user.id;
            const waitingList = await WaitingList.getByUser(userId);

            res.json({
                success: true,
                data: waitingList
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // Leave waiting list
    static async leaveWaitingList(req, res) {
        try {
            const { waitingListId } = req.params;
            const userId = req.user.id;

            const success = await WaitingList.leave(waitingListId, userId);

            if (success) {
                res.json({
                    success: true,
                    message: 'Removed from waiting list'
                });
            } else {
                res.status(404).json({
                    success: false,
                    message: 'Waiting list entry not found'
                });
            }

        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // Get waiting list for event (organizer only)
    static async getEventWaitingList(req, res) {
        try {
            const { eventId } = req.params;
            const userId = req.user.id;

            // Verify user is organizer of this event
            const isOrganizer = await Event.isOrganizer(eventId, userId);
            if (!isOrganizer) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied. Only event organizer can view waiting list.'
                });
            }

            const waitingList = await WaitingList.getByEvent(eventId, userId);
            const stats = await WaitingList.getStats(eventId, userId);

            res.json({
                success: true,
                data: {
                    waiting_list: waitingList,
                    stats: stats
                }
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // Process waiting list manually (organizer)
    static async processWaitingList(req, res) {
        try {
            const { eventId } = req.params;
            const userId = req.user.id;

            // Verify user is organizer
            const isOrganizer = await Event.isOrganizer(eventId, userId);
            if (!isOrganizer) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied'
                });
            }

            const notifications = await WaitingList.processWaitingList(eventId);
            const event = await Event.getById(eventId);

            await Promise.all(
                notifications.map(async (notification) => {
                    const { waitingListEntry, ticketsAvailable } = notification;
                    const user = {
                        id: waitingListEntry.user_id,
                        name: waitingListEntry.user_name,
                        email: waitingListEntry.user_email
                    };

                    return EmailService.sendTicketsAvailableNotification(
                        user,
                        event,
                        waitingListEntry,
                        ticketsAvailable
                    ).catch(err => {
                        console.error('Waiting list ticket-available email failed:', err.message);
                    });
                })
            );

            res.json({
                success: true,
                message: `Processed waiting list - ${notifications.length} users notified`,
                data: notifications
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // Check waiting list status
    static async getWaitingListStatus(req, res) {
        try {
            const { eventId } = req.params;
            const userId = req.user.id;

            const entry = await WaitingList.getUserWaitingListEntry(userId, eventId);
            const availableTickets = await WaitingList.getAvailableTickets(eventId);

            res.json({
                success: true,
                data: {
                    on_waiting_list: !!entry,
                    waiting_list_entry: entry,
                    available_tickets: availableTickets,
                    can_join_waiting_list: availableTickets <= 0 && !entry
                }
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
}

module.exports = WaitingListController;
