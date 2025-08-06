// models/Product.js
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: 200
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true
  },
  description: {
    type: String,
    required: [true, 'Product description is required'],
    maxlength: 2000
  },
  price: {
    type: Number,
    required: [true, 'Product price is required'],
    min: 0
  },
  comparePrice: {
    type: Number,
    min: 0
  },
  size: {
    type: String,
    enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    required: [true, 'Product size is required']
  },
  material: {
    type: String,
    required: [true, 'Product material is required'],
    trim: true
  },
  // NEW: Category field
  category: {
    type: String,
    enum: ['Saree', 'Kurti', 'Suite', 'Night Dress', 'Skirt', 'Top'],
    required: [true, 'Product category is required'],
    trim: true
  },
  careInstructions: {
    type: String,
    required: [true, 'Care instructions are required']
  },
  isNewArrival: {
    type: Boolean,
    default: false
  },
  isSale: {
    type: Boolean,
    default: false
  },
  images: [{
    url: { type: String, required: true },
    alt: String,
    isPrimary: { type: Boolean, default: false }
  }],
  colors: [{
    name: String,
    hexCode: String
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create slug from name
productSchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.slug = this.name.toLowerCase().replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-');
  }
  next();
});

// Virtual for discount percentage
productSchema.virtual('discountPercentage').get(function() {
  if (this.comparePrice && this.comparePrice > this.price) {
    return Math.round(((this.comparePrice - this.price) / this.comparePrice) * 100);
  }
  return 0;
});

// Search index
productSchema.index({ name: 'text', description: 'text', material: 'text' });
productSchema.index({ price: 1 });
productSchema.index({ size: 1 });
productSchema.index({ material: 1 });
productSchema.index({ category: 1 }); // NEW: Category index
productSchema.index({ isNewArrival: 1 });
productSchema.index({ isSale: 1 });
productSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Product', productSchema);