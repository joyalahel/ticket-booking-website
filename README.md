# Ticket Booking Website

A full-stack ticket booking platform with real-time availability updates, seat reservations, and admin management.

## 🔒 Security Notice

This repository has been secured for GitHub. **All sensitive credentials have been removed and replaced with environment variables.**

## Features

- 🎟️ Real-time ticket availability via WebSockets
- 🪑 Interactive seating selection and reservations
- 📧 Automated email notifications (via Resend)
- 💳 Payment processing integration
- 👤 User profiles and booking history
- 🛠️ Comprehensive Admin Dashboard
- 📱 Responsive design

## Prerequisites

- Node.js (v14 or higher)
- MySQL Database
- Resend API Key (for emails)

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd ticket-booking-website
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Setup

Create a `.env` file in the root directory by copying the example:

```bash
cp .env.example .env
```

Edit `.env` and provide your actual credentials:

```env
DB_HOST=your_mysql_host
DB_PORT=36318
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password
DB_NAME=your_mysql_database

RESEND_API_KEY=your_resend_api_key
FROM_EMAIL="Your App Name <no-reply@yourdomain.com>"
```

### 4. Database Setup

Import the database schema (if provided) or ensure your MySQL instance is running with the correct tables.

### 5. Run the Application

```bash
# Development mode
npm start

# Production mode
NODE_ENV=production npm start
```

The server will start on `http://localhost:3000`.

## 📁 Project Structure

- `app.js`: Main entry point and server configuration
- `src/config/`: Database and other configurations
- `src/models/`: Database models and logic
- `src/routes/`: API route definitions
- `src/services/`: External services (Email, etc.)
- `public/`: Frontend assets and pages
- `uploads/`: Directory for uploaded images/files

## 🛡️ Security Best Practices

- **Environment Variables**: Never commit your `.env` file. It is included in `.gitignore`.
- **Input Validation**: All API endpoints should validate user input.
- **Authentication**: Secure routes are protected by authentication middleware.
- **SQL Injection**: Using `mysql2` with prepared statements/pools to prevent SQL injection.

## 📄 License

[Add your license here]
