// routes/auth.js
const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { auth } = require('../middlewares/auth');

const router = express.Router();

// ✅ CRITICAL FIX: allow OPTIONS for CORS preflight
router.options('*', (req, res) => {
  res.sendStatus(204);
});

// Validation rules
const signupValidation = [
  body('firstName').trim().isLength({ min: 2 }),
  body('lastName').trim().isLength({ min: 2 }),
  body('email').isEmail().normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
];

const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
];

const forgotPasswordValidation = [
  body('email').isEmail().normalizeEmail()
];

const sendResetOTPValidation = [
  body('email').isEmail().normalizeEmail()
];

const verifyOTPValidation = [
  body('email').isEmail().normalizeEmail(),
  body('otp').isLength({ min: 6, max: 6 }).isNumeric()
];

const resetPasswordValidation = [
  body('resetToken').notEmpty(),
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
];

const updatePasswordValidation = [
  body('currentPassword').notEmpty(),
  body('newPassword')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
];

// Public routes
router.post('/signup', authController.signup);
router.post('/login', loginValidation, authController.login);
router.post('/logout', authController.logout);
router.post('/refresh-token', authController.refreshToken);

// Password reset
router.post('/forgot-password', forgotPasswordValidation, authController.forgotPassword);
router.post('/send-reset-otp', sendResetOTPValidation, authController.sendResetOTP);
router.post('/verify-reset-otp', verifyOTPValidation, authController.verifyResetOTP);
router.post('/reset-password', resetPasswordValidation, authController.resetPassword);

// Email verification
router.get('/verify-email/:token', authController.verifyEmail);
router.post('/resend-verification', forgotPasswordValidation, authController.resendVerification);

// Protected routes
router.get('/me', auth, authController.getMe);
router.put('/update-password', auth, updatePasswordValidation, authController.updatePassword);

module.exports = router;
