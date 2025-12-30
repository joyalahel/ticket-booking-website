const { Resend } = require("resend");
const PDFService = require("./pdfService");

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.FROM_EMAIL || "Tazkirati <onboarding@resend.dev>";

// generic helper to send any email
async function sendEmail({ to, subject, html, attachments = [] }) {
    try {
        const data = await resend.emails.send({
            from: FROM_EMAIL,
            to,
            subject,
            html,
            attachments
        });

        console.log("✅ Email sent:", data.id);
        return true;
    } catch (error) {
        console.error("❌ Email failed:", error);
        return false;
    }
}



class EmailService {
    // Send account creation confirmation
    static async sendAccountConfirmation(user) {
        const html = `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
                    <div style="background: #2563eb; color: white; padding: 30px; text-align: center;">
                        <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Welcome to Tazkirati</h1>
                        <p style="margin: 10px 0 0 0; opacity: 0.9;">Your account has been created successfully</p>
                    </div>
                    
                    <div style="padding: 30px;">
                        <p>Hello <strong>${user.name}</strong>,</p>
                        
                        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; border-left: 4px solid #2563eb; margin: 20px 0;">
                            <h3 style="margin: 0 0 15px 0; color: #1e293b;">Account Information</h3>
                            <p style="margin: 8px 0;"><strong>Name:</strong> ${user.name}</p>
                            <p style="margin: 8px 0;"><strong>Email:</strong> ${user.email}</p>
                            <p style="margin: 8px 0;"><strong>Account Created:</strong> ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                        </div>
                        
                        <div style="margin: 25px 0;">
                            <h3 style="color: #1e293b; margin-bottom: 15px;">Get Started</h3>
                            <ul style="margin: 0; padding-left: 20px;">
                                <li style="margin: 8px 0;">Browse and discover amazing events</li>
                                <li style="margin: 8px 0;">Book tickets for your favorite events</li>
                                <li style="margin: 8px 0;">Manage your bookings easily</li>
                                <li style="margin: 8px 0;">Receive event reminders and updates</li>
                            </ul>
                        </div>
                    </div>
                    
                    <div style="background: #f1f5f9; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                        <p style="margin: 0 0 10px 0; font-weight: 600;">Thank you for joining Tazkirati!</p>
                        <p style="margin: 0; font-size: 14px; color: #64748b;">Need assistance? Contact us at infotazkirati@gmail.com</p>
                    </div>
                </div>
            `
        ;

        console.log(`📧 Attempting to send account confirmation to: ${user.email}`);
    return await sendEmail({
        to: user.email,
        subject: 'Welcome to Tazkirati - Account Created Successfully',
        html
    });
    }

    // Send booking confirmation (pending payment)
    static async sendBookingConfirmation(booking, user, event) {
        const html = `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
                    <div style="background: #059669; color: white; padding: 30px; text-align: center;">
                        <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Booking Confirmed</h1>
                        <p style="margin: 10px 0 0 0; opacity: 0.9;">Your booking has been received</p>
                    </div>
                    
                    <div style="padding: 30px;">
                        <p>Hello <strong>${user.name}</strong>,</p>
                        
                        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <h3 style="margin: 0 0 15px 0; color: #1e293b;">Event Details</h3>
                            <p style="margin: 8px 0;"><strong>Event:</strong> ${event.title}</p>
                            <p style="margin: 8px 0;"><strong>Venue:</strong> ${event.venue}</p>
                            <p style="margin: 8px 0;"><strong>Date:</strong> ${new Date(event.event_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                            <p style="margin: 8px 0;"><strong>Time:</strong> ${new Date(event.event_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
                            <p style="margin: 8px 0;"><strong>Tickets Reserved:</strong> ${booking.quantity}</p>
                            <p style="margin: 8px 0;"><strong>Total Amount:</strong> $${parseFloat(booking.total_price).toFixed(2)}</p>
                        </div>
                        
                        <div style="background: #fffbeb; padding: 20px; border-radius: 8px; border-left: 4px solid #d97706; margin: 20px 0;">
                            <h3 style="margin: 0 0 10px 0; color: #92400e;">Payment Required</h3>
                            <p style="margin: 8px 0;">You have 24 hours to complete your payment to confirm your tickets.</p>
                            <p style="margin: 8px 0; font-weight: 600;">If payment is not received within 24 hours, your booking will be automatically cancelled.</p>
                        </div>
                        
                        <div style="background: #dbeafe; padding: 15px; border-radius: 6px; margin: 20px 0;">
                            <p style="margin: 0; font-weight: 600;">Booking Reference: <span style="font-family: monospace; background: #1e40af; color: white; padding: 4px 8px; border-radius: 4px;">${booking.booking_reference}</span></p>
                            <p style="margin: 8px 0 0 0; font-size: 14px;">Please keep this reference for your records and use it when making payment.</p>
                        </div>
                    </div>
                    
                    <div style="background: #f1f5f9; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                        <p style="margin: 0 0 10px 0; font-weight: 600;">Thank you for using Tazkirati</p>
                        <p style="margin: 0; font-size: 14px; color: #64748b;">Need help? Contact us at infotazkirati@gmail.com</p>
                    </div>
                </div>
            `
        ;

        console.log(`📧 Attempting to send account confirmation to: ${user.email}`);
    return await sendEmail({
        to: user.email,
        subject: `Booking Confirmation - ${event.title}`,
        html
    });
    }

     static async sendBookingConfirmationWithPDF(emailData) {
        try {
            const { booking, user, event, individualTickets } = emailData;

                        // ✅ FIX: Generate individual PDFs for each ticket
            const individualPDFs = await PDFService.generateIndividualTicketsPDFs(booking, event, user, individualTickets);

            const attachments = individualPDFs.map(pdf => ({
    filename: pdf.filename,
    content: pdf.pdfBuffer.toString("base64"),
    type: "application/pdf",
}));


            const html = `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
                    <div style="background: #059669; color: white; padding: 30px; text-align: center;">
                        <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Tickets Confirmed! 🎉</h1>
                        <p style="margin: 10px 0 0 0; opacity: 0.9;">Your ${individualTickets.length} tickets are ready</p>
                    </div>
                    
                    <div style="padding: 30px;">
                        <h2 style="color: #1e293b; margin-bottom: 5px;">Hello ${user.name},</h2>
                        <p style="margin-bottom: 20px;">Your booking has been confirmed! Your ${individualTickets.length} digital tickets are attached to this email as a PDF.</p>
                        
                        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <h3 style="margin: 0 0 15px 0; color: #1e293b;">Booking Summary</h3>
                            <p style="margin: 8px 0;"><strong>Event:</strong> ${event.title}</p>
                            <p style="margin: 8px 0;"><strong>Date:</strong> ${new Date(event.event_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                            <p style="margin: 8px 0;"><strong>Time:</strong> ${new Date(event.event_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
                            <p style="margin: 8px 0;"><strong>Venue:</strong> ${event.venue}</p>
                            <p style="margin: 8px 0;"><strong>Total Tickets:</strong> ${individualTickets.length}</p>
                            <p style="margin: 8px 0;"><strong>Total Paid:</strong> $${parseFloat(booking.total_price).toFixed(2)}</p>
                            <p style="margin: 8px 0;"><strong>Booking Reference:</strong> 
                                <span style="font-family: monospace; background: #1e40af; color: white; padding: 4px 8px; border-radius: 4px;">
                                    ${booking.booking_reference}
                                </span>
                            </p>
                        </div>
                        
                        <div style="background: #dbeafe; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
                            <h4 style="color: #1e40af; margin: 0 0 15px 0;">📎 Your Tickets Are Attached</h4>
                            <p style="margin: 0;">Download the ${individualTickets.length} PDF files to access all your tickets</p>
                            <p style="margin: 5px 0 0 0; font-size: 14px; color: #64748b;">Each PDF contains one individual ticket with a unique QR code.</p>
                        </div>
                        
                        <div style="background: #fffbeb; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <h4 style="color: #92400e; margin: 0 0 15px 0;">📋 Important Instructions</h4>
                            <ul style="margin: 0; padding-left: 20px;">
                                <li style="margin: 8px 0;"><strong>Each ticket has a unique QR code</strong> - they cannot be shared or reused</li>
                                <li style="margin: 8px 0;"><strong>Print the PDF</strong> or show on your mobile device at the entrance</li>
                                <li style="margin: 8px 0;"><strong>Each QR code scans only once</strong> - prevent unauthorized sharing</li>
                                <li style="margin: 8px 0;"><strong>Arrive 30 minutes early</strong> to allow time for entry processing</li>
                                <li style="margin: 8px 0;"><strong>Bring valid ID</strong> that matches the booking name</li>
                            </ul>
                        </div>

                        <div style="background: #f0f9ff; padding: 15px; border-radius: 6px; margin: 20px 0;">
                            <h4 style="color: #075985; margin: 0 0 10px 0;">🎫 Ticket Details</h4>
                            <p style="margin: 5px 0;">Your PDF contains the following tickets:</p>
                            <ul style="margin: 10px 0; padding-left: 20px;">
                                ${individualTickets.map(ticket => `
                                    <li style="margin: 4px 0;">
                                        <strong>${ticket.ticket_id}</strong>
                                        ${ticket.seat_id ? `- ${ticket.section_name}, Row ${ticket.row_label}, Seat ${ticket.seat_number}` : ''}
                                    </li>
                                `).join('')}
                            </ul>
                        </div>
                        
                        <div style="text-align: center; margin: 25px 0;">
                            <div style="background: #dcfce7; display: inline-block; padding: 15px 25px; border-radius: 8px;">
                                <p style="margin: 0; font-weight: 600; color: #166534;">✅ Your tickets are confirmed and ready!</p>
                            </div>
                        </div>
                    </div>
                    
                    <div style="background: #f1f5f9; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                        <p style="margin: 0 0 10px 0; font-weight: 600;">Thank you for choosing Tazkirati!</p>
                        <p style="margin: 0; font-size: 14px; color: #64748b;">We look forward to seeing you at the event!</p>
                    </div>
                </div>
                `
                
            ;

            console.log(`📧 Sending PDF with ${individualTickets.length} tickets to: ${user.email}`);
        return await sendEmail({
            to: user.email,
            subject: `Your Tickets - ${event.title}`,
            html,
            attachments
        });

    } catch (error) {
        console.error('❌ PDF tickets email failed:', error);
        return false;
    }
    }

    // Send account deletion confirmation
    static async sendAccountDeletionConfirmation(user) {
        const  html = `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
                    <div style="background: #dc2626; color: white; padding: 30px; text-align: center;">
                        <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Account Deleted</h1>
                        <p style="margin: 10px 0 0 0; opacity: 0.9;">Your account has been deactivated</p>
                    </div>
                    
                    <div style="padding: 30px;">
                        <p>Hello <strong>${user.name}</strong>,</p>
                        
                        <div style="background: #fef2f2; padding: 20px; border-radius: 8px; border-left: 4px solid #dc2626; margin: 20px 0;">
                            <h3 style="margin: 0 0 15px 0; color: #991b1b;">Account Successfully Deactivated</h3>
                            <p>We're sorry to see you go! Your Tazkirati account has been successfully deactivated.</p>
                        </div>
                        
                        <div style="margin: 25px 0;">
                            <h3 style="color: #1e293b; margin-bottom: 15px;">What happens next:</h3>
                            <ul style="margin: 0; padding-left: 20px;">
                                <li style="margin: 8px 0;">Your account is now deactivated</li>
                                <li style="margin: 8px 0;">Your data will be kept for 30 days</li>
                                <li style="margin: 8px 0;">You can restore your account within 30 days by contacting support</li>
                                <li style="margin: 8px 0;">After 30 days, your data will be permanently deleted</li>
                            </ul>
                        </div>
                        
                        <div style="background: #dbeafe; padding: 15px; border-radius: 6px; margin: 20px 0;">
                            <h4 style="margin: 0 0 10px 0; color: #1e40af;">Changed your mind?</h4>
                            <p style="margin: 0;">If you changed your mind, you can restore your account within 30 days by contacting our support team.</p>
                            <p style="margin: 10px 0 0 0; font-weight: 600;">Contact: infotazkirati@gmail.com</p>
                        </div>
                    </div>
                    
                    <div style="background: #f1f5f9; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                        <p style="margin: 0 0 10px 0; font-weight: 600;">Thank you for being part of Tazkirati</p>
                        <p style="margin: 0; font-size: 14px; color: #64748b;">We hope to see you again in the future</p>
                    </div>
                </div>
            `
        ;

        console.log(`📧 Attempting to send account confirmation to: ${user.email}`);
    return await sendEmail({
        to: user.email,
        subject: 'Account Deletion Confirmation - Tazkirati',
        html
    });
    }

    // Send event reminder
    static async sendEventReminder(booking, user, event) {
        const html = `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
                    <div style="background: #ea580c; color: white; padding: 30px; text-align: center;">
                        <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Event Reminder</h1>
                        <p style="margin: 10px 0 0 0; opacity: 0.9;">Don't forget your event tomorrow!</p>
                    </div>
                    
                    <div style="padding: 30px;">
                        <p>Hello <strong>${user.name}</strong>,</p>
                        
                        <div style="background: #fffbeb; padding: 20px; border-radius: 8px; border-left: 4px solid #ea580c; margin: 20px 0;">
                            <h3 style="margin: 0 0 10px 0; color: #92400e;">${event.title} is happening tomorrow!</h3>
                            <p style="margin: 0;">We're excited to see you there!</p>
                        </div>
                        
                        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <h3 style="margin: 0 0 15px 0; color: #1e293b;">Event Details</h3>
                            <p style="margin: 8px 0;"><strong>Date:</strong> ${new Date(event.event_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                            <p style="margin: 8px 0;"><strong>Time:</strong> ${new Date(event.event_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
                            <p style="margin: 8px 0;"><strong>Venue:</strong> ${event.venue}</p>
                            <p style="margin: 8px 0;"><strong>Tickets:</strong> ${booking.quantity}</p>
                            <p style="margin: 8px 0;"><strong>Booking Reference:</strong> <span style="font-family: monospace; background: #1e40af; color: white; padding: 4px 8px; border-radius: 4px;">${booking.booking_reference}</span></p>
                        </div>
                        
                        <div style="background: #dbeafe; padding: 15px; border-radius: 6px; margin: 20px 0;">
                            <h4 style="margin: 0 0 10px 0; color: #1e40af;">Quick Tips for a Great Experience:</h4>
                            <ul style="margin: 0; padding-left: 20px;">
                                <li style="margin: 6px 0;">Arrive 30 minutes early</li>
                                <li style="margin: 6px 0;">Have your ticket QR code ready</li>
                                <li style="margin: 6px 0;">Bring valid ID</li>
                                <li style="margin: 6px 0;">Check event-specific requirements</li>
                            </ul>
                        </div>
                    </div>
                    
                    <div style="background: #f1f5f9; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                        <p style="margin: 0 0 10px 0; font-weight: 600;">We're excited to see you there!</p>
                        <p style="margin: 0; font-size: 14px; color: #64748b;">Need directions or more information? Contact us at infotazkirati@gmail.com</p>
                    </div>
                </div>
            `
        ;

        console.log(`📧 Attempting to send account confirmation to: ${user.email}`);
    return await sendEmail({
        to: user.email,
        subject: `Event Reminder - ${event.title} is Tomorrow`,
        html
    });
    }
   // Fix these two methods at the bottom of your emailService.js:

static async sendCancellationRequestEmail({ user, booking, event, reason }) {
    const html = `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
                <div style="background: #dc2626; color: white; padding: 30px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Cancellation Request Received</h1>
                    <p style="margin: 10px 0 0 0; opacity: 0.9;">Your refund request has been submitted</p>
                </div>
                
                <div style="padding: 30px;">
                    <p>Hello <strong>${user.name}</strong>,</p>
                    
                    <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="margin: 0 0 15px 0; color: #1e293b;">Cancellation Details</h3>
                        <p style="margin: 8px 0;"><strong>Event:</strong> ${event.title}</p>
                        <p style="margin: 8px 0;"><strong>Booking Reference:</strong> ${booking.booking_reference}</p>
                        <p style="margin: 8px 0;"><strong>Reason:</strong> ${reason || 'Not specified'}</p>
                        <p style="margin: 8px 0;"><strong>Refund Amount:</strong> $${parseFloat(booking.total_price).toFixed(2)}</p>
                        <p style="margin: 8px 0;"><strong>Request Date:</strong> ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </div>
                    
                    <div style="background: #fffbeb; padding: 20px; border-radius: 8px; border-left: 4px solid #d97706; margin: 20px 0;">
                        <h3 style="margin: 0 0 10px 0; color: #92400e;">Next Steps</h3>
                        <p style="margin: 8px 0;">Your refund request has been received and is being processed.</p>
                        <p style="margin: 8px 0; font-weight: 600;">Refunds are typically processed within 5-7 business days.</p>
                    </div>
                    
                    <div style="background: #dbeafe; padding: 15px; border-radius: 6px; margin: 20px 0;">
                        <p style="margin: 0; font-weight: 600;">Need assistance?</p>
                        <p style="margin: 8px 0 0 0; font-size: 14px;">Contact our support team at infotazkirati@gmail.com</p>
                    </div>
                </div>
                
                <div style="background: #f1f5f9; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                    <p style="margin: 0 0 10px 0; font-weight: 600;">Thank you for using Tazkirati</p>
                    <p style="margin: 0; font-size: 14px; color: #64748b;">We appreciate your business</p>
                </div>
            </div>
        `
    ;

    console.log(`📧 Attempting to send account confirmation to: ${user.email}`);
    return await sendEmail({
        to: user.email,
        subject: 'Cancellation Request Received - Tazkirati',
        html
    });
}

static async sendRefundProcessedEmail({ user, booking, approved, admin_notes }) {
    const subject = approved ? 'Refund Processed - Tazkirati' : 'Refund Request Declined - Tazkirati';
    
    const html = `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
                <div style="background: ${approved ? '#059669' : '#dc2626'}; color: white; padding: 30px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px; font-weight: 600;">${approved ? 'Refund Processed' : 'Refund Declined'}</h1>
                    <p style="margin: 10px 0 0 0; opacity: 0.9;">${approved ? 'Your refund has been processed' : 'Your refund request has been declined'}</p>
                </div>
                
                <div style="padding: 30px;">
                    <p>Hello <strong>${user.name}</strong>,</p>
                    
                    <div style="background: ${approved ? '#f0fdf4' : '#fef2f2'}; padding: 20px; border-radius: 8px; border-left: 4px solid ${approved ? '#059669' : '#dc2626'}; margin: 20px 0;">
                        <h3 style="margin: 0 0 15px 0; color: ${approved ? '#065f46' : '#991b1b'};">${approved ? 'Refund Approved' : 'Refund Declined'}</h3>
                        <p>Your refund request for booking <strong>${booking.booking_reference}</strong> has been ${approved ? 'approved and processed' : 'declined'}.</p>
                        ${admin_notes ? `<p style="margin: 10px 0 0 0;"><strong>Notes:</strong> ${admin_notes}</p>` : ''}
                        ${approved ? `<p style="margin: 10px 0 0 0;"><strong>Refund Amount:</strong> $${parseFloat(booking.refund_amount).toFixed(2)}</p>` : ''}
                    </div>
                    
                    ${approved ? `
                    <div style="background: #fffbeb; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h4 style="color: #92400e; margin: 0 0 10px 0;">Refund Information</h4>
                        <p style="margin: 8px 0;">The refund amount of $${parseFloat(booking.refund_amount).toFixed(2)} will be credited back to your original payment method.</p>
                        <p style="margin: 8px 0;">Please allow 3-5 business days for the refund to appear in your account.</p>
                    </div>
                    ` : ''}
                    
                    <div style="background: #dbeafe; padding: 15px; border-radius: 6px; margin: 20px 0;">
                        <p style="margin: 0; font-weight: 600;">Questions?</p>
                        <p style="margin: 8px 0 0 0; font-size: 14px;">Contact our support team at infotazkirati@gmail.com</p>
                    </div>
                </div>
                
                <div style="background: #f1f5f9; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                    <p style="margin: 0 0 10px 0; font-weight: 600;">Thank you for using Tazkirati</p>
                    <p style="margin: 0; font-size: 14px; color: #64748b;">${approved ? 'We hope to see you again soon!' : 'We appreciate your understanding'}</p>
                </div>
            </div>
        `
    ;

    console.log(`📧 Attempting to send account confirmation to: ${user.email}`);
    return await sendEmail({
        to: user.email,
        subject: subject,
        html
    });
}
// Add these methods to your existing EmailService class

// Send waiting list confirmation
static async sendWaitingListConfirmation(user, event, waitingListEntry) {
    const html = `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
                <div style="background: #7c3aed; color: white; padding: 30px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px; font-weight: 600;">You're on the Waiting List</h1>
                    <p style="margin: 10px 0 0 0; opacity: 0.9;">We'll notify you if tickets become available</p>
                </div>
                
                <div style="padding: 30px;">
                    <p>Hello <strong>${user.name}</strong>,</p>
                    
                    <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="margin: 0 0 15px 0; color: #1e293b;">Waiting List Details</h3>
                        <p style="margin: 8px 0;"><strong>Event:</strong> ${event.title}</p>
                        <p style="margin: 8px 0;"><strong>Venue:</strong> ${event.venue}</p>
                        <p style="margin: 8px 0;"><strong>Date:</strong> ${new Date(event.event_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                        <p style="margin: 8px 0;"><strong>Time:</strong> ${new Date(event.event_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
                        <p style="margin: 8px 0;"><strong>Tickets Requested:</strong> ${waitingListEntry.quantity}</p>
                        <p style="margin: 8px 0;"><strong>Your Position:</strong> #${waitingListEntry.position}</p>
                    </div>
                    
                    <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; border-left: 4px solid #0369a1; margin: 20px 0;">
                        <h4 style="margin: 0 0 10px 0; color: #075985;">How the Waiting List Works</h4>
                        <ul style="margin: 0; padding-left: 20px;">
                            <li style="margin: 8px 0;">You'll be notified immediately if tickets become available</li>
                            <li style="margin: 8px 0;">You'll have 24 hours to claim your tickets</li>
                            <li style="margin: 8px 0;">Notifications are sent in order of waitlist position</li>
                            <li style="margin: 8px 0;">If you don't respond within 24 hours, the next person will be notified</li>
                        </ul>
                    </div>
                    
                    <div style="background: #fffbeb; padding: 15px; border-radius: 6px; margin: 20px 0;">
                        <p style="margin: 0; font-weight: 600; color: #92400e;">Keep an eye on your email!</p>
                        <p style="margin: 8px 0 0 0; font-size: 14px;">We'll send you a notification email if tickets become available.</p>
                    </div>
                </div>
                
                <div style="background: #f1f5f9; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                    <p style="margin: 0 0 10px 0; font-weight: 600;">Thank you for your interest in ${event.title}</p>
                    <p style="margin: 0; font-size: 14px; color: #64748b;">We'll notify you as soon as tickets become available</p>
                </div>
            </div>
        `
    ;

   console.log(`📧 Attempting to send account confirmation to: ${user.email}`);
    return await sendEmail({
        to: user.email,
        subject: `Waiting List Confirmation - ${event.title}`,
        html
    });
}

// Send tickets available notification
static async sendTicketsAvailableNotification(user, event, waitingListEntry, availableTickets) {
    const isFullAllocation = availableTickets >= waitingListEntry.quantity;
    const allocationType = isFullAllocation ? 'full' : 'partial';
    
    const html = `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
                <div style="background: #059669; color: white; padding: 30px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Tickets Are Available!</h1>
                    <p style="margin: 10px 0 0 0; opacity: 0.9;">Claim your tickets now</p>
                </div>
                
                <div style="padding: 30px;">
                    <p>Hello <strong>${user.name}</strong>,</p>
                    
                    <div style="background: #dcfce7; padding: 20px; border-radius: 8px; border: 2px solid #16a34a; margin: 20px 0;">
                        <h3 style="margin: 0 0 15px 0; color: #166534;">Great News! Tickets Are Available</h3>
                        <p style="margin: 8px 0; font-size: 18px; font-weight: 600;">${isFullAllocation ? 
                            `All ${waitingListEntry.quantity} tickets you requested are available!` : 
                            `${availableTickets} of ${waitingListEntry.quantity} tickets you requested are available.`
                        }</p>
                    </div>
                    
                    <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="margin: 0 0 15px 0; color: #1e293b;">Event Details</h3>
                        <p style="margin: 8px 0;"><strong>Event:</strong> ${event.title}</p>
                        <p style="margin: 8px 0;"><strong>Venue:</strong> ${event.venue}</p>
                        <p style="margin: 8px 0;"><strong>Date:</strong> ${new Date(event.event_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                        <p style="margin: 8px 0;"><strong>Time:</strong> ${new Date(event.event_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
                        <p style="margin: 8px 0;"><strong>Price per ticket:</strong> $${parseFloat(event.price).toFixed(2)}</p>
                        <p style="margin: 8px 0;"><strong>Tickets available to you:</strong> ${isFullAllocation ? waitingListEntry.quantity : availableTickets}</p>
                        ${!isFullAllocation ? `<p style="margin: 8px 0; color: #dc2626;"><strong>Note:</strong> Only ${availableTickets} tickets are available, which is less than your requested ${waitingListEntry.quantity}</p>` : ''}
                    </div>
                    
                    <div style="background: #fef3c7; padding: 20px; border-radius: 8px; border-left: 4px solid #d97706; margin: 20px 0;">
                        <h4 style="margin: 0 0 10px 0; color: #92400e;">⏰ Important: Limited Time Offer</h4>
                        <p style="margin: 8px 0; font-weight: 600;">You have 24 hours to claim your tickets!</p>
                        <p style="margin: 8px 0;">These tickets are reserved for you until <strong>${new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleString()}</strong></p>
                        <p style="margin: 8px 0;">After this time, the tickets will be offered to the next person on the waiting list.</p>
                    </div>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/waiting-list/${waitingListEntry.id}/convert" 
                           style="background: #059669; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 16px;">
                           🎫 Claim Your Tickets Now
                        </a>
                        <p style="margin: 15px 0 0 0; font-size: 14px; color: #64748b;">
                            Or visit your account dashboard to complete your booking
                        </p>
                    </div>
                    
                    <div style="background: #dbeafe; padding: 15px; border-radius: 6px; margin: 20px 0;">
                        <p style="margin: 0; font-weight: 600;">Need help?</p>
                        <p style="margin: 8px 0 0 0; font-size: 14px;">Contact our support team at infotazkirati@gmail.com</p>
                    </div>
                </div>
                
                <div style="background: #f1f5f9; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                    <p style="margin: 0 0 10px 0; font-weight: 600;">Don't miss out on this event!</p>
                    <p style="margin: 0; font-size: 14px; color: #64748b;">Claim your tickets within 24 hours to secure your spot</p>
                </div>
            </div>
        `
    ;

    console.log(`📧 Attempting to send account confirmation to: ${user.email}`);
    return await sendEmail({
        to: user.email,
        subject: `🎉 Tickets Available! - ${event.title}`,
        html
    });
}

// Send waiting list conversion success
static async sendWaitingListConversionSuccess(user, event, booking, waitingListEntry) {
    const html = `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
                <div style="background: #059669; color: white; padding: 30px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Booking Confirmed!</h1>
                    <p style="margin: 10px 0 0 0; opacity: 0.9;">Your waiting list tickets are now confirmed</p>
                </div>
                
                <div style="padding: 30px;">
                    <p>Hello <strong>${user.name}</strong>,</p>
                    
                    <div style="background: #dcfce7; padding: 20px; border-radius: 8px; border: 2px solid #16a34a; margin: 20px 0; text-align: center;">
                        <h3 style="margin: 0 0 10px 0; color: #166534;">🎉 Success! You've Got Tickets</h3>
                        <p style="margin: 0; font-size: 18px; font-weight: 600;">Your waiting list request has been converted to a confirmed booking</p>
                    </div>
                    
                    <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="margin: 0 0 15px 0; color: #1e293b;">Booking Details</h3>
                        <p style="margin: 8px 0;"><strong>Event:</strong> ${event.title}</p>
                        <p style="margin: 8px 0;"><strong>Venue:</strong> ${event.venue}</p>
                        <p style="margin: 8px 0;"><strong>Date:</strong> ${new Date(event.event_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                        <p style="margin: 8px 0;"><strong>Time:</strong> ${new Date(event.event_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
                        <p style="margin: 8px 0;"><strong>Tickets:</strong> ${booking.quantity}</p>
                        <p style="margin: 8px 0;"><strong>Total Paid:</strong> $${parseFloat(booking.total_price).toFixed(2)}</p>
                        <p style="margin: 8px 0;"><strong>Booking Reference:</strong> <span style="font-family: monospace; background: #1e40af; color: white; padding: 4px 8px; border-radius: 4px;">${booking.booking_reference}</span></p>
                    </div>
                    
                    <div style="background: #f0f9ff; padding: 15px; border-radius: 6px; margin: 20px 0;">
                        <h4 style="margin: 0 0 10px 0; color: #075985;">What's Next?</h4>
                        <p style="margin: 8px 0;">You'll receive a separate email with your digital tickets and QR codes shortly.</p>
                        <p style="margin: 8px 0;">Keep an eye on your inbox for your ticket confirmation with QR codes.</p>
                    </div>
                    
                    <div style="text-align: center; margin: 25px 0;">
                        <div style="background: #dbeafe; display: inline-block; padding: 15px 25px; border-radius: 8px;">
                            <p style="margin: 0; font-weight: 600; color: #1e40af;">Your tickets are confirmed and secure!</p>
                        </div>
                    </div>
                </div>
                
                <div style="background: #f1f5f9; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                    <p style="margin: 0 0 10px 0; font-weight: 600;">Thank you for your patience</p>
                    <p style="margin: 0; font-size: 14px; color: #64748b;">We're excited to see you at the event!</p>
                </div>
            </div>
        `
    ;

    console.log(`📧 Attempting to send account confirmation to: ${user.email}`);
    return await sendEmail({
        to: user.email,
       subject: `Booking Confirmed! - ${event.title}`,
        html
    });
}

// Send waiting list expiration warning
static async sendWaitingListExpirationWarning(user, event, waitingListEntry, hoursRemaining) {
    const html = `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
                <div style="background: #ea580c; color: white; padding: 30px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Last Chance to Claim Tickets</h1>
                    <p style="margin: 10px 0 0 0; opacity: 0.9;">Your reservation expires in ${hoursRemaining} hours</p>
                </div>
                
                <div style="padding: 30px;">
                    <p>Hello <strong>${user.name}</strong>,</p>
                    
                    <div style="background: #fef3c7; padding: 20px; border-radius: 8px; border: 2px solid #d97706; margin: 20px 0;">
                        <h3 style="margin: 0 0 15px 0; color: #92400e;">⏰ Time is Running Out!</h3>
                        <p style="margin: 8px 0; font-size: 18px; font-weight: 600;">Your ticket reservation expires in ${hoursRemaining} hours</p>
                        <p style="margin: 8px 0;">After this time, these tickets will be offered to the next person on the waiting list.</p>
                    </div>
                    
                    <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="margin: 0 0 15px 0; color: #1e293b;">Event Details</h3>
                        <p style="margin: 8px 0;"><strong>Event:</strong> ${event.title}</p>
                        <p style="margin: 8px 0;"><strong>Venue:</strong> ${event.venue}</p>
                        <p style="margin: 8px 0;"><strong>Date:</strong> ${new Date(event.event_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                        <p style="margin: 8px 0;"><strong>Time:</strong> ${new Date(event.event_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
                        <p style="margin: 8px 0;"><strong>Tickets Reserved:</strong> ${waitingListEntry.quantity}</p>
                        <p style="margin: 8px 0;"><strong>Expires:</strong> ${new Date(Date.now() + hoursRemaining * 60 * 60 * 1000).toLocaleString()}</p>
                    </div>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/waiting-list/${waitingListEntry.id}/convert" 
                           style="background: #ea580c; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 16px;">
                           🎫 Claim Tickets Now
                        </a>
                        <p style="margin: 15px 0 0 0; font-size: 14px; color: #64748b;">
                            Don't lose your spot! Complete your booking now.
                        </p>
                    </div>
                    
                    <div style="background: #fef2f2; padding: 15px; border-radius: 6px; margin: 20px 0;">
                        <p style="margin: 0; font-weight: 600; color: #dc2626;">This is your final reminder</p>
                        <p style="margin: 8px 0 0 0; font-size: 14px;">If you don't complete your booking, these tickets will be released to others.</p>
                    </div>
                </div>
                
                <div style="background: #f1f5f9; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                    <p style="margin: 0 0 10px 0; font-weight: 600;">Don't miss out on this event!</p>
                    <p style="margin: 0; font-size: 14px; color: #64748b;">Secure your tickets before they're gone</p>
                </div>
            </div>
        `
    ;

    console.log(`📧 Attempting to send account confirmation to: ${user.email}`);
    return await sendEmail({
        to: user.email,
        subject: `⏰ Last Chance! Tickets Expiring Soon - ${event.title}`,
        html
    });
}

// Send waiting list expired notification
static async sendWaitingListExpired(user, event, waitingListEntry) {
    const html = `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
                <div style="background: #6b7280; color: white; padding: 30px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Reservation Expired</h1>
                    <p style="margin: 10px 0 0 0; opacity: 0.9;">Your ticket reservation has expired</p>
                </div>
                
                <div style="padding: 30px;">
                    <p>Hello <strong>${user.name}</strong>,</p>
                    
                    <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="margin: 0 0 15px 0; color: #374151;">Ticket Reservation Expired</h3>
                        <p style="margin: 8px 0;">We're sorry, but your 24-hour reservation period for tickets to <strong>${event.title}</strong> has expired.</p>
                        <p style="margin: 8px 0;">The tickets have been released and offered to the next person on the waiting list.</p>
                    </div>
                    
                    <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="margin: 0 0 15px 0; color: #1e293b;">Event Details</h3>
                        <p style="margin: 8px 0;"><strong>Event:</strong> ${event.title}</p>
                        <p style="margin: 8px 0;"><strong>Venue:</strong> ${event.venue}</p>
                        <p style="margin: 8px 0;"><strong>Date:</strong> ${new Date(event.event_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                        <p style="margin: 8px 0;"><strong>Tickets Requested:</strong> ${waitingListEntry.quantity}</p>
                    </div>
                    
                    <div style="background: #f0f9ff; padding: 15px; border-radius: 6px; margin: 20px 0;">
                        <h4 style="margin: 0 0 10px 0; color: #075985;">Still Interested?</h4>
                        <p style="margin: 8px 0;">You can still join the waiting list again if you're still interested in attending.</p>
                        <p style="margin: 8px 0;">Check the event page to see if waiting list is still available.</p>
                    </div>
                    
                    <div style="text-align: center; margin: 25px 0;">
                        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/events/${event.id}" 
                           style="background: #6b7280; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
                           View Event Details
                        </a>
                    </div>
                </div>
                
                <div style="background: #f1f5f9; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                    <p style="margin: 0 0 10px 0; font-weight: 600;">Thank you for your interest</p>
                    <p style="margin: 0; font-size: 14px; color: #64748b;">We hope to see you at future events</p>
                </div>
            </div>
        `
    ;

   console.log(`📧 Attempting to send account confirmation to: ${user.email}`);
    return await sendEmail({
        to: user.email,
        subject: `Ticket Reservation Expired - ${event.title}`,
        html
    });
}

// Send waiting list position update
static async sendWaitingListPositionUpdate(user, event, waitingListEntry, oldPosition, newPosition) {
    const movedUp = newPosition < oldPosition;
    
    const html = `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
                <div style="background: ${movedUp ? '#7c3aed' : '#6b7280'}; color: white; padding: 30px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Waiting List Update</h1>
                    <p style="margin: 10px 0 0 0; opacity: 0.9;">${movedUp ? 'Your position has improved!' : 'Waiting list update'}</p>
                </div>
                
                <div style="padding: 30px;">
                    <p>Hello <strong>${user.name}</strong>,</p>
                    
                    <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="margin: 0 0 15px 0; color: #1e293b;">Position Update</h3>
                        <p style="margin: 8px 0;"><strong>Event:</strong> ${event.title}</p>
                        <p style="margin: 8px 0;"><strong>Previous Position:</strong> #${oldPosition}</p>
                        <p style="margin: 8px 0;"><strong>Current Position:</strong> #${newPosition}</p>
                        ${movedUp ? 
                            `<div style="background: #dcfce7; padding: 10px; border-radius: 4px; margin: 10px 0;">
                                <p style="margin: 0; color: #166534; font-weight: 600;">🎉 You moved up ${oldPosition - newPosition} spots!</p>
                            </div>` : 
                            `<p style="margin: 8px 0;">Your position remains the same.</p>`
                        }
                    </div>
                    
                    ${movedUp ? `
                    <div style="background: #f0f9ff; padding: 15px; border-radius: 6px; margin: 20px 0;">
                        <h4 style="margin: 0 0 10px 0; color: #075985;">What This Means</h4>
                        <p style="margin: 8px 0;">You're getting closer to getting tickets!</p>
                        <p style="margin: 8px 0;">When tickets become available, you'll be notified based on your improved position.</p>
                    </div>
                    ` : ''}
                    
                    <div style="background: #fffbeb; padding: 15px; border-radius: 6px; margin: 20px 0;">
                        <p style="margin: 0; font-weight: 600; color: #92400e;">Keep an eye on your email</p>
                        <p style="margin: 8px 0 0 0; font-size: 14px;">We'll notify you immediately if tickets become available for you.</p>
                    </div>
                </div>
                
                <div style="background: #f1f5f9; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                    <p style="margin: 0 0 10px 0; font-weight: 600;">Thank you for your patience</p>
                    <p style="margin: 0; font-size: 14px; color: #64748b;">We're working to get you tickets</p>
                </div>
            </div>
        `
    ;

    console.log(`📧 Attempting to send account confirmation to: ${user.email}`);
    return await sendEmail({
        to: user.email,
       subject: `Waiting List Update - ${event.title}`,
        html
    });
}

}

module.exports = EmailService;