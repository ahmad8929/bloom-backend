const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true
  },
  description: {
    type: String,
    trim: true
  },
  discountType: {
    type: String,
    enum: ['percentage', 'fixed'],
    required: true,
    default: 'percentage'
  },
  discountValue: {
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: function(value) {
        if (this.discountType === 'percentage') {
          return value > 0 && value <= 100;
        }
        return value > 0;
      },
      message: 'Discount value must be between 1-100 for percentage, or greater than 0 for fixed'
    }
  },
  minPurchaseAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  maxDiscountAmount: {
    type: Number,
    default: null,
    min: 0
  },
  validFrom: {
    type: Date,
    required: true,
    default: Date.now
  },
  validUntil: {
    type: Date,
    required: true
  },
  usageLimit: {
    type: Number,
    default: null, // null means unlimited
    min: 1
  },
  usageCount: {
    type: Number,
    default: 0,
    min: 0
  },
  userUsageLimit: {
    type: Number,
    default: 1, // How many times a single user can use this coupon
    min: 1
  },
  isActive: {
    type: Boolean,
    default: true
  },
  applicableCategories: [{
    type: String
  }],
  applicableProducts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  usageHistory: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order'
    },
    discountAmount: {
      type: Number,
      required: true
    },
    orderAmount: {
      type: Number,
      required: true
    },
    usedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Indexes
couponSchema.index({ code: 1 });
couponSchema.index({ isActive: 1, validFrom: 1, validUntil: 1 });
couponSchema.index({ createdAt: -1 });

// Virtual for total discount given
couponSchema.virtual('totalDiscountGiven').get(function() {
  return this.usageHistory.reduce((total, usage) => total + usage.discountAmount, 0);
});

// Method to check if coupon is valid
couponSchema.methods.isValid = function(userId = null) {
  const now = new Date();
  
  // Check if coupon is active
  if (!this.isActive) {
    return { valid: false, message: 'Coupon is not active' };
  }
  
  // Check validity dates
  if (now < this.validFrom) {
    return { valid: false, message: 'Coupon is not yet valid' };
  }
  
  if (now > this.validUntil) {
    return { valid: false, message: 'Coupon has expired' };
  }
  
  // Check usage limit
  if (this.usageLimit && this.usageCount >= this.usageLimit) {
    return { valid: false, message: 'Coupon usage limit reached' };
  }
  
  // Check user-specific usage limit
  if (userId) {
    const userUsageCount = this.usageHistory.filter(
      usage => usage.userId && usage.userId.toString() === userId.toString()
    ).length;
    
    if (userUsageCount >= this.userUsageLimit) {
      return { valid: false, message: 'You have reached the maximum usage limit for this coupon' };
    }
  }
  
  return { valid: true };
};

// Method to calculate discount
couponSchema.methods.calculateDiscount = function(subtotal) {
  if (subtotal < this.minPurchaseAmount) {
    return {
      valid: false,
      message: `Minimum purchase amount of ₹${this.minPurchaseAmount} required`
    };
  }
  
  let discountAmount = 0;
  
  if (this.discountType === 'percentage') {
    discountAmount = (subtotal * this.discountValue) / 100;
    
    // Apply max discount limit if set
    if (this.maxDiscountAmount && discountAmount > this.maxDiscountAmount) {
      discountAmount = this.maxDiscountAmount;
    }
  } else {
    // Fixed discount
    discountAmount = this.discountValue;
    
    // Don't allow discount to exceed subtotal
    if (discountAmount > subtotal) {
      discountAmount = subtotal;
    }
  }
  
  return {
    valid: true,
    discountAmount: Math.round(discountAmount * 100) / 100 // Round to 2 decimal places
  };
};

// Pre-save hook to ensure code is uppercase
couponSchema.pre('save', function(next) {
  if (this.isModified('code')) {
    this.code = this.code.toUpperCase().trim();
  }
  next();
});

module.exports = mongoose.model('Coupon', couponSchema);




