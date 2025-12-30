const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

// Import models and routes
const Booking = require('./src/models/Booking');

// Import routes from src folder
const authRoutes = require('./src/routes/authRoutes');
const eventRoutes = require('./src/routes/eventRoutes');
const bookingRoutes = require('./src/routes/bookingRoutes');
const paymentRoutes = require('./src/routes/paymentRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const qrRoutes = require('./src/routes/qrRoutes');
const seatingRoutes = require('./src/routes/seatingRoutes');
const venueRoutes = require('./src/routes/venueRoutes');
const adminPaymentRoutes = require('./src/routes/adminPaymentRoutes');
const refundRoutes = require('./src/routes/refundRoutes');
const waitingListRoutes = require('./src/routes/waitingListRoutes');
const wishlistRoutes = require('./src/routes/wishlistRoutes');
const realtimeRoutes = require('./src/routes/realtimeRoutes');
const organizerRoutes = require('./src/routes/organizerRoutes');
const contactRoutes = require('./src/routes/contactRoutes');
const WaitingList = require('./src/models/WaitingList');
const Event = require('./src/models/Event');
const EmailService = require('./src/services/emailService');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5500", "http://127.0.0.1:5500"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  }
});
// Make io available globally for modules that need it (e.g., booking cancellation updates)
global.io = io;

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5500", "http://127.0.0.1:5500"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/seating', seatingRoutes);
app.use('/api/venues', venueRoutes);
app.use('/api/admin/payments', adminPaymentRoutes);
app.use('/api/refunds', refundRoutes);
app.use('/api', waitingListRoutes);
app.use('/api', wishlistRoutes);
app.use('/api/realtime', realtimeRoutes);
app.use('/api/organizers', organizerRoutes);
app.use('/api', contactRoutes);

// Socket.io Connection Handling
io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);

  // Join event room when user views an event
  socket.on('join-event', (eventId) => {
    socket.join(`event-${eventId}`);
    console.log(`User ${socket.id} joined event-${eventId}`);
    
    // Send current availability immediately
    updateEventAvailability(eventId);
  });

  // Leave event room
  socket.on('leave-event', (eventId) => {
    socket.leave(`event-${eventId}`);
    console.log(`User ${socket.id} left event-${eventId}`);
  });

  // Listen for manual refresh requests
  socket.on('refresh-availability', (eventId) => {
    console.log(`User ${socket.id} requested refresh for event ${eventId}`);
    updateEventAvailability(eventId);
  });

  // Handle booking creation events
  socket.on('booking-created', (bookingData) => {
    console.log('New booking created:', bookingData);
    // Notify all users in the event room about the booking
    socket.to(`event-${bookingData.eventId}`).emit('booking-update', bookingData);
  });

  socket.on('disconnect', () => {
    console.log('🔌 User disconnected:', socket.id);
  });
});

// Function to update event availability
const updateEventAvailability = async (eventId) => {
  try {
    // Use the new real-time availability method
    const availability = await Booking.getRealTimeAvailability(eventId);
    
    if (availability) {
      io.to(`event-${eventId}`).emit('ticket-update', {
        eventId: parseInt(eventId),
        availableTickets: availability.availableTickets,
        bookedTickets: availability.bookedTickets,
        capacity: availability.capacity,
        status: availability.status,
        percentageSold: availability.percentageSold,
        lastUpdated: availability.lastUpdated,
        timestamp: new Date().toISOString()
      });
      
      console.log(`📊 Updated availability for event ${eventId}: ${availability.availableTickets}/${availability.capacity} tickets (${availability.status})`);
      
      // Check for low availability warnings
      if (availability.availableTickets < 10 && availability.availableTickets > 0) {
        io.to(`event-${eventId}`).emit('low-availability', {
          eventId: parseInt(eventId),
          eventTitle: availability.eventTitle,
          availableTickets: availability.availableTickets,
          message: `Only ${availability.availableTickets} tickets left! Book now before they're gone.`,
          urgency: availability.availableTickets < 3 ? 'high' : 
                   availability.availableTickets < 5 ? 'medium' : 'low',
          timestamp: new Date().toISOString()
        });
      }
      
      // Check if event is sold out
      if (availability.availableTickets === 0) {
        io.to(`event-${eventId}`).emit('sold-out', {
          eventId: parseInt(eventId),
          eventTitle: availability.eventTitle,
          message: 'This event is completely sold out!',
          timestamp: new Date().toISOString()
        });
      }
    }
  } catch (error) {
    console.error('Error updating event availability:', error);
  }
};

// Make io available to other modules
app.set('io', io);

// Periodically process waiting lists when tickets free up
const processWaitingLists = async () => {
  try {
    const eventIds = await WaitingList.getEventsWithWaitingList();
    for (const eventId of eventIds) {
      const available = await WaitingList.getAvailableTickets(eventId);
      if (available <= 0) continue;

      const notifications = await WaitingList.processWaitingList(eventId, available);
      if (!notifications.length) continue;

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
          ).catch(err => console.error('Waiting list email failed:', err.message));
        })
      );
    }
  } catch (err) {
    console.error('Waiting list processing loop failed:', err);
  }
};

setInterval(processWaitingLists, 60 * 1000);

// Release expired pending bookings (24h payment window / 10m holds) and free seats
const releaseExpiredHolds = async () => {
  try {
    const released = await Booking.releaseExpiredSeatReservations();
    if (released) {
      console.log(`[Scheduler] Released ${released} expired pending bookings and freed seats.`);
    }
  } catch (err) {
    console.error('Expired hold release error:', err);
  }
};
setInterval(releaseExpiredHolds, 5 * 60 * 1000);

// Serve frontend pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'register.html'));
});

app.get('/events', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'events.html'));
});

app.get('/event-details', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'event-details.html'));
});
app.get('/profile', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'profile.html'));
});
app.get('/admin/users', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'admin-users.html'));
});
app.get('/admin/refunds', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'admin-refunds.html'));
});
app.get('/admin/organizers', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'admin-organizers.html'));
});
app.get('/admin/inquiries', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'admin-inquiries.html'));
});
app.get('/organizer-apply', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'organizer-apply.html'));
});
app.get('/contact', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'contact.html'));
});
app.get('/faq', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'faq.html'));
});
app.get('/admin/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'admin-dashboard.html'));
});

// API Test route
app.get('/api', (req, res) => {
  res.json({ 
    message: '🎟️ Ticket Booking API is running!',
    status: 'Server is working ✅',
    timestamp: new Date().toISOString(),
    websockets: 'Active 🔌',
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login', 
        profile: 'GET /api/auth/profile'
      },
      events: {
        getAll: 'GET /api/events',
        getSingle: 'GET /api/events/:id',
        create: 'POST /api/events',
        update: 'PUT /api/events/:id',
        delete: 'DELETE /api/events/:id'
      },
      bookings: {
        create: 'POST /api/bookings',
        getUserBookings: 'GET /api/bookings/user',
        getBooking: 'GET /api/bookings/:id',
        cancel: 'PUT /api/bookings/:id/cancel'
      },
      realtime: {
        availability: 'GET /api/realtime/events/:id/availability',
        batchAvailability: 'POST /api/realtime/events/availability/batch',
        subscribe: 'POST /api/realtime/events/:id/subscribe'
      }
    }
  });
});

// WebSocket test route
app.get('/api/websocket-test', (req, res) => {
  res.json({
    success: true,
    message: 'WebSocket server is running',
    connectedClients: io.engine.clientsCount,
    timestamp: new Date().toISOString()
  });
});

// Health check route
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    connectedClients: io.engine.clientsCount
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});



// Cleanup on startup with safety check
if (Booking && typeof Booking.releaseExpiredSeatReservations === 'function') {
  Booking.releaseExpiredSeatReservations()
    .then(count => {
      console.log(`🕒 Cleaned up ${count} expired seat reservations on startup`);
    })
    .catch(error => {
      console.error('Startup cleanup error:', error);
    });
} else {
  console.log('⚠️  Booking model or cleanup method not available');
}

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔌 WebSockets enabled for real-time updates`);
  console.log(`📁 Static files served from: ${path.join(__dirname, 'public')}`);
  console.log(`📍 Uploads served from: ${path.join(__dirname, 'uploads')}`);
  console.log(`🌐 CORS enabled for: http://localhost:3000, http://127.0.0.1:3000, http://localhost:5500, http://127.0.0.1:5500`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Export for use in other modules
module.exports = { app, server, io };
