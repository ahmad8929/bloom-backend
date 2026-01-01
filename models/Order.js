const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    unique: true // REMOVE THIS LINE - it creates duplicate index
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    price: {
      type: Number,
      required: true
    },
    size: String,
    color: {
      name: { type: String },
      hexCode: { type: String }
    },
    name: String,
    image: String
  }],
  shippingAddress: {
    fullName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    nearbyPlaces: String
  },
  paymentMethod: {
    type: String,
    enum: ['upi', 'card', 'cod'],
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentDetails: {
    payerName: String,
    transactionId: String,
    paymentDate: String,
    paymentTime: String,
    amount: Number,
    paymentProof: {
      url: String,
      publicId: String,
      uploadedAt: { type: Date, default: Date.now }
    }
  },
  status: {
    type: String,
    enum: ['pending', 'awaiting_approval', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'rejected'],
    default: 'pending'
  },
  adminApproval: {
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedAt: Date,
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    rejectedAt: Date,
    remarks: String
  },
  subtotal: {
    type: Number,
    required: true
  },
  tax: {
    type: Number,
    default: 0
  },
  shipping: {
    type: Number,
    default: 0
  },
  discount: {
    type: Number,
    default: 0
  },
  advancePayment: {
    type: Number,
    default: 0
  },
  totalAmount: {
    type: Number,
    required: true
  },
  couponCode: String,
  notes: String,
  trackingNumber: String,
  estimatedDelivery: Date,
  deliveredAt: Date,
  cancelledAt: Date,
  rejectedAt: Date,
  cancelReason: String,
  rejectReason: String,
  timeline: [{
    status: String,
    note: String,
    timestamp: { type: Date, default: Date.now },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }]
}, {
  timestamps: true
});

// Generate order number before saving
orderSchema.pre('save', function(next) {
  if (this.isNew && !this.orderNumber) {
    this.orderNumber = `BT-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
  }
  next();
});

// Virtual for user order status categorization
orderSchema.virtual('userOrderCategory').get(function() {
  if (['cancelled', 'rejected'].includes(this.status)) {
    return 'cancelled';
  } else if (['delivered'].includes(this.status)) {
    return 'completed';
  } else {
    return 'ongoing';
  }
});

// Indexes - Define all indexes here (no duplicates)
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ 'adminApproval.status': 1 });
orderSchema.index({ orderNumber: 1 }, { unique: true }); // Only define unique index here
orderSchema.index({ createdAt: -1 });
orderSchema.index({ paymentStatus: 1 });

module.exports = mongoose.model('Order', orderSchema);