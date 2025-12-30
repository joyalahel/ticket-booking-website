const express = require('express');
const router = express.Router();
const AdminController = require('../controllers/adminController');
const QRController = require('../controllers/qrController');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');

// All admin routes require authentication and admin role
router.use(authenticateToken);
router.use(requireAdmin);

// Dashboard
router.get('/dashboard/stats', AdminController.getDashboardStats);

// User management
router.get('/users', AdminController.getAllUsers);
router.get('/users/:userId', AdminController.getUserDetails); // Add this
router.patch('/users/:userId/role', AdminController.updateUserRole);
router.delete('/users/:userId', AdminController.deleteUser); // Hard delete
router.patch('/users/:userId/deactivate', AdminController.softDeleteUser); // Soft delete
router.patch('/users/:userId/reactivate', AdminController.reactivateUser); // Reactivate

// Event management
router.get('/events', AdminController.getAllEvents);
router.delete('/events/:eventId', AdminController.deleteEvent);
router.patch('/events/:eventId/restore', AdminController.restoreEvent);

// Booking management
router.get('/bookings', AdminController.getAllBookings);
router.post('/qr/verify', QRController.adminVerifyScan);

module.exports = router;
