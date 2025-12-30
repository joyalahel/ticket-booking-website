const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController.js');
const { authenticateToken } = require('../middleware/authMiddleware.js');

// Public routes
router.post('/register', AuthController.register);
router.post('/login', AuthController.login);

// Protected routes
router.get('/profile', authenticateToken, AuthController.getProfile);
router.get('/account/deletion-check', authenticateToken, AuthController.checkAccountDeletion);
router.delete('/account', authenticateToken, AuthController.deleteMyAccount);
router.put('/account/password', authenticateToken, AuthController.changePassword);

module.exports = router;
