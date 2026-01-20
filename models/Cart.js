const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  size: {
    type: String,
    required: false
  },
  color: {
    name: { type: String },
    hexCode: { type: String }
  },
  material: {
    type: String,
    required: false
  }
}, { _id: true });

const cartSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [cartItemSchema],
  totalItems: {
    type: Number,
    default: 0
  },
  totalAmount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Calculate totals before saving
cartSchema.pre('save', async function(next) {
  try {
    if (this.items && this.items.length > 0) {
      // Filter out any items with null/undefined product references before populating
      this.items = this.items.filter(item => item.productId && item.product);
      
      if (this.items.length > 0) {
        // Populate products to calculate totals
        await this.populate('items.product');
        
        this.totalItems = this.items.reduce((total, item) => total + (item.quantity || 0), 0);
        this.totalAmount = this.items.reduce((total, item) => {
          const price = item.product && item.product.price ? item.product.price : 0;
          return total + (price * (item.quantity || 0));
        }, 0);
      } else {
        this.totalItems = 0;
        this.totalAmount = 0;
      }
    } else {
      this.totalItems = 0;
      this.totalAmount = 0;
    }
    next();
  } catch (error) {
    console.error('Error in cart pre-save hook:', error);
    next(error);
  }
});

module.exports = mongoose.model('Cart', cartSchema);