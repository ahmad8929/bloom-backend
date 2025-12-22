// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot be more than 50 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot be more than 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false // Don't include password in queries by default
  },
  phone: {
    type: String,
    trim: true
  },
  age: {
    type: Number,
    min: [13, 'Age must be at least 13'],
    max: [120, 'Age must be less than 120']
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other', 'prefer-not-to-say'],
    trim: true
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  emailVerificationExpire: Date,
  
  // Password reset fields
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  
  // NEW: OTP fields for password reset
  resetPasswordOTP: String,
  resetPasswordOTPExpire: Date,
  
  // Login attempt tracking
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,
  lastLogin: Date,
  
  // Profile fields
  avatar: String,
  bio: String,
  dateOfBirth: Date,
  // Legacy single address (kept for backward compatibility)
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  // Multiple addresses array
  addresses: [{
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      default: () => new mongoose.Types.ObjectId()
    },
    fullName: {
      type: String,
      required: [true, 'Full name is required for address'],
      trim: true
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required for address'],
      trim: true
    },
    street: {
      type: String,
      required: [true, 'Street address is required'],
      trim: true
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true
    },
    state: {
      type: String,
      required: [true, 'State is required'],
      trim: true
    },
    zipCode: {
      type: String,
      required: [true, 'ZIP code is required'],
      trim: true
    },
    country: {
      type: String,
      default: 'India',
      trim: true
    },
    nearbyPlaces: {
      type: String,
      trim: true
    },
    isDefault: {
      type: Boolean,
      default: false
    },
    addressType: {
      type: String,
      enum: ['home', 'work', 'other'],
      default: 'home'
    }
  }],
  
  // Preferences
  preferences: {
    newsletter: {
      type: Boolean,
      default: true
    },
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      push: {
        type: Boolean,
        default: true
      }
    },
    privacy: {
      profileVisibility: {
        type: String,
        enum: ['public', 'private', 'friends'],
        default: 'public'
      }
    }
  }
}, {
  timestamps: true
});

// Virtual for account lock status
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) return next();
  
  try {
    // Hash password with cost of 12
    const hashedPassword = await bcrypt.hash(this.password, 12);
    this.password = hashedPassword;
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to check password
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw error;
  }
};

// Instance method to generate password reset token
userSchema.methods.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  this.resetPasswordToken = resetToken;
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  return resetToken;
};

// Instance method to generate email verification token
userSchema.methods.createEmailVerificationToken = function() {
  const verificationToken = crypto.randomBytes(32).toString('hex');
  
  this.emailVerificationToken = verificationToken;
  this.emailVerificationExpire = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  
  return verificationToken;
};

// Instance method to generate OTP
userSchema.methods.createPasswordResetOTP = function() {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  
  this.resetPasswordOTP = otp;
  this.resetPasswordOTPExpire = Date.now() + 15 * 60 * 1000; // 15 minutes
  
  return otp;
};

// Static method to find user by reset token
userSchema.statics.findByResetToken = function(token) {
  return this.findOne({
    resetPasswordToken: token,
    resetPasswordExpire: { $gt: Date.now() }
  });
};

// Static method to find user by OTP
userSchema.statics.findByOTP = function(email, otp) {
  return this.findOne({
    email: email,
    resetPasswordOTP: otp,
    resetPasswordOTPExpire: { $gt: Date.now() }
  });
};

// Index for email (unique)
userSchema.index({ email: 1 });

// Index for reset tokens (compound index for efficient queries)
userSchema.index({ resetPasswordToken: 1, resetPasswordExpire: 1 });
userSchema.index({ resetPasswordOTP: 1, resetPasswordOTPExpire: 1 });
userSchema.index({ emailVerificationToken: 1, emailVerificationExpire: 1 });

// Index for login attempts and lock
userSchema.index({ email: 1, lockUntil: 1 });

module.exports = mongoose.model('User', userSchema);