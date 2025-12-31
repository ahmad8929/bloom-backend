const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const { sendEmail } = require('../utils/email');
const { generateTokens } = require('../utils/jwt');

/**
 * Helper to return full email / SMTP errors
 */
function formatEmailError(error) {
  return {
    message: error.message,
    name: error.name,
    code: error.code,
    response: error.response,
    responseCode: error.responseCode,
    stack: error.stack
  };
}

const authController = {

  // ===========================
  // SIGNUP
  // ===========================
  async signup(req, res) {
    try {
      // Validation removed - proceed directly
      const { firstName, lastName, email, password, phone } = req.body;

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          status: 'error',
          message: 'User already exists with this email'
        });
      }

      const user = new User({
        firstName,
        lastName,
        email,
        password,
        phone
      });

      // TEMPORARY: Email verification disabled - auto-verify and auto-login
      // TODO: Re-enable email verification when email functionality is fixed
      // const verificationToken = crypto.randomBytes(32).toString('hex');
      // user.emailVerificationToken = verificationToken;
      // user.emailVerificationExpire = Date.now() + 24 * 60 * 60 * 1000;
      
      // Auto-verify email (temporary)
      user.isEmailVerified = true;
      user.emailVerificationToken = undefined;
      user.emailVerificationExpire = undefined;

      await user.save();

      // TEMPORARY: Email sending disabled
      // TODO: Re-enable email sending when email functionality is fixed
      // try {
      //   const verificationUrl =
      //     `${process.env.FRONTEND_URL.replace(/\/$/, '')}/verify-email/${verificationToken}`;
      //
      //   await sendEmail({
      //     to: user.email,
      //     subject: 'Email Verification',
      //     template: 'emailVerification',
      //     context: {
      //       name: user.firstName,
      //       verificationUrl
      //     }
      //   });
      // } catch (emailError) {
      //   console.error('Signup verification email failed:', emailError);
      //   return res.status(500).json({
      //     status: 'error',
      //     message: 'Failed to send verification email',
      //     error: formatEmailError(emailError)
      //   });
      // }

      // Generate tokens for auto-login (temporary)
      const { accessToken, refreshToken } = generateTokens(user._id);

      res.status(201).json({
        status: 'success',
        message: 'Account created successfully. You are now logged in.',
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
      console.error('Signup error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error
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

      const user = await User.findOne({ email }).select('+password');
      if (!user) {
        return res.status(401).json({
          status: 'error',
          message: 'Invalid credentials'
        });
      }

      if (!user.isActive) {
        return res.status(401).json({
          status: 'error',
          message: 'Account is not active'
        });
      }

      // TEMPORARY: Email verification check disabled
      // TODO: Re-enable email verification check when email functionality is fixed
      // if (!user.isEmailVerified) {
      //   return res.status(401).json({
      //     status: 'error',
      //     message: 'Please verify your email before login',
      //     code: 'EMAIL_NOT_VERIFIED'
      //   });
      // }

      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        return res.status(401).json({
          status: 'error',
          message: 'Invalid credentials'
        });
      }

      user.lastLogin = new Date();
      await user.save();

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
        error
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
        message: 'Logout successful'
      });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error
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
          message: 'Refresh token required'
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

      // TEMPORARY: Email verification check disabled
      // TODO: Re-enable email verification check when email functionality is fixed
      // if (!user.isEmailVerified) {
      //   return res.status(401).json({
      //     status: 'error',
      //     message: 'Email verification required',
      //     code: 'EMAIL_NOT_VERIFIED'
      //   });
      // }

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
        message: 'Invalid refresh token',
        error
      });
    }
  },

  // ===========================
  // SEND RESET OTP
  // ===========================
 // In authController.js - Updated sendResetOTP section
async sendResetOTP(req, res) {
  try {
    const { email } = req.body;
    console.log(`🔑 Reset OTP requested for: ${email}`);
    const user = await User.findOne({ email });
    if (!user) {
      console.log(`❌ No user found with email: ${email}`);
      return res.status(404).json({
        status: 'error',
        message: 'No user found with this email'
      });
    }
    console.log(`👤 User found: ${user.firstName} ${user.lastName}`);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetPasswordOTP = otp;
    user.resetPasswordOTPExpire = Date.now() + 15 * 60 * 1000;
    await user.save();
    console.log(`✅ OTP ${otp} saved for user ${email}`);

    try {
      console.log(`📧 Sending OTP email to ${email}...`);
      await sendEmail({
        to: user.email,
        subject: 'Password Reset OTP - Bloom Tales',
        template: 'passwordResetOTP',
        context: {
          name: user.firstName,
          otp
        }
      });

      console.log(`✅ OTP email sent successfully to ${email}`);
      
      res.json({
        status: 'success',
        message: 'OTP sent successfully'
      });
    } catch (emailError) {
      console.error('❌ OTP email failed with full error:', emailError);
      
      // Provide detailed error info in response
      const formattedError = formatEmailError(emailError);
      
      res.status(500).json({
        status: 'error',
        message: 'Failed to send OTP email',
        error: formattedError,
        // Add helpful debug info
        debug: {
          emailAttempted: user.email,
          fromAddress: process.env.EMAIL_FROM,
          mailtrapTokenExists: !!process.env.MAILTRAP_TOKEN,
          timestamp: new Date().toISOString()
        }
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
  // ===========================
  // VERIFY RESET OTP
  // ===========================
  async verifyResetOTP(req, res) {
    try {
      const { email, otp } = req.body;

      const user = await User.findOne({
        email,
        resetPasswordOTP: otp,
        resetPasswordOTPExpire: { $gt: Date.now() }
      });

      if (!user) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid or expired OTP'
        });
      }

      const resetToken = crypto.randomBytes(32).toString('hex');
      user.resetPasswordToken = resetToken;
      user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

      user.resetPasswordOTP = undefined;
      user.resetPasswordOTPExpire = undefined;

      await user.save();

      res.json({
        status: 'success',
        message: 'OTP verified',
        data: { resetToken }
      });
    } catch (error) {
      console.error('Verify OTP error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error
      });
    }
  },

  // ===========================
  // RESET PASSWORD
  // ===========================
  async resetPassword(req, res) {
    try {
      const { resetToken, password } = req.body;

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
        error
      });
    }
  },

  // ===========================
  // FORGOT PASSWORD (LINK)
  // ===========================
  async forgotPassword(req, res) {
    try {
      const { email } = req.body;

      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'No user found with this email'
        });
      }

      const resetToken = crypto.randomBytes(32).toString('hex');
      user.resetPasswordToken = resetToken;
      user.resetPasswordExpire = Date.now() + 60 * 60 * 1000;

      await user.save();

      try {
        const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
        await sendEmail({
          to: user.email,
          subject: 'Password Reset',
          template: 'passwordReset',
          context: {
            name: user.firstName,
            resetUrl
          }
        });

        res.json({
          status: 'success',
          message: 'Password reset email sent'
        });
      } catch (emailError) {
        console.error('Password reset email failed:', emailError);
        res.status(500).json({
          status: 'error',
          message: 'Failed to send password reset email',
          error: formatEmailError(emailError)
        });
      }
    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error
      });
    }
  },

  // ===========================
  // VERIFY EMAIL
  // ===========================
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
        message: 'Email verified successfully'
      });
    } catch (error) {
      console.error('Verify email error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error
      });
    }
  },

  // ===========================
  // RESEND VERIFICATION
  // ===========================
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
          message: 'Email already verified'
        });
      }

      const verificationToken = crypto.randomBytes(32).toString('hex');
      user.emailVerificationToken = verificationToken;
      user.emailVerificationExpire = Date.now() + 24 * 60 * 60 * 1000;

      await user.save();

      try {
        const verificationUrl =
          `${process.env.FRONTEND_URL}/verify-email/${verificationToken}`;

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
          message: 'Verification email resent'
        });
      } catch (emailError) {
        console.error('Resend verification email failed:', emailError);
        res.status(500).json({
          status: 'error',
          message: 'Failed to send verification email',
          error: formatEmailError(emailError)
        });
      }
    } catch (error) {
      console.error('Resend verification error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error
      });
    }
  },

  // ===========================
  // GET ME
  // ===========================
  async getMe(req, res) {
    try {
      const user = await User.findById(req.user.id)
        .select('-password -resetPasswordToken -resetPasswordExpire -resetPasswordOTP -resetPasswordOTPExpire -emailVerificationToken -emailVerificationExpire');

      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }

      res.json({
        status: 'success',
        data: {
          user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phone: user.phone,
            age: user.age,
            gender: user.gender,
            role: user.role,
            isEmailVerified: user.isEmailVerified,
            avatar: user.avatar,
            bio: user.bio,
            dateOfBirth: user.dateOfBirth,
            lastLogin: user.lastLogin,
            addresses: user.addresses || [],
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
          }
        }
      });
    } catch (error) {
      console.error('Get me error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error
      });
    }
  },

  // ===========================
  // UPDATE PASSWORD
  // ===========================
  async updatePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;

      const user = await User.findById(req.user.id).select('+password');
      const isValid = await user.comparePassword(currentPassword);

      if (!isValid) {
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
        message: 'Internal server error',
        error
      });
    }
  }
};

module.exports = authController;