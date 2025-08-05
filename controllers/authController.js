const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const { sendEmail } = require('../utils/email');
const { generateTokens } = require('../utils/jwt');

const authController = {
  // Signup
  async signup(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { firstName, lastName, email, password, phone } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          status: 'error',
          message: 'User already exists with this email'
        });
      }

      // Create new user
      const user = new User({
        firstName,
        lastName,
        email,
        password,
        phone
      });

      // Generate email verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      user.emailVerificationToken = verificationToken;
      user.emailVerificationExpire = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

      await user.save();

      // Send verification email
      try {
        const verificationUrl = `${process.env.FRONTEND_URL.replace(/\/$/, '')}/verify-email/${verificationToken}`;
        await sendEmail({
          to: user.email,
          subject: 'Email Verification',
          template: 'emailVerification',
          context: {
            name: user.firstName,
            verificationUrl
          }
        });
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
        // Don't fail the signup if email fails, but log it
      }

      // Don't generate tokens until email is verified
      res.status(201).json({
        status: 'success',
        message: 'User created successfully. Please check your email to verify your account before logging in.',
        data: {
          user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
            isEmailVerified: user.isEmailVerified
          }
        }
      });
    } catch (error) {
      console.error('Signup error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  // Login - FIXED to require email verification
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

      // Find user and include password
      const user = await User.findOne({ email }).select('+password');
      if (!user) {
        return res.status(401).json({
          status: 'error',
          message: 'Invalid credentials'
        });
      }

      // Check if account is locked
      if (user.isLocked && user.isLocked()) {
        return res.status(423).json({
          status: 'error',
          message: 'Account temporarily locked due to too many failed login attempts'
        });
      }

      // Check if account is active
      if (!user.isActive) {
        return res.status(401).json({
          status: 'error',
          message: 'Account is not active'
        });
      }

      // *** CRITICAL FIX: Check if email is verified ***
      if (!user.isEmailVerified) {
        return res.status(401).json({
          status: 'error',
          message: 'Please verify your email address before logging in. Check your inbox for the verification link.',
          code: 'EMAIL_NOT_VERIFIED'
        });
      }

      // Verify password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        // Increment login attempts
        user.loginAttempts = (user.loginAttempts || 0) + 1;
        if (user.loginAttempts >= 5) {
          user.lockUntil = Date.now() + 30 * 60 * 1000; // Lock for 30 minutes
        }
        await user.save();

        return res.status(401).json({
          status: 'error',
          message: 'Invalid credentials'
        });
      }

      // Reset login attempts and update last login
      user.loginAttempts = 0;
      user.lockUntil = undefined;
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
        error: error.message
      });
    }
  },

  // Logout
  async logout(req, res) {
    try {
      // In a real app, you might want to blacklist the token
      res.json({
        status: 'success',
        message: 'Logout successful'
      });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  // Refresh Token - Also check email verification
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

      // Check if email is still verified
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
          user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
            isEmailVerified: user.isEmailVerified
          },
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken
        }
      });
    } catch (error) {
      console.error('Refresh token error:', error);
      res.status(401).json({
        status: 'error',
        message: 'Invalid refresh token',
        error: error.message
      });
    }
  },

  // NEW: Send Password Reset OTP
  async sendResetOTP(req, res) {
    try {
      const { email } = req.body;

      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'No user found with this email address'
        });
      }

      // Generate 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Store OTP with expiration (15 minutes)
      user.resetPasswordOTP = otp;
      user.resetPasswordOTPExpire = Date.now() + 15 * 60 * 1000; // 15 minutes
      
      await user.save();

      // Send OTP email
      try {
        await sendEmail({
          to: user.email,
          subject: 'Password Reset OTP',
          template: 'passwordResetOTP',
          context: {
            name: user.firstName,
            otp: otp
          }
        });

        res.json({
          status: 'success',
          message: 'Password reset OTP sent to your email address'
        });
      } catch (emailError) {
        console.error('OTP email failed:', emailError);
        res.status(500).json({
          status: 'error',
          message: 'Failed to send OTP email. Please try again later.'
        });
      }
    } catch (error) {
      console.error('Send reset OTP error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  // NEW: Verify OTP
  async verifyResetOTP(req, res) {
    try {
      const { email, otp } = req.body;

      if (!email || !otp) {
        return res.status(400).json({
          status: 'error',
          message: 'Email and OTP are required'
        });
      }

      const user = await User.findOne({
        email: email,
        resetPasswordOTP: otp,
        resetPasswordOTPExpire: { $gt: Date.now() }
      });

      if (!user) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid or expired OTP'
        });
      }

      // Generate a temporary token for password reset (valid for 10 minutes)
      const resetToken = crypto.randomBytes(32).toString('hex');
      user.resetPasswordToken = resetToken;
      user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
      
      // Clear OTP fields
      user.resetPasswordOTP = undefined;
      user.resetPasswordOTPExpire = undefined;
      
      await user.save();

      res.json({
        status: 'success',
        message: 'OTP verified successfully',
        data: {
          resetToken: resetToken
        }
      });
    } catch (error) {
      console.error('Verify OTP error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  // UPDATED: Reset Password with Token (after OTP verification)
  async resetPassword(req, res) {
    try {
      const { resetToken, password } = req.body;

      if (!resetToken || !password) {
        return res.status(400).json({
          status: 'error',
          message: 'Reset token and password are required'
        });
      }

      if (password.length < 8) {
        return res.status(400).json({
          status: 'error',
          message: 'Password must be at least 8 characters long'
        });
      }

      const user = await User.findOne({
        resetPasswordToken: resetToken,
        resetPasswordExpire: { $gt: Date.now() }
      });

      if (!user) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid or expired reset token'
        });
      }

      user.password = password;
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;

      await user.save();

      res.json({
        status: 'success',
        message: 'Password reset successful'
      });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  // Keep existing forgot password for backward compatibility (if needed)
  async forgotPassword(req, res) {
    try {
      const { email } = req.body;

      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'No user found with this email address'
        });
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      user.resetPasswordToken = resetToken;
      user.resetPasswordExpire = Date.now() + 60 * 60 * 1000; // 1 hour

      await user.save();

      // Send reset email
      try {
        const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
        await sendEmail({
          to: user.email,
          subject: 'Password Reset Request',
          template: 'passwordReset',
          context: {
            name: user.firstName,
            resetUrl
          }
        });

        res.json({
          status: 'success',
          message: 'Password reset email sent successfully'
        });
      } catch (emailError) {
        console.error('Password reset email failed:', emailError);
        res.status(500).json({
          status: 'error',
          message: 'Failed to send password reset email. Please try again later.'
        });
      }
    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  // Verify Email
  async verifyEmail(req, res) {
    try {
      const { token } = req.params;

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

      user.isEmailVerified = true;
      user.emailVerificationToken = undefined;
      user.emailVerificationExpire = undefined;

      await user.save();

      res.json({
        status: 'success',
        message: 'Email verified successfully! You can now log in to your account.'
      });
    } catch (error) {
      console.error('Verify email error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  // Resend Verification
  async resendVerification(req, res) {
    try {
      const { email } = req.body;

      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
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

      // Send verification email
      try {
        const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${verificationToken}`;
        await sendEmail({
          to: user.email,
          subject: 'Email Verification',
          template: 'emailVerification',
          context: {
            name: user.firstName,
            verificationUrl
          }
        });

        res.json({
          status: 'success',
          message: 'Verification email sent successfully'
        });
      } catch (emailError) {
        console.error('Resend verification email failed:', emailError);
        res.status(500).json({
          status: 'error',
          message: 'Failed to send verification email. Please try again later.'
        });
      }
    } catch (error) {
      console.error('Resend verification error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Get Me
  async getMe(req, res) {
    try {
      const user = await User.findById(req.user.id);

      res.json({
        status: 'success',
        data: {
          user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
            isEmailVerified: user.isEmailVerified,
            createdAt: user.createdAt
          }
        }
      });
    } catch (error) {
      console.error('Get me error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Update Password
  async updatePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;

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

      const user = await User.findById(req.user.id).select('+password');

      const isCurrentPasswordValid = await user.comparePassword(currentPassword);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({
          status: 'error',
          message: 'Current password is incorrect'
        });
      }

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
        message: 'Internal server error'
      });
    }
  }
};

module.exports = authController;