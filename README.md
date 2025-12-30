# Ticket Booking Website

A full-stack ticket booking platform with real-time availability updates, seat reservations, and admin management.


## Features

-  Real-time ticket availability via WebSockets
-  Interactive seating selection and reservations
-  Automated email notifications (via Resend)
-  Payment processing integration
-  User profiles and booking history
-  Comprehensive Admin Dashboard
-  Responsive design

## Prerequisites

- Node.js (v14 or higher)
- MySQL Database
- Resend API Key (for emails)

##  Project Structure

- `app.js`: Main entry point and server configuration
- `src/config/`: Database and other configurations
- `src/models/`: Database models and logic
- `src/routes/`: API route definitions
- `src/services/`: External services (Email, etc.)
- `public/`: Frontend assets and pages
- `uploads/`: Directory for uploaded images/files

##  Security Best Practices

- **Input Validation**: All API endpoints should validate user input.
- **Authentication**: Secure routes are protected by authentication middleware.
- **SQL Injection**: Using `mysql2` with prepared statements/pools to prevent SQL injection.

