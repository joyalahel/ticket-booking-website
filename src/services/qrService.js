const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs').promises;
const Event = require('../models/Event');
const Booking = require('../models/Booking');

class QRService {
    // Generate QR code as data URL (for direct embedding)
    static async generateQRCodeDataURL(text) {
        try {
            const qrCodeDataURL = await QRCode.toDataURL(text, {
                width: 300,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });
            return qrCodeDataURL;
        } catch (error) {
            console.error('QR Code generation error:', error);
            throw new Error('Failed to generate QR code');
        }
    }

    // Generate QR code as buffer (for saving as file)
    static async generateQRCodeBuffer(text) {
        try {
            const qrCodeBuffer = await QRCode.toBuffer(text, {
                width: 300,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });
            return qrCodeBuffer;
        } catch (error) {
            console.error('QR Code generation error:', error);
            throw new Error('Failed to generate QR code');
        }
    }

    // Generate ticket QR code content
static generateTicketQRContent(bookingId, eventId, userId, seatData = null) {
    const qrData = {
        type: 'event_ticket',
        bookingId: bookingId,
        eventId: eventId,
        userId: userId,
        timestamp: new Date().toISOString(),
        version: '2.0' // Seating feature version
    };

    // ✅ ADD seat information for seating feature
    if (seatData && seatData.length > 0) {
        qrData.seats = seatData.map(seat => ({
            section: seat.section_name,
            row: seat.row_label,
            seat: seat.seat_number,
            sectionId: seat.section_id
        }));
        console.log('🔍 [QR] Added seat data to QR code:', qrData.seats);
    }

    console.log('🔍 [QR] Generated QR content with seating:', qrData);
    return JSON.stringify(qrData);
}

    // Generate event info QR code content
    static generateEventQRContent(eventId) {
        return JSON.stringify({
            type: 'event_info',
            eventId: eventId,
            timestamp: new Date().toISOString()
        });
    }

    // Generate check-in QR code content (for organizers)
    static generateCheckinQRContent(eventId, secret) {
        return JSON.stringify({
            type: 'event_checkin',
            eventId: eventId,
            secret: secret, // For security
            timestamp: new Date().toISOString()
        });
    }

    // Update the existing validateQRContent method
    static validateQRContent(qrContent) {
        try {
            const data = JSON.parse(qrContent);
            
            // Validate required fields based on type
            switch (data.type) {
                case 'event_ticket':
                    return data.bookingId && data.eventId && data.userId;
                case 'individual_ticket': // Add this case
                    return data.bookingId && data.eventId && data.userId && data.ticketIndex !== undefined;
                case 'event_info':
                    return data.eventId;
                case 'event_checkin':
                    return data.eventId && data.secret;
                default:
                    return false;
            }
        } catch (error) {
            return false;
        }
    }
     // Generate unique QR code for individual ticket
    static generateIndividualTicketQRContent(bookingId, eventId, userId, ticketIndex, totalTickets, seatData = null) {
        const qrData = {
            type: 'individual_ticket',
            bookingId: bookingId,
            eventId: eventId,
            userId: userId,
            ticketIndex: ticketIndex,
            totalTickets: totalTickets,
            ticketId: `${bookingId}-${ticketIndex + 1}`, // Unique ticket ID
            timestamp: new Date().toISOString(),
            version: '2.0'
        };

        // Add seat information if available
        if (seatData && seatData.length > 0 && seatData[ticketIndex]) {
            qrData.seat = {
                section: seatData[ticketIndex].section_name,
                row: seatData[ticketIndex].row_label,
                seat: seatData[ticketIndex].seat_number,
                sectionId: seatData[ticketIndex].section_id
            };
            console.log('🔍 [QR] Added seat data to individual ticket:', qrData.seat);
        }

        console.log('🔍 [QR] Generated individual QR content:', qrData);
        return JSON.stringify(qrData);
    }

    // Validate individual ticket QR
    static validateIndividualTicketQR(qrContent) {
        try {
            const data = JSON.parse(qrContent);
            return data.type === 'individual_ticket' && 
                   data.bookingId && 
                   data.eventId && 
                   data.userId &&
                   data.ticketIndex !== undefined;
        } catch (error) {
            return false;
        }
    }
}

module.exports = QRService;