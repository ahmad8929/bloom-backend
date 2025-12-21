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
  // Legacy size field (kept for backward compatibility, optional now)
  size: {
    type: String,
    enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    required: false
  },
  material: {
    type: String,
    required: [true, 'Product material is required'],
    trim: true
  },
  // NEW: Category field
  category: {
    type: String,
    enum: ['Cordset', 'Anarkali', 'Suite', 'Kurti', 'Saree', 'Lehenga', 'Western Dress'],
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
  // Fixed color set - product has one color from predefined options
  color: {
    name: {
      type: String,
      enum: ['Red', 'Blue', 'Black', 'White', 'Green', 'Pink', 'Yellow'],
      required: false
    },
    hexCode: {
      type: String,
      enum: ['#EF4444', '#3B82F6', '#000000', '#FFFFFF', '#10B981', '#EC4899', '#FBBF24'],
      required: false
    }
  },
  // Legacy colors array for backward compatibility
  colors: [{
    name: String,
    hexCode: String
  }],
  // Product variants: size-based with individual stock quantities
  variants: [{
    size: {
      type: String,
      enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
      required: true
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    sku: {
      type: String,
      trim: true
    }
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

// Virtual for total stock across all variants
productSchema.virtual('totalStock').get(function() {
  if (this.variants && this.variants.length > 0) {
    return this.variants.reduce((total, variant) => total + (variant.stock || 0), 0);
  }
  return 0;
});

// Virtual for available sizes (from variants)
productSchema.virtual('availableSizes').get(function() {
  if (this.variants && this.variants.length > 0) {
    const sizes = new Set();
    this.variants.forEach(variant => {
      if (variant.stock > 0) {
        sizes.add(variant.size);
      }
    });
    return Array.from(sizes);
  }
  // Fallback to legacy size field
  if (this.size) {
    return [this.size];
  }
  return [];
});

// Instance method to get stock for a specific size
productSchema.methods.getVariantStock = function(size) {
  if (!this.variants || this.variants.length === 0) {
    return null;
  }
  
  const variant = this.variants.find(v => v.size === size);
  return variant ? variant.stock : 0;
};

// Instance method to check if size is available
productSchema.methods.isSizeAvailable = function(size) {
  const stock = this.getVariantStock(size);
  return stock !== null && stock > 0;
};

// Instance method to get all available sizes with stock
productSchema.methods.getAvailableSizes = function() {
  if (!this.variants || this.variants.length === 0) {
    return [];
  }
  
  return this.variants
    .filter(v => v.stock > 0)
    .map(v => ({
      size: v.size,
      stock: v.stock,
      sku: v.sku
    }));
};

// Search index
productSchema.index({ name: 'text', description: 'text', material: 'text' });
productSchema.index({ price: 1 });
productSchema.index({ size: 1 });
productSchema.index({ material: 1 });
productSchema.index({ category: 1 }); // NEW: Category index
productSchema.index({ isNewArrival: 1 });
productSchema.index({ isSale: 1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ 'variants.size': 1 });
productSchema.index({ 'variants.stock': 1 });
productSchema.index({ 'color.name': 1 });

module.exports = mongoose.model('Product', productSchema);