const Product = require('../models/Product');
const Category = require('../models/Category');
const { uploadToCloudinary } = require('../utils/cloudinary');

const productController = {
  // Get all products with filtering, sorting, and pagination
  async getProducts(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        sort = '-createdAt',
        category,
        minPrice,
        maxPrice,
        brand,
        rating,
        status = 'active',
        featured,
        search
      } = req.query;

      // Build filter object
      const filter = { status };

      if (category) filter.category = category;
      if (brand) filter.brand = { $regex: brand, $options: 'i' };
      if (featured !== undefined) filter.featured = featured === 'true';
      
      if (minPrice || maxPrice) {
        filter.price = {};
        if (minPrice) filter.price.$gte = Number(minPrice);
        if (maxPrice) filter.price.$lte = Number(maxPrice);
      }

      if (rating) {
        filter['rating.average'] = { $gte: Number(rating) };
      }

      if (search) {
        filter.$text = { $search: search };
      }

      // Calculate pagination
      const skip = (page - 1) * limit;
      const total = await Product.countDocuments(filter);
      const totalPages = Math.ceil(total / limit);

      // Get products
      const products = await Product.find(filter)
        .populate('category', 'name slug')
        .sort(sort)
        .skip(skip)
        .limit(Number(limit))
        .lean();

      res.json({
        status: 'success',
        data: {
          products,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
          }
        }
      });
    } catch (error) {
      console.error('Get products error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Get single product
  async getProduct(req, res) {
    try {
      const product = await Product.findById(req.params.id)
        .populate('category', 'name slug')
        .populate('subcategory', 'name slug');

      if (!product) {
        return res.status(404).json({
          status: 'error',
          message: 'Product not found'
        });
      }

      res.json({
        status: 'success',
        data: { product }
      });
    } catch (error) {
      console.error('Get product error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Create product (Admin only)
  async createProduct(req, res) {
    try {
      const productData = req.body;

      // Handle image uploads
      if (req.files && req.files.length > 0) {
        const imagePromises = req.files.map(file => uploadToCloudinary(file.buffer, 'products'));
        const uploadedImages = await Promise.all(imagePromises);
        
        productData.images = uploadedImages.map((img, index) => ({
          url: img.secure_url,
          alt: productData.name,
          isPrimary: index === 0
        }));
      }

      // Generate SKU if not provided
      if (!productData.sku) {
        productData.sku = `SKU-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
      }

      const product = new Product(productData);
      await product.save();

      // Update category product count
      await Category.findByIdAndUpdate(
        product.category,
        { $inc: { productCount: 1 } }
      );

      res.status(201).json({
        status: 'success',
        message: 'Product created successfully',
        data: { product }
      });
    } catch (error) {
      console.error('Create product error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Update product (Admin only)
  async updateProduct(req, res) {
    try {
      const productData = req.body;

      // Handle new image uploads
      if (req.files && req.files.length > 0) {
        const imagePromises = req.files.map(file => uploadToCloudinary(file.buffer, 'products'));
        const uploadedImages = await Promise.all(imagePromises);
        
        const newImages = uploadedImages.map(img => ({
          url: img.secure_url,
          alt: productData.name
        }));

        // Merge with existing images if keepExisting is true
        if (productData.keepExistingImages === 'true') {
          const existingProduct = await Product.findById(req.params.id);
          productData.images = [...existingProduct.images, ...newImages];
        } else {
          productData.images = newImages;
          if (productData.images.length > 0) {
            productData.images[0].isPrimary = true;
          }
        }
      }

      const product = await Product.findByIdAndUpdate(
        req.params.id,
        productData,
        { new: true, runValidators: true }
      ).populate('category', 'name slug');

      if (!product) {
        return res.status(404).json({
          status: 'error',
          message: 'Product not found'
        });
      }

      res.json({
        status: 'success',
        message: 'Product updated successfully',
        data: { product }
      });
    } catch (error) {
      console.error('Update product error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Delete product (Admin only)
  async deleteProduct(req, res) {
    try {
      const product = await Product.findByIdAndDelete(req.params.id);

      if (!product) {
        return res.status(404).json({
          status: 'error',
          message: 'Product not found'
        });
      }

      // Update category product count
      await Category.findByIdAndUpdate(
        product.category,
        { $inc: { productCount: -1 } }
      );

      res.json({
        status: 'success',
        message: 'Product deleted successfully'
      });
    } catch (error) {
      console.error('Delete product error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Get featured products
  async getFeaturedProducts(req, res) {
    try {
      const { limit = 10 } = req.query;

      const products = await Product.find({ 
        featured: true, 
        status: 'active' 
      })
        .populate('category', 'name slug')
        .sort('-createdAt')
        .limit(Number(limit))
        .lean();

      res.json({
        status: 'success',
        data: { products }
      });
    } catch (error) {
      console.error('Get featured products error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Search products
  async searchProducts(req, res) {
    try {
      const { q, page = 1, limit = 20 } = req.query;

      if (!q) {
        return res.status(400).json({
          status: 'error',
          message: 'Search query is required'
        });
      }

      const filter = {
        $text: { $search: q },
        status: 'active'
      };

      const skip = (page - 1) * limit;
      const total = await Product.countDocuments(filter);
      const totalPages = Math.ceil(total / limit);

      const products = await Product.find(filter, { score: { $meta: 'textScore' } })
        .populate('category', 'name slug')
        .sort({ score: { $meta: 'textScore' } })
        .skip(skip)
        .limit(Number(limit))
        .lean();

      res.json({
        status: 'success',
        data: {
          products,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
          }
        }
      });
    } catch (error) {
      console.error('Search products error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Get products by category
  async getProductsByCategory(req, res) {
    try {
      const { categoryId } = req.params;
      const { page = 1, limit = 20, sort = '-createdAt' } = req.query;

      // Check if category exists
      const category = await Category.findById(categoryId);
      if (!category) {
        return res.status(404).json({
          status: 'error',
          message: 'Category not found'
        });
      }

      // Get all subcategories
      const subcategories = await Category.find({ parent: categoryId });
      const categoryIds = [categoryId, ...subcategories.map(sub => sub._id)];

      const filter = {
        category: { $in: categoryIds },
        status: 'active'
      };

      const skip = (page - 1) * limit;
      const total = await Product.countDocuments(filter);
      const totalPages = Math.ceil(total / limit);

      const products = await Product.find(filter)
        .populate('category', 'name slug')
        .sort(sort)
        .skip(skip)
        .limit(Number(limit))
        .lean();

      res.json({
        status: 'success',
        data: {
          products,
          category,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
          }
        }
      });
    } catch (error) {
      console.error('Get products by category error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Update product status
  async updateProductStatus(req, res) {
    try {
      const { status } = req.body;

      if (!['active', 'inactive', 'draft'].includes(status)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid status value'
        });
      }

      const product = await Product.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true }
      );

      if (!product) {
        return res.status(404).json({
          status: 'error',
          message: 'Product not found'
        });
      }

      res.json({
        status: 'success',
        message: 'Product status updated successfully',
        data: { product }
      });
    } catch (error) {
      console.error('Update product status error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Toggle featured status
  async toggleFeatured(req, res) {
    try {
      const product = await Product.findById(req.params.id);

      if (!product) {
        return res.status(404).json({
          status: 'error',
          message: 'Product not found'
        });
      }

      product.featured = !product.featured;
      await product.save();

      res.json({
        status: 'success',
        message: `Product ${product.featured ? 'featured' : 'unfeatured'} successfully`,
        data: { product }
      });
    } catch (error) {
      console.error('Toggle featured error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Update inventory
  async updateInventory(req, res) {
    try {
      const { quantity, lowStockThreshold } = req.body;

      const updateData = {};
      if (quantity !== undefined) updateData.quantity = quantity;
      if (lowStockThreshold !== undefined) updateData.lowStockThreshold = lowStockThreshold;

      const product = await Product.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true }
      );

      if (!product) {
        return res.status(404).json({
          status: 'error',
          message: 'Product not found'
        });
      }

      res.json({
        status: 'success',
        message: 'Inventory updated successfully',
        data: { 
          product: {
            id: product._id,
            name: product.name,
            quantity: product.quantity,
            stockStatus: product.stockStatus,
            lowStockThreshold: product.lowStockThreshold
          }
        }
      });
    } catch (error) {
      console.error('Update inventory error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Get inventory info
  async getInventory(req, res) {
    try {
      const product = await Product.findById(req.params.id).select('name quantity stockStatus lowStockThreshold trackQuantity');

      if (!product) {
        return res.status(404).json({
          status: 'error',
          message: 'Product not found'
        });
      }

      res.json({
        status: 'success',
        data: { inventory: product }
      });
    } catch (error) {
      console.error('Get inventory error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }
};

module.exports = productController; 