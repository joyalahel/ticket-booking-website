const QRService = require('../services/qrService');
const Booking = require('../models/Booking');
const Event = require('../models/Event');

class QRController {
    // Generate QR code for a ticket
    static async generateTicketQR(req, res) {
        try {
            const { bookingId } = req.params;
            const userId = req.user.id;

            // Get booking details
            const booking = await Booking.getById(bookingId);
            if (!booking) {
                return res.status(404).json({ error: 'Booking not found' });
            }

            // Verify user owns this booking
            if (booking.user_id !== userId && !req.user.isAdmin) {
                return res.status(403).json({ error: 'Not authorized to access this ticket' });
            }

            // Generate QR code content
            const qrContent = QRService.generateTicketQRContent(
                bookingId,
                booking.event_id,
                booking.user_id
            );

            // Generate QR code as data URL
            const qrCodeDataURL = await QRService.generateQRCodeDataURL(qrContent);

            res.json({
                success: true,
                qrCode: qrCodeDataURL,
                booking: {
                    id: booking.id,
                    event_title: booking.event_title,
                    event_date: booking.event_date,
                    venue: booking.venue,
                    quantity: booking.quantity,
                    user_name: booking.user_name
                }
            });

        } catch (error) {
            console.error('Generate ticket QR error:', error);
            res.status(500).json({ error: 'Failed to generate QR code' });
        }
    }

    // Generate QR code for event information
    static async generateEventQR(req, res) {
        try {
            const { eventId } = req.params;

            // Get event details
            const event = await Event.getById(eventId);
            if (!event) {
                return res.status(404).json({ error: 'Event not found' });
            }

            // Generate QR code content
            const qrContent = QRService.generateEventQRContent(eventId);

            // Generate QR code as data URL
            const qrCodeDataURL = await QRService.generateQRCodeDataURL(qrContent);

            res.json({
                success: true,
                qrCode: qrCodeDataURL,
                event: {
                    id: event.id,
                    title: event.title,
                    venue: event.venue,
                    event_date: event.event_date
                }
            });

        } catch (error) {
            console.error('Generate event QR error:', error);
            res.status(500).json({ error: 'Failed to generate QR code' });
        }
    }

    // Generate check-in QR code (organizer only)
    static async generateCheckinQR(req, res) {
        try {
            const { eventId } = req.params;
            const userId = req.user.id;

            // Verify user is event organizer
            const isOrganizer = await Event.isOrganizer(eventId, userId);
            if (!isOrganizer && !req.user.isAdmin) {
                return res.status(403).json({ error: 'Not authorized to generate check-in QR' });
            }

            // Generate secure secret for this check-in session
            const secret = Math.random().toString(36).substring(2, 15) + 
                          Math.random().toString(36).substring(2, 15);

            // Generate QR code content
            const qrContent = QRService.generateCheckinQRContent(eventId, secret);

            // Generate QR code as data URL
            const qrCodeDataURL = await QRService.generateQRCodeDataURL(qrContent);

            res.json({
                success: true,
                qrCode: qrCodeDataURL,
                secret: secret, // Store this securely in your session
                eventId: eventId
            });

        } catch (error) {
            console.error('Generate check-in QR error:', error);
            res.status(500).json({ error: 'Failed to generate check-in QR code' });
        }
    }

    // Update the main QR scan processor
    static async processQRScan(req, res) {
        try {
            const { qrContent } = req.body;

            if (!qrContent) {
                return res.status(400).json({ error: 'QR content is required' });
            }

            // Validate QR content
            if (!QRService.validateQRContent(qrContent)) {
                return res.status(400).json({ error: 'Invalid QR code' });
            }

            const data = JSON.parse(qrContent);

            switch (data.type) {
                case 'event_ticket':
                    return await QRController.processTicketScan(req, res, data);
                case 'individual_ticket': // Add this case
                    return await QRController.processIndividualTicketScan(req, res, data);
                case 'event_info':
                    return await QRController.processEventInfoScan(req, res, data);
                case 'event_checkin':
                    return await QRController.processCheckinScan(req, res, data);
                default:
                    return res.status(400).json({ error: 'Unknown QR code type' });
            }

        } catch (error) {
            console.error('Process QR scan error:', error);
            res.status(500).json({ error: 'Failed to process QR code' });
        }
    }

    // Mark individual ticket as used
    static async checkInIndividualTicket(req, res) {
        try {
            const { bookingId, ticketIndex } = req.params;
            const userId = req.user.id;

            // Get booking to verify event
            const booking = await Booking.getById(bookingId);
            if (!booking) {
                return res.status(404).json({ error: 'Booking not found' });
            }

            // Verify user is event organizer
            const isOrganizer = await Event.isOrganizer(booking.event_id, userId);
            if (!isOrganizer && !req.user.isAdmin) {
                return res.status(403).json({ error: 'Not authorized to check in tickets' });
            }

            // Validate ticket index
            if (ticketIndex < 0 || ticketIndex >= booking.quantity) {
                return res.status(400).json({ error: 'Invalid ticket index' });
            }

            // Check if already used
            if (await Booking.isIndividualTicketUsed(bookingId, ticketIndex)) {
                return res.status(400).json({ 
                    error: `Ticket ${bookingId}-${parseInt(ticketIndex) + 1} already checked in` 
                });
            }

            // Mark individual ticket as used
            await Booking.markIndividualTicketAsUsed(bookingId, ticketIndex);

            // Get individual ticket details for response
            const individualTicket = await Booking.getIndividualTicket(bookingId, parseInt(ticketIndex));

            res.json({
                success: true,
                message: `Ticket ${individualTicket.ticket_id} checked in successfully`,
                ticket: {
                    ticketId: individualTicket.ticket_id,
                    ticketIndex: parseInt(ticketIndex),
                    bookingId: booking.id,
                    event_title: booking.event_title,
                    user_name: booking.user_name,
                    checked_in_at: new Date().toISOString(),
                    seat: individualTicket.seat_id ? {
                        section: individualTicket.section_name,
                        row: individualTicket.row_label,
                        seat: individualTicket.seat_number
                    } : null
                }
            });

        } catch (error) {
            console.error('Check-in individual ticket error:', error);
            res.status(500).json({ error: 'Failed to check in ticket' });
        }
    }

    static async processTicketScan(req, res, data) {
        const { bookingId, eventId, userId } = data;

        // Get booking details
        const booking = await Booking.getById(bookingId);
        if (!booking) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        // Check if ticket is already used
        if (await Booking.isTicketUsed(bookingId)) {
            return res.status(400).json({ error: 'Ticket already used' });
        }

        res.json({
            success: true,
            type: 'ticket',
            booking: {
                id: booking.id,
                event_title: booking.event_title,
                user_name: booking.user_name,
                quantity: booking.quantity,
                is_used: booking.is_used
            },
            action: 'validate_ticket'
        });
    }
    // Admin-only QR validator (no check-in side effects)
    static async adminVerifyScan(req, res) {
        try {
            const { qrContent, markUsed = true } = req.body;
            if (!qrContent) {
                return res.status(400).json({ error: 'QR content is required' });
            }
            if (!QRService.validateQRContent(qrContent)) {
                return res.status(400).json({ error: 'Invalid QR code' });
            }

            const data = JSON.parse(qrContent);
            const { type } = data;

            // helper to build common response
            const buildResponse = ({ approved, reason = null, meta = {} }) => res.json({
                success: true,
                approved,
                reason,
                type,
                ...meta
            });

            if (type === 'individual_ticket') {
                const { bookingId, eventId, ticketIndex, ticketId } = data;
                const booking = await Booking.getById(bookingId);
                if (!booking) return res.status(404).json({ error: 'Ticket not found' });

                const ticket = await Booking.getIndividualTicket(bookingId, ticketIndex);
                if (!ticket) return res.status(404).json({ error: 'Individual ticket not found' });

                const isUsed = await Booking.isIndividualTicketUsed(bookingId, ticketIndex);
                const isPaid = booking.payment_status === 'paid';
                const isCancelled = booking.booking_status === 'cancelled';
                const approved = isPaid && !isCancelled && !isUsed;

                if (approved && markUsed) {
                    await Booking.markIndividualTicketAsUsed(bookingId, ticketIndex);
                }

                return buildResponse({
                    approved,
                    reason: approved ? null : isUsed ? 'Ticket already used' : isCancelled ? 'Booking cancelled' : 'Payment not completed',
                    meta: {
                        booking: {
                            id: booking.id,
                            event_id: booking.event_id,
                            status: booking.booking_status,
                            payment_status: booking.payment_status
                        },
                        ticket: {
                            ticketId,
                            ticketIndex,
                            is_used: isUsed,
                            seat: ticket.seat_id ? {
                                section: ticket.section_name,
                                row: ticket.row_label,
                                seat: ticket.seat_number
                            } : null
                        }
                    }
                });
            }

            if (type === 'event_ticket') {
                const { bookingId } = data;
                const booking = await Booking.getById(bookingId);
                if (!booking) return res.status(404).json({ error: 'Ticket not found' });
                const isUsed = await Booking.isTicketUsed(bookingId);
                const isPaid = booking.payment_status === 'paid';
                const isCancelled = booking.booking_status === 'cancelled';
                const approved = isPaid && !isCancelled && !isUsed;

                if (approved && markUsed) {
                    await Booking.markAsUsed(bookingId);
                }

                return buildResponse({
                    approved,
                    reason: approved ? null : isUsed ? 'Ticket already used' : isCancelled ? 'Booking cancelled' : 'Payment not completed',
                    meta: {
                        booking: {
                            id: booking.id,
                            event_id: booking.event_id,
                            status: booking.booking_status,
                            payment_status: booking.payment_status,
                            quantity: booking.quantity
                        }
                    }
                });
            }

            return res.status(400).json({ error: 'Unsupported QR type for admin verification' });
        } catch (error) {
            console.error('Admin QR verify error:', error);
            res.status(500).json({ error: 'Failed to verify QR code' });
        }
    }

    static async processEventInfoScan(req, res, data) {
        const { eventId } = data;

        // Get event details
        const event = await Event.getById(eventId);
        if (!event) {
            return res.status(404).json({ error: 'Event not found' });
        }

        res.json({
            success: true,
            type: 'event_info',
            event: {
                id: event.id,
                title: event.title,
                description: event.description,
                venue: event.venue,
                event_date: event.event_date,
                price: event.price,
                available_tickets: event.available_tickets
            },
            action: 'show_event_info'
        });
    }

    static async processCheckinScan(req, res, data) {
        const { eventId, secret } = data;
        const userId = req.user.id;

        // Verify user is event organizer
        const isOrganizer = await Event.isOrganizer(eventId, userId);
        if (!isOrganizer && !req.user.isAdmin) {
            return res.status(403).json({ error: 'Not authorized to check in tickets' });
        }

        // Here you would validate the secret against your session
        // For now, we'll just return success

        res.json({
            success: true,
            type: 'checkin',
            eventId: eventId,
            action: 'open_checkin_interface'
        });
    }

    // Mark ticket as used (check-in)
    static async checkInTicket(req, res) {
        try {
            const { bookingId } = req.params;
            const userId = req.user.id;

            // Get booking to verify event
            const booking = await Booking.getById(bookingId);
            if (!booking) {
                return res.status(404).json({ error: 'Booking not found' });
            }

            // Verify user is event organizer
            const isOrganizer = await Event.isOrganizer(booking.event_id, userId);
            if (!isOrganizer && !req.user.isAdmin) {
                return res.status(403).json({ error: 'Not authorized to check in tickets' });
            }

            // Check if already used
            if (await Booking.isTicketUsed(bookingId)) {
                return res.status(400).json({ error: 'Ticket already checked in' });
            }

            // Mark as used
            await Booking.markAsUsed(bookingId);

            res.json({
                success: true,
                message: 'Ticket checked in successfully',
                booking: {
                    id: booking.id,
                    event_title: booking.event_title,
                    user_name: booking.user_name,
                    checked_in_at: new Date().toISOString()
                }
            });

        } catch (error) {
            console.error('Check-in ticket error:', error);
            res.status(500).json({ error: 'Failed to check in ticket' });
        }
    }
    static async generateIndividualTicketQR(req, res) {
        try {
            const { bookingId, ticketIndex } = req.params;
            const userId = req.user.id;

            // Get booking details
            const booking = await Booking.getById(bookingId);
            if (!booking) {
                return res.status(404).json({ error: 'Booking not found' });
            }

            // Verify user owns this booking
            if (booking.user_id !== userId && !req.user.isAdmin) {
                return res.status(403).json({ error: 'Not authorized to access this ticket' });
            }

            // Validate ticket index
            if (ticketIndex < 0 || ticketIndex >= booking.quantity) {
                return res.status(400).json({ error: 'Invalid ticket index' });
            }

            // Get individual ticket details
            const individualTicket = await Booking.getIndividualTicket(bookingId, parseInt(ticketIndex));
            if (!individualTicket) {
                return res.status(404).json({ error: 'Ticket not found' });
            }

            // Prepare seat data for QR
            const seatData = individualTicket.seat_id ? [{
                section_name: individualTicket.section_name,
                row_label: individualTicket.row_label,
                seat_number: individualTicket.seat_number,
                section_id: individualTicket.section_id
            }] : null;

            // Generate individual QR code content
            const qrContent = QRService.generateIndividualTicketQRContent(
                bookingId,
                booking.event_id,
                booking.user_id,
                parseInt(ticketIndex),
                booking.quantity,
                seatData
            );

            // Generate QR code as data URL
            const qrCodeDataURL = await QRService.generateQRCodeDataURL(qrContent);

            res.json({
                success: true,
                qrCode: qrCodeDataURL,
                ticket: {
                    bookingId: booking.id,
                    ticketIndex: parseInt(ticketIndex),
                    ticketId: individualTicket.ticket_id,
                    event_title: booking.event_title,
                    event_date: booking.event_date,
                    venue: booking.venue,
                    user_name: booking.user_name,
                    seat: seatData ? seatData[0] : null,
                    status: individualTicket.status
                }
            });

        } catch (error) {
            console.error('Generate individual ticket QR error:', error);
            res.status(500).json({ error: 'Failed to generate QR code' });
        }
    }

    // Generate all QR codes for a booking
    static async generateAllTicketQRs(req, res) {
        try {
            const { bookingId } = req.params;
            const userId = req.user.id;

            // Get booking details
            const booking = await Booking.getById(bookingId);
            if (!booking) {
                return res.status(404).json({ error: 'Booking not found' });
            }

            // Verify user owns this booking
            if (booking.user_id !== userId && !req.user.isAdmin) {
                return res.status(403).json({ error: 'Not authorized to access these tickets' });
            }

            // Generate QR codes for all tickets
            const qrCodes = [];
            for (let i = 0; i < booking.quantity; i++) {
                const individualTicket = await Booking.getIndividualTicket(bookingId, i);
                
                if (individualTicket) {
                    const seatData = individualTicket.seat_id ? [{
                        section_name: individualTicket.section_name,
                        row_label: individualTicket.row_label,
                        seat_number: individualTicket.seat_number,
                        section_id: individualTicket.section_id
                    }] : null;

                    const qrContent = QRService.generateIndividualTicketQRContent(
                        bookingId,
                        booking.event_id,
                        booking.user_id,
                        i,
                        booking.quantity,
                        seatData
                    );

                    const qrCodeDataURL = await QRService.generateQRCodeDataURL(qrContent);
                    
                    qrCodes.push({
                        ticketIndex: i,
                        ticketId: individualTicket.ticket_id,
                        qrCode: qrCodeDataURL,
                        isUsed: individualTicket.status === 'used',
                        seat: seatData ? seatData[0] : null
                    });
                }
            }

            res.json({
                success: true,
                qrCodes: qrCodes,
                booking: {
                    id: booking.id,
                    event_title: booking.event_title,
                    event_date: booking.event_date,
                    venue: booking.venue,
                    quantity: booking.quantity,
                    user_name: booking.user_name
                }
            });

        } catch (error) {
            console.error('Generate all ticket QR error:', error);
            res.status(500).json({ error: 'Failed to generate QR codes' });
        }
    }

    // Process individual ticket scan
    static async processIndividualTicketScan(req, res, data) {
        const { bookingId, eventId, userId, ticketIndex, ticketId } = data;

        // Get booking details
        const booking = await Booking.getById(bookingId);
        if (!booking) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        // Get individual ticket details
        const individualTicket = await Booking.getIndividualTicket(bookingId, ticketIndex);
        if (!individualTicket) {
            return res.status(404).json({ error: 'Individual ticket not found' });
        }

        // Check if this specific ticket is already used
        if (await Booking.isIndividualTicketUsed(bookingId, ticketIndex)) {
            return res.status(400).json({ 
                error: `Ticket ${ticketId} already used`,
                ticketId: ticketId
            });
        }

        res.json({
            success: true,
            type: 'individual_ticket',
            ticket: {
                ticketId: ticketId,
                ticketIndex: ticketIndex,
                bookingId: booking.id,
                event_title: booking.event_title,
                user_name: booking.user_name,
                is_used: false,
                seat: individualTicket.seat_id ? {
                    section: individualTicket.section_name,
                    row: individualTicket.row_label,
                    seat: individualTicket.seat_number
                } : null
            },
            action: 'validate_individual_ticket'
        });
    }
}

module.exports = QRController;
