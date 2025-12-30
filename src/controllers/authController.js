const User = require('../models/User.js');
const EmailService=require('../services/emailService.js');
const { generateToken } = require('../middleware/authMiddleware.js');

class AuthController {
    // User registration
    static async register(req, res) {
        try {
            const { name, email, password, phone, role } = req.body;

            // Validation
            if (!name || !email || !password) {
                return res.status(400).json({ error: 'Name, email, and password are required' });
            }

            // Check if user already exists
            const existingUser = await User.findByEmail(email);
            if (existingUser) {
                return res.status(400).json({ error: 'User already exists with this email' });
            }

            // Create user
            const userId = await User.create({ name, email, password, phone, role });
            
            // Get user data without password
            const user = await User.findById(userId);

             // ✅ Send account confirmation email
            try {
                await EmailService.sendAccountConfirmation(user);
            } catch (emailError) {
                console.log('📧 Account confirmation email failed, but user was created:', emailError.message);
            }
            // Generate token
            const token = generateToken(userId);

            res.status(201).json({
                message: 'User registered successfully',
                user,
                token
            });

        } catch (error) {
            console.error('Registration error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // User login
    static async login(req, res) {
        try {
            const { email, password } = req.body;

            // Validation
            if (!email || !password) {
                return res.status(400).json({ error: 'Email and password are required' });
            }

            // Find user
            const user = await User.findByEmail(email);
            if (!user) {
                return res.status(401).json({ error: 'Invalid email or password' });
            }

            // Verify password
            const isValidPassword = await User.verifyPassword(password, user.password_hash);
            if (!isValidPassword) {
                return res.status(401).json({ error: 'Invalid email or password' });
            }

            // Generate token
            const token = generateToken(user.id);

            // Remove password from response
            const { password_hash, ...userWithoutPassword } = user;

            res.json({
                message: 'Login successful',
                user: userWithoutPassword,
                token
            });

        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Get current user profile
    static async getProfile(req, res) {
        try {
            const user = await User.findById(req.user.id);
            res.json({ user });
        } catch (error) {
            console.error('Profile error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
    // Check if user can delete their account
    static async checkAccountDeletion(req, res) {
        try {
            const userId = req.user.id;

            const deletionStatus = await User.canDeleteAccount(userId);

            res.json({
                can_delete: deletionStatus.canDelete,
                reasons: deletionStatus.canDelete ? [] : [
                    ...(deletionStatus.pendingBookings > 0 ? [`You have ${deletionStatus.pendingBookings} pending booking(s)`] : []),
                    ...(deletionStatus.activeEvents > 0 ? [`You have ${deletionStatus.activeEvents} active event(s) as organizer`] : [])
                ],
                details: {
                    pending_bookings: deletionStatus.pendingBookings,
                    active_events: deletionStatus.activeEvents
                }
            });

        } catch (error) {
            console.error('Check account deletion error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // User soft delete their own account
    static async deleteMyAccount(req, res) {
        try {
            const userId = req.user.id;

            // Check if user can delete their account
            const deletionStatus = await User.canDeleteAccount(userId);
            
            if (!deletionStatus.canDelete) {
                return res.status(400).json({
                    error: 'Cannot delete account',
                    reasons: [
                        ...(deletionStatus.pendingBookings > 0 ? [`You have ${deletionStatus.pendingBookings} pending booking(s)`] : []),
                        ...(deletionStatus.activeEvents > 0 ? [`You have ${deletionStatus.activeEvents} active event(s) as organizer`] : [])
                    ],
                    actions_required: [
                        ...(deletionStatus.pendingBookings > 0 ? ['Cancel all pending bookings'] : []),
                        ...(deletionStatus.activeEvents > 0 ? ['Transfer or deactivate your events'] : [])
                    ]
                });
            }

            // Get user details for email before deletion
            const user = await User.findById(userId);

            // Soft delete the account
            const deleted = await User.softDeleteUser(userId);

            if (!deleted) {
                return res.status(404).json({ error: 'User not found' });
            }

            // Send account deletion confirmation email
            try {
                await EmailService.sendAccountDeletionConfirmation(user);
            } catch (emailError) {
                console.log('📧 Account deletion email failed:', emailError.message);
            }

            res.json({
                message: 'Account deleted successfully',
                note: 'Your account has been deactivated. You can contact support within 30 days to restore your account.',
                deleted_at: new Date().toISOString()
            });

        } catch (error) {
            console.error('Delete account error:', error);
            
            if (error.message.includes('Cannot delete account with pending bookings') || 
                error.message.includes('Cannot delete organizer account with active events')) {
                return res.status(400).json({ error: error.message });
            }

            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Change password
    static async changePassword(req, res) {
        try {
            const userId = req.user.id;
            const { current_password, new_password } = req.body;

            if (!current_password || !new_password) {
                return res.status(400).json({ error: 'Current and new password are required' });
            }

            if (new_password.length < 6) {
                return res.status(400).json({ error: 'New password must be at least 6 characters' });
            }

            await User.changePassword(userId, current_password, new_password);

            res.json({
                success: true,
                message: 'Password updated successfully'
            });
        } catch (error) {
            console.error('Change password error:', error);
            if (error.message === 'Current password is incorrect' || error.message === 'User not found') {
                return res.status(400).json({ error: error.message });
            }
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}

module.exports = AuthController;
