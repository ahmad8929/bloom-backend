// controllers/authController.js - Production Ready
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const { sendEmail, verifyEmailConfig } = require('../utils/email');
const { generateTokens } = require('../utils/jwt');

// Verify email configuration on startup
if (process.env.NODE_ENV !== 'test') {
  setTimeout(() => verifyEmailConfig(), 1000);
}

/**
 * Format email errors for API response
 * @param {Error} error - Original error
 * @returns {Object} - Formatted error
 */
function formatEmailError(error) {
  const formatted = {
    message: error.message,
    name: error.name,
    timestamp: new Date().toISOString()
  };
  
  // Include additional details for debugging
  if (process.env.NODE_ENV === 'development') {
    formatted.stack = error.stack;
    formatted.code = error.code;
    formatted.response = error.response;
    formatted.responseCode = error.responseCode;
    formatted.details = error.details;
    formatted.originalError = error.originalError ? {
      message: error.originalError.message,
      name: error.originalError.name
    } : undefined;
  }
  
  return formatted;
}

/**
 * Log email attempt for auditing
 * @param {string} action - Email action
 * @param {string} email - Recipient email
 * @param {boolean} success - Success status
 * @param {Error} [error] - Error if any
 */
function logEmailAttempt(action, email, success, error = null) {
  const timestamp = new Date().toISOString();
  const status = success ? '✅ SUCCESS' : '❌ FAILED';
  
  console.log(`${timestamp} ${status} ${action} to ${email}`);
  
  if (error) {
    console.error(`   Error: ${error.message}`);
    if (error.code) console.error(`   Code: ${error.code}`);
  }
}

const authController = {
  // ===========================
  // SIGNUP
  // ===========================
  async signup(req, res) {
    const startTime = Date.now();
    
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { firstName, lastName, email, password, phone } = req.body;

      // Check if user exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          status: 'error',
          message: 'User already exists with this email'
        });
      }

      // Create user
      const user = new User({
        firstName,
        lastName,
        email,
        password,
        phone
      });

      // Generate verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      user.emailVerificationToken = verificationToken;
      user.emailVerificationExpire = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

      await user.save();
      console.log(`✅ User created: ${email}`);

      try {
        // Send verification email
        const verificationUrl = `${process.env.FRONTEND_URL.replace(/\/$/, '')}/verify-email/${verificationToken}`;
        
        await sendEmail({
          to: user.email,
          subject: 'Verify Your Email - Bloom Tales',
          template: 'emailVerification',
          context: {
            name: user.firstName,
            verificationUrl
          }
        });
        
        logEmailAttempt('Email verification', user.email, true);
        
      } catch (emailError) {
        logEmailAttempt('Email verification', user.email, false, emailError);
        
        return res.status(500).json({
          status: 'error',
          message: 'Account created but failed to send verification email. Please try resending verification.',
          error: formatEmailError(emailError)
        });
      }

      // Calculate response time
      const responseTime = Date.now() - startTime;
      
      res.status(201).json({
        status: 'success',
        message: 'Account created successfully. Please verify your email.',
        data: {
          user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
            isEmailVerified: user.isEmailVerified
          }
        },
        meta: {
          responseTime: `${responseTime}ms`
        }
      });
      
    } catch (error) {
      console.error('Signup error:', error);
      const responseTime = Date.now() - startTime;
      
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        meta: {
          responseTime: `${responseTime}ms`
        }
      });
    }
  },

  // ===========================
  // LOGIN
  // ===========================
  async login(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { email, password } = req.body;

      // Find user with password
      const user = await User.findOne({ email }).select('+password');
      if (!user) {
        return res.status(401).json({
          status: 'error',
          message: 'Invalid email or password'
        });
      }

      // Check account status
      if (!user.isActive) {
        return res.status(401).json({
          status: 'error',
          message: 'Account is deactivated. Please contact support.'
        });
      }

      // Check email verification
      if (!user.isEmailVerified) {
        return res.status(401).json({
          status: 'error',
          message: 'Please verify your email before logging in',
          code: 'EMAIL_NOT_VERIFIED'
        });
      }

      // Verify password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        return res.status(401).json({
          status: 'error',
          message: 'Invalid email or password'
        });
      }

      // Update last login
      user.lastLogin = new Date();
      await user.save();

      // Generate tokens
      const { accessToken, refreshToken } = generateTokens(user._id);

      res.json({
        status: 'success',
        message: 'Login successful',
        data: {
          user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
            isEmailVerified: user.isEmailVerified
          },
          accessToken,
          refreshToken
        }
      });
      
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // ===========================
  // SEND RESET OTP
  // ===========================
  async sendResetOTP(req, res) {
    const startTime = Date.now();
    
    try {
      const { email } = req.body;

      // Validate email
      if (!email || !email.includes('@')) {
        return res.status(400).json({
          status: 'error',
          message: 'Valid email address is required'
        });
      }

      console.log(`🔑 Password reset OTP requested for: ${email}`);

      // Find user
      const user = await User.findOne({ email });
      if (!user) {
        console.log(`❌ No user found with email: ${email}`);
        return res.status(404).json({
          status: 'error',
          message: 'No account found with this email address'
        });
      }

      console.log(`👤 User found: ${user.firstName} ${user.lastName}`);

      // Generate OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      user.resetPasswordOTP = otp;
      user.resetPasswordOTPExpire = Date.now() + 15 * 60 * 1000; // 15 minutes

      await user.save();
      console.log(`✅ OTP ${otp} saved for ${email}`);

      try {
        // Send OTP email
        console.log(`📧 Sending OTP email to ${email}...`);
        
        await sendEmail({
          to: user.email,
          subject: 'Your Password Reset OTP - Bloom Tales',
          template: 'passwordResetOTP',
          context: {
            name: user.firstName,
            otp
          }
        });

        logEmailAttempt('Password reset OTP', user.email, true);
        console.log(`✅ OTP email sent successfully to ${email}`);
        
        const responseTime = Date.now() - startTime;
        
        res.json({
          status: 'success',
          message: 'OTP sent to your email address',
          meta: {
            responseTime: `${responseTime}ms`,
            emailMasked: user.email.replace(/(.{2})(.*)(?=@)/, (match, p1, p2) => p1 + '*'.repeat(p2.length))
          }
        });
        
      } catch (emailError) {
        logEmailAttempt('Password reset OTP', user.email, false, emailError);
        
        const responseTime = Date.now() - startTime;
        const formattedError = formatEmailError(emailError);
        
        res.status(500).json({
          status: 'error',
          message: 'Failed to send OTP email. Please try again or contact support.',
          error: formattedError,
          meta: {
            responseTime: `${responseTime}ms`,
            debug: process.env.NODE_ENV === 'development' ? {
              emailAttempted: user.email,
              fromAddress: process.env.EMAIL_FROM,
              timestamp: new Date().toISOString()
            } : undefined
          }
        });
      }
      
    } catch (error) {
      console.error('Send reset OTP error:', error);
      const responseTime = Date.now() - startTime;
      
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        meta: {
          responseTime: `${responseTime}ms`
        }
      });
    }
  },

  // ===========================
  // VERIFY RESET OTP
  // ===========================
  async verifyResetOTP(req, res) {
    try {
      const { email, otp } = req.body;

      // Validate inputs
      if (!email || !otp || otp.length !== 6) {
        return res.status(400).json({
          status: 'error',
          message: 'Valid email and 6-digit OTP are required'
        });
      }

      const user = await User.findOne({
        email,
        resetPasswordOTP: otp,
        resetPasswordOTPExpire: { $gt: Date.now() }
      });

      if (!user) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid or expired OTP. Please request a new OTP.'
        });
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      user.resetPasswordToken = resetToken;
      user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

      // Clear OTP
      user.resetPasswordOTP = undefined;
      user.resetPasswordOTPExpire = undefined;

      await user.save();

      res.json({
        status: 'success',
        message: 'OTP verified successfully',
        data: { 
          resetToken,
          expiresIn: '10 minutes'
        }
      });
      
    } catch (error) {
      console.error('Verify OTP error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // ===========================
  // RESET PASSWORD
  // ===========================
  async resetPassword(req, res) {
    try {
      const { resetToken, password } = req.body;

      // Validate inputs
      if (!resetToken || !password) {
        return res.status(400).json({
          status: 'error',
          message: 'Reset token and new password are required'
        });
      }

      if (password.length < 6) {
        return res.status(400).json({
          status: 'error',
          message: 'Password must be at least 6 characters long'
        });
      }

      const user = await User.findOne({
        resetPasswordToken: resetToken,
        resetPasswordExpire: { $gt: Date.now() }
      });

      if (!user) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid or expired reset token. Please request a new password reset.'
        });
      }

      // Update password
      user.password = password;
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;

      await user.save();

      res.json({
        status: 'success',
        message: 'Password reset successful. You can now login with your new password.'
      });
      
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // ===========================
  // FORGOT PASSWORD (LINK)
  // ===========================
  async forgotPassword(req, res) {
    const startTime = Date.now();
    
    try {
      const { email } = req.body;

      if (!email || !email.includes('@')) {
        return res.status(400).json({
          status: 'error',
          message: 'Valid email address is required'
        });
      }

      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'No account found with this email address'
        });
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      user.resetPasswordToken = resetToken;
      user.resetPasswordExpire = Date.now() + 60 * 60 * 1000; // 1 hour

      await user.save();

      try {
        // Send reset link email
        const resetUrl = `${process.env.FRONTEND_URL.replace(/\/$/, '')}/reset-password/${resetToken}`;
        
        await sendEmail({
          to: user.email,
          subject: 'Reset Your Password - Bloom Tales',
          template: 'passwordReset',
          context: {
            name: user.firstName,
            resetUrl
          }
        });

        logEmailAttempt('Password reset link', user.email, true);
        
        const responseTime = Date.now() - startTime;
        
        res.json({
          status: 'success',
          message: 'Password reset link sent to your email',
          meta: {
            responseTime: `${responseTime}ms`,
            expiresIn: '1 hour'
          }
        });
        
      } catch (emailError) {
        logEmailAttempt('Password reset link', user.email, false, emailError);
        
        const responseTime = Date.now() - startTime;
        
        res.status(500).json({
          status: 'error',
          message: 'Failed to send password reset email. Please try again.',
          error: formatEmailError(emailError),
          meta: {
            responseTime: `${responseTime}ms`
          }
        });
      }
      
    } catch (error) {
      console.error('Forgot password error:', error);
      const responseTime = Date.now() - startTime;
      
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        meta: {
          responseTime: `${responseTime}ms`
        }
      });
    }
  },

  // ===========================
  // VERIFY EMAIL
  // ===========================
  async verifyEmail(req, res) {
    try {
      const { token } = req.params;

      if (!token) {
        return res.status(400).json({
          status: 'error',
          message: 'Verification token is required'
        });
      }

      const user = await User.findOne({
        emailVerificationToken: token,
        emailVerificationExpire: { $gt: Date.now() }
      });

      if (!user) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid or expired verification token'
        });
      }

      // Mark email as verified
      user.isEmailVerified = true;
      user.emailVerificationToken = undefined;
      user.emailVerificationExpire = undefined;

      await user.save();

      res.json({
        status: 'success',
        message: 'Email verified successfully. You can now login to your account.'
      });
      
    } catch (error) {
      console.error('Verify email error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // ===========================
  // RESEND VERIFICATION
  // ===========================
  async resendVerification(req, res) {
    const startTime = Date.now();
    
    try {
      const { email } = req.body;

      if (!email || !email.includes('@')) {
        return res.status(400).json({
          status: 'error',
          message: 'Valid email address is required'
        });
      }

      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'No account found with this email address'
        });
      }

      if (user.isEmailVerified) {
        return res.status(400).json({
          status: 'error',
          message: 'Email is already verified'
        });
      }

      // Generate new verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      user.emailVerificationToken = verificationToken;
      user.emailVerificationExpire = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

      await user.save();

      try {
        // Send verification email
        const verificationUrl = `${process.env.FRONTEND_URL.replace(/\/$/, '')}/verify-email/${verificationToken}`;
        
        await sendEmail({
          to: user.email,
          subject: 'Verify Your Email - Bloom Tales',
          template: 'emailVerification',
          context: {
            name: user.firstName,
            verificationUrl
          }
        });

        logEmailAttempt('Resend verification', user.email, true);
        
        const responseTime = Date.now() - startTime;
        
        res.json({
          status: 'success',
          message: 'Verification email resent successfully',
          meta: {
            responseTime: `${responseTime}ms`
          }
        });
        
      } catch (emailError) {
        logEmailAttempt('Resend verification', user.email, false, emailError);
        
        const responseTime = Date.now() - startTime;
        
        res.status(500).json({
          status: 'error',
          message: 'Failed to resend verification email',
          error: formatEmailError(emailError),
          meta: {
            responseTime: `${responseTime}ms`
          }
        });
      }
      
    } catch (error) {
      console.error('Resend verification error:', error);
      const responseTime = Date.now() - startTime;
      
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        meta: {
          responseTime: `${responseTime}ms`
        }
      });
    }
  },

  // ===========================
  // GET USER PROFILE
  // ===========================
  async getMe(req, res) {
    try {
      const user = await User.findById(req.user.id).select('-password -resetPasswordToken -resetPasswordExpire');

      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }

      res.json({
        status: 'success',
        data: { user }
      });
      
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // ===========================
  // UPDATE PASSWORD
  // ===========================
  async updatePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;

      // Validate inputs
      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          status: 'error',
          message: 'Current password and new password are required'
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          status: 'error',
          message: 'New password must be at least 6 characters long'
        });
      }

      if (currentPassword === newPassword) {
        return res.status(400).json({
          status: 'error',
          message: 'New password must be different from current password'
        });
      }

      const user = await User.findById(req.user.id).select('+password');
      const isValid = await user.comparePassword(currentPassword);

      if (!isValid) {
        return res.status(400).json({
          status: 'error',
          message: 'Current password is incorrect'
        });
      }

      // Update password
      user.password = newPassword;
      await user.save();

      res.json({
        status: 'success',
        message: 'Password updated successfully'
      });
      
    } catch (error) {
      console.error('Update password error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // ===========================
  // LOGOUT
  // ===========================
  async logout(req, res) {
    try {
      res.json({
        status: 'success',
        message: 'Logged out successfully'
      });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // ===========================
  // REFRESH TOKEN
  // ===========================
  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return res.status(401).json({
          status: 'error',
          message: 'Refresh token is required'
        });
      }

      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
      const user = await User.findById(decoded.userId);

      if (!user || !user.isActive) {
        return res.status(401).json({
          status: 'error',
          message: 'Invalid refresh token'
        });
      }

      if (!user.isEmailVerified) {
        return res.status(401).json({
          status: 'error',
          message: 'Email verification required',
          code: 'EMAIL_NOT_VERIFIED'
        });
      }

      const tokens = generateTokens(user._id);

      res.json({
        status: 'success',
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken
        }
      });
    } catch (error) {
      console.error('Refresh token error:', error);
      res.status(401).json({
        status: 'error',
        message: 'Invalid or expired refresh token',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
};

module.exports = authController;