// services/pdfService.js
const PDFDocument = require('pdfkit');
const QRService = require('./qrService');
const path = require('path');
const fs = require('fs');

class PDFService {
    // Generate a PDF with all tickets (one ticket per page)
    static async generateTicketsPDF(booking, event, user, individualTickets) {
        return new Promise(async (resolve, reject) => {
            try {
                const doc = new PDFDocument({
                    size: 'A4',
                    margin: 0,
                    layout: 'portrait'
                });

                const chunks = [];
                
                doc.on('data', (chunk) => chunks.push(chunk));
                doc.on('end', () => resolve(Buffer.concat(chunks)));
                doc.on('error', reject);

                // Generate each ticket on a separate page
                for (let i = 0; i < individualTickets.length; i++) {
                    if (i > 0) {
                        doc.addPage();
                    }

                    await this.generateTicketPage(doc, booking, event, user, individualTickets[i], i, individualTickets.length);
                }

                doc.end();

            } catch (error) {
                reject(error);
            }
        });
    }

    // Generate a single ticket page
    static async generateTicketPage(doc, booking, event, user, individualTicket, ticketIndex, totalTickets) {
        // --- 1. QR Code Generation ---
        const seatData = individualTicket.seat_id ? [{
            section_name: individualTicket.section_name,
            row_label: individualTicket.row_label,
            seat_number: individualTicket.seat_number,
            section_id: individualTicket.section_id
        }] : null;

        const qrContent = QRService.generateIndividualTicketQRContent(
            booking.id,
            event.id,
            user.id,
            individualTicket.ticket_index,
            booking.quantity,
            seatData
        );

        const qrCodeDataURL = await QRService.generateQRCodeDataURL(qrContent, 10);
        const qrCodeBuffer = Buffer.from(qrCodeDataURL.split(',')[1], 'base64');

        // --- 2. Layout Setup ---
        const PADDING = 30;
        const CONTENT_WIDTH = doc.page.width - 2 * PADDING;
        let yPosition = PADDING;

        // Background
        doc.fillColor('#ffffff')
           .rect(0, 0, doc.page.width, doc.page.height)
           .fill();
        
        // --- 3. Header/Logo Section ---
        const logoPath = path.join(__dirname, '..', '..', 'public', 'assets', 'logo', 'tazkirati-logo.png');
        if (fs.existsSync(logoPath)) {
            const LOGO_HEIGHT = 36;
            doc.image(logoPath, PADDING, yPosition, { height: LOGO_HEIGHT });
            yPosition += LOGO_HEIGHT + 10;
        } else {
            doc.fillColor('#e7005a')
               .fontSize(24)
               .font('Helvetica-Bold')
               .text('Tazkirati', PADDING, yPosition);
            yPosition += 40;
        }

        // --- 4. Event Image/Banner Section ---
        const IMAGE_HEIGHT = 200;
        
        console.log(`🖼️ Loading image for event: ${event.title}`);
        console.log(`   Image URL from DB: ${event.image_url}`);
        
        if (event.image_url) {
            try {
                // FIX: Handle both full paths and filenames correctly
                const imagePath = this.resolveImagePath(event.image_url);
                console.log(`   Resolved image path: ${imagePath}`);
                console.log(`   File exists: ${fs.existsSync(imagePath)}`);
                
                if (fs.existsSync(imagePath)) {
                    doc.image(imagePath, PADDING, yPosition, {
                        width: CONTENT_WIDTH,
                        height: IMAGE_HEIGHT,
                        fit: [CONTENT_WIDTH, IMAGE_HEIGHT],
                        align: 'center',
                        valign: 'center'
                    });
                    console.log(`✅ Successfully loaded image for ${event.title}`);
                } else {
                    console.log(`❌ Image not found at: ${imagePath}`);
                    this.drawImageFallback(doc, PADDING, yPosition, CONTENT_WIDTH, IMAGE_HEIGHT, event.title);
                }
            } catch (e) {
                console.error(`❌ Error loading image for ${event.title}:`, e.message);
                this.drawImageFallback(doc, PADDING, yPosition, CONTENT_WIDTH, IMAGE_HEIGHT, event.title);
            }
        } else {
            console.log(`ℹ️ No image for ${event.title}, using fallback`);
            this.drawImageFallback(doc, PADDING, yPosition, CONTENT_WIDTH, IMAGE_HEIGHT, event.title);
        }
        
        yPosition += IMAGE_HEIGHT + 20;

        // --- 5. Event Title and Details ---
        doc.fillColor('#000000')
           .fontSize(16)
           .font('Helvetica-Bold')
           .text(event.title, PADDING, yPosition);
        
        yPosition += 30;

        // --- 6. Main Content Area (Two Columns) ---
        const LEFT_COL_X = PADDING;
        const RIGHT_COL_X = doc.page.width / 2 + 10;
        let leftY = yPosition;
        let rightY = yPosition;

        // Left Column: Date, Time, Venue, Price, Section
        const eventDate = new Date(event.event_date);
        const formattedDate = eventDate.toLocaleDateString('en-US', { 
            weekday: 'short', 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
        const formattedTime = eventDate.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        // Date & Time
        doc.fillColor('#000000')
           .fontSize(12)
           .font('Helvetica-Bold')
           .text(`${formattedDate} at ${formattedTime}`, LEFT_COL_X, leftY);
        leftY += 15;
        
        // Venue
        doc.fillColor('#555555')
           .font('Helvetica')
           .text(event.venue, LEFT_COL_X, leftY);
        leftY += 15;
        doc.text('Beirut', LEFT_COL_X, leftY);
        leftY += 25;

        // Price / Ticket Type
        const ticketPrice = parseFloat(booking.total_price / booking.quantity).toFixed(2);
        const sectionName = individualTicket.section_name || 'General Admission';
        
        doc.fillColor('#000000')
           .font('Helvetica-Bold')
           .text(sectionName, LEFT_COL_X, leftY);
        leftY += 15;
        
        doc.fillColor('#e7005a')
           .font('Helvetica')
           .text(`$${ticketPrice}`, LEFT_COL_X, leftY);
        leftY += 25;

        // Seat/Section Info
        if (individualTicket.seat_id) {
            doc.fillColor('#555555')
               .font('Helvetica-Bold')
               .text('Section', LEFT_COL_X, leftY);
            leftY += 15;
            doc.font('Helvetica')
               .text(`${individualTicket.section_name} - Row ${individualTicket.row_label}, Seat ${individualTicket.seat_number}`, LEFT_COL_X, leftY);
            leftY += 25;
        }

        // Right Column: Ticket Holder, Numbers, QR Code
        doc.fillColor('#000000')
           .fontSize(12)
           .font('Helvetica-Bold')
           .text('Ticketholder', RIGHT_COL_X, rightY);
        rightY += 15;
        doc.fillColor('#555555')
           .font('Helvetica')
           .text(user.name, RIGHT_COL_X, rightY);
        rightY += 25;

        // Series Number
        doc.fillColor('#000000')
           .font('Helvetica-Bold')
           .text('Series Number', RIGHT_COL_X, rightY);
        rightY += 15;
        doc.fillColor('#555555')
           .font('Helvetica')
           .text(booking.id.toString().padStart(14, '0'), RIGHT_COL_X, rightY);
        rightY += 25;

        // Ticket Number
        doc.fillColor('#000000')
           .font('Helvetica-Bold')
           .text('Ticket Number', RIGHT_COL_X, rightY);
        rightY += 15;
        doc.fillColor('#555555')
           .font('Helvetica')
           .text(individualTicket.ticket_id, RIGHT_COL_X, rightY);
        rightY += 25;

        // Order Number
        doc.fillColor('#000000')
           .font('Helvetica-Bold')
           .text('Order', RIGHT_COL_X, rightY);
        rightY += 15;
        doc.fillColor('#555555')
           .font('Helvetica')
           .text(booking.booking_reference, RIGHT_COL_X, rightY);
        rightY += 25;

        // Merchant
        doc.fillColor('#000000')
           .font('Helvetica-Bold')
           .text('Merchant', RIGHT_COL_X, rightY);
        rightY += 15;
        doc.fillColor('#555555')
           .font('Helvetica')
           .text(event.organizer_name || 'Event Organizer', RIGHT_COL_X, rightY);
        rightY += 25;

        // QR Code
        const QR_SIZE = 100;
        const QR_X = doc.page.width - PADDING - QR_SIZE;
        const QR_Y = yPosition;
        
        doc.image(qrCodeBuffer, QR_X, QR_Y, { 
            width: QR_SIZE, 
            height: QR_SIZE 
        });
        
        yPosition = Math.max(leftY, rightY) + 20;

        // --- 7. Footer ---
        doc.strokeColor('#cccccc')
           .lineWidth(1)
           .moveTo(PADDING, yPosition)
           .lineTo(doc.page.width - PADDING, yPosition)
           .stroke();
        
        // --- 8. Page Indicator ---
        doc.fillColor('#95a5a6')
           .fontSize(8)
           .text(`Ticket ${individualTicket.ticket_index + 1} of ${totalTickets}`, 
                 doc.page.width - PADDING, doc.page.height - PADDING, {
                     align: 'right'
                 });
    }

    // NEW: Smart image path resolver
    static resolveImagePath(imageUrl) {
        if (!imageUrl) return null;
        
        // Remove leading slash if present
        const cleanUrl = imageUrl.startsWith('/') ? imageUrl.substring(1) : imageUrl;
        
        console.log(`   Cleaned URL: ${cleanUrl}`);
        
        // If the URL already contains "uploads/events", use it as is
        if (cleanUrl.includes('uploads/events/')) {
            return path.join(process.cwd(), cleanUrl);
        }
        
        // If it's just a filename, put it in uploads/events
        if (!cleanUrl.includes('/') && !cleanUrl.includes('\\')) {
            return path.join(process.cwd(), 'uploads', 'events', cleanUrl);
        }
        
        // Default: assume it's relative to project root
        return path.join(process.cwd(), cleanUrl);
    }

    static drawImageFallback(doc, x, y, width, height, title) {
        doc.fillColor('#e7005a')
           .rect(x, y, width, height)
           .fill();
        doc.fillColor('#ffffff')
           .fontSize(18)
           .text(title || 'Event Image', x, y + height / 2 - 10, {
               width: width,
               align: 'center'
           });
    }

    // Helper method to draw info boxes
    static drawInfoBox(doc, x, y, width, height, label, value) {
        // Box background
        doc.fillColor('#ffffff')
           .rect(x, y, width, height)
           .fill();
        
        doc.strokeColor('#e0e0e0')
           .rect(x, y, width, height)
           .stroke();

        // Label
        doc.fillColor('#7f8c8d')
           .fontSize(9)
           .font('Helvetica-Bold')
           .text(label, x + 15, y + 8);
        
        // Value
        doc.fillColor('#2c3e50')
           .fontSize(12)
           .font('Helvetica-Bold')
           .text(value, x + 15, y + 20);
    }

    // Generate individual PDF for each ticket
    static async generateIndividualTicketPDF(booking, event, user, individualTicket, ticketIndex, totalTickets) {
        return new Promise(async (resolve, reject) => {
            try {
                const doc = new PDFDocument({
                    size: 'A4',
                    margin: 0,
                    layout: 'portrait'
                });

                const chunks = [];
                
                doc.on('data', (chunk) => chunks.push(chunk));
                doc.on('end', () => resolve(Buffer.concat(chunks)));
                doc.on('error', reject);

                await this.generateTicketPage(doc, booking, event, user, individualTicket, ticketIndex, totalTickets);
                doc.end();

            } catch (error) {
                reject(error);
            }
        });
    }

    // Generate multiple individual PDFs - one for each ticket
    static async generateIndividualTicketsPDFs(booking, event, user, individualTickets) {
        const pdfBuffers = [];
        
        for (let i = 0; i < individualTickets.length; i++) {
            const pdfBuffer = await this.generateIndividualTicketPDF(
                booking, 
                event, 
                user, 
                individualTickets[i], 
                i, 
                individualTickets.length
            );
            pdfBuffers.push({
                ticketNumber: individualTickets[i].ticket_id,
                pdfBuffer: pdfBuffer,
                filename: `ticket-${individualTickets[i].ticket_id}.pdf`
            });
        }
        
        return pdfBuffers;
    }

    // Compact version for mobile
    static async generateCompactTicketsPDF(booking, event, user, individualTickets) {
        return new Promise(async (resolve, reject) => {
            try {
                const doc = new PDFDocument({
                    size: [400, 600],
                    margin: 20,
                    layout: 'portrait'
                });

                const chunks = [];
                
                doc.on('data', (chunk) => chunks.push(chunk));
                doc.on('end', () => resolve(Buffer.concat(chunks)));
                doc.on('error', reject);

                for (let i = 0; i < individualTickets.length; i++) {
                    if (i > 0) {
                        doc.addPage();
                    }

                    await this.generateCompactTicketPage(doc, booking, event, user, individualTickets[i], i, individualTickets.length);
                }

                doc.end();

            } catch (error) {
                reject(error);
            }
        });
    }

    // Compact ticket page
    static async generateCompactTicketPage(doc, booking, event, user, individualTicket, ticketIndex, totalTickets) {
        // Generate QR code
        const seatData = individualTicket.seat_id ? [{
            section_name: individualTicket.section_name,
            row_label: individualTicket.row_label,
            seat_number: individualTicket.seat_number,
            section_id: individualTicket.section_id
        }] : null;

        const qrContent = QRService.generateIndividualTicketQRContent(
            booking.id,
            event.id,
            user.id,
            ticketIndex,
            booking.quantity,
            seatData
        );

        const qrCodeDataURL = await QRService.generateQRCodeDataURL(qrContent);
        const qrCodeBuffer = Buffer.from(qrCodeDataURL.split(',')[1], 'base64');

        // Header with dark background
        doc.fillColor('#2c3e50')
           .rect(0, 0, doc.page.width, 80)
           .fill();
        
        doc.fillColor('#ffffff')
           .fontSize(16)
           .font('Helvetica-Bold')
           .text(event.title, 20, 25, {
               align: 'center',
               width: doc.page.width - 40
           });
        
        doc.fontSize(10)
           .text(`Ticket ${ticketIndex + 1}/${totalTickets}`, 20, 50, {
               align: 'center',
               width: doc.page.width - 40
           });

        let yPosition = 100;

        // QR Code
        doc.image(qrCodeBuffer, (doc.page.width - 150) / 2, yPosition, {
            width: 150,
            height: 150
        });

        yPosition += 160;

        // Ticket details in compact format
        const details = [
            { label: 'Ticket ID:', value: individualTicket.ticket_id },
            { label: 'Attendee:', value: user.name },
            { label: 'Date:', value: new Date(event.event_date).toLocaleDateString() },
            { label: 'Time:', value: new Date(event.event_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) },
            { label: 'Venue:', value: event.venue }
        ];

        if (individualTicket.section_name) {
            details.push({ 
                label: 'Seat:', 
                value: `${individualTicket.section_name} - Row ${individualTicket.row_label}, Seat ${individualTicket.seat_number}` 
            });
        }

        details.push({ label: 'Order:', value: booking.booking_reference });

        // Draw details
        details.forEach(detail => {
            doc.fillColor('#2c3e50')
               .fontSize(9)
               .font('Helvetica-Bold')
               .text(detail.label, 20, yPosition);
            
            doc.fillColor('#7f8c8d')
               .font('Helvetica')
               .text(detail.value, 80, yPosition, {
                   width: doc.page.width - 100
               });
            
            yPosition += 15;
        });

        // Footer note
        yPosition += 20;
        doc.fillColor('#95a5a6')
           .fontSize(8)
           .text('Present this ticket at entrance • Each ticket admits one person', 
                 20, yPosition, {
                     align: 'center',
                     width: doc.page.width - 40
                 });
    }
}

module.exports = PDFService;
