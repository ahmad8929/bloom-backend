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
        status = 'active',
        featured,
        search
      } = req.query;

      // Build filter object
      const filter = {};
      
      // Only apply status filter for non-admin requests
      if (req.user?.role !== 'admin') {
        filter.status = 'active';
      } else if (status !== 'all') {
        filter.status = status;
      }

      if (category && category !== 'all') filter.category = category;
      if (featured !== undefined) filter.featured = featured === 'true';
      
      if (minPrice || maxPrice) {
        filter.price = {};
        if (minPrice) filter.price.$gte = Number(minPrice);
        if (maxPrice) filter.price.$lte = Number(maxPrice);
      }

      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ];
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
        .populate('category', 'name slug');

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

      const filter = {
        category: categoryId,
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

  // Create product (Admin only)
  async createProduct(req, res) {
    try {
      const productData = req.body;
      console.log('Creating product with data:', productData);
      console.log('Files received:', req.files?.length || 0);

      // Find or create category
      let categoryId = productData.category;
      if (typeof productData.category === 'string' && !productData.category.match(/^[0-9a-fA-F]{24}$/)) {
        // Category is a name, find or create it
        let category = await Category.findOne({ name: productData.category });
        if (!category) {
          category = new Category({ 
            name: productData.category,
            description: `${productData.category} collection`
          });
          await category.save();
          console.log('Created new category:', category.name);
        }
        categoryId = category._id;
      }

      // Handle image uploads
      let uploadedImages = [];
      if (req.files && req.files.length > 0) {
        try {
          console.log('Uploading', req.files.length, 'images to Cloudinary...');
          const imagePromises = req.files.map(file => 
            uploadToCloudinary(file.buffer, 'products')
          );
          const cloudinaryResults = await Promise.all(imagePromises);
          
          uploadedImages = cloudinaryResults.map((result, index) => ({
            url: result.secure_url,
            alt: productData.name || `Product image ${index + 1}`,
            isPrimary: index === 0
          }));
          console.log('Images uploaded successfully:', uploadedImages.length);
        } catch (uploadError) {
          console.error('Image upload error:', uploadError);
          return res.status(400).json({
            status: 'error',
            message: 'Failed to upload images: ' + uploadError.message
          });
        }
      } else {
        // Default placeholder image if no images uploaded
        uploadedImages = [{
          url: 'https://via.placeholder.com/400x400?text=No+Image',
          alt: productData.name || 'Product image',
          isPrimary: true
        }];
      }

      // Parse sizes and colors if they come as strings
      if (typeof productData.sizes === 'string') {
        try {
          productData.sizes = JSON.parse(productData.sizes);
        } catch (e) {
          productData.sizes = [{ size: 'M', quantity: 10 }];
        }
      }

      if (typeof productData.colors === 'string') {
        try {
          productData.colors = JSON.parse(productData.colors);
        } catch (e) {
          productData.colors = [{ name: 'Black', hexCode: '#000000' }];
        }
      }

      // Parse care instructions if it's a string
      if (typeof productData.careInstructions === 'string') {
        productData.careInstructions = productData.careInstructions
          .split('\n')
          .filter(instruction => instruction.trim())
          .map(instruction => instruction.trim());
      }

      // Set final data
      productData.category = categoryId;
      productData.images = uploadedImages;

      // Create product
      const product = new Product(productData);
      await product.save();

      // Populate category information
      await product.populate('category', 'name slug');

      console.log('Product created successfully:', product.name);

      res.status(201).json({
        status: 'success',
        message: 'Product created successfully',
        data: { product }
      });
    } catch (error) {
      console.error('Create product error:', error);
      
      // Handle validation errors
      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map(err => err.message);
        return res.status(400).json({
          status: 'error',
          message: 'Validation error',
          errors
        });
      }

      res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message
      });
    }
  },

  // Update product (Admin only)
  async updateProduct(req, res) {
    try {
      const productData = req.body;

      // Handle new image uploads
      if (req.files && req.files.length > 0) {
        try {
          const imagePromises = req.files.map(file => 
            uploadToCloudinary(file.buffer, 'products')
          );
          const cloudinaryResults = await Promise.all(imagePromises);
          
          const newImages = cloudinaryResults.map((result, index) => ({
            url: result.secure_url,
            alt: productData.name || `Product image ${index + 1}`,
            isPrimary: index === 0
          }));

          // Merge with existing images if keepExisting is true
          if (productData.keepExistingImages === 'true') {
            const existingProduct = await Product.findById(req.params.id);
            productData.images = [...existingProduct.images, ...newImages];
          } else {
            productData.images = newImages;
          }
        } catch (uploadError) {
          console.error('Image upload error:', uploadError);
          return res.status(400).json({
            status: 'error',
            message: 'Failed to upload images'
          });
        }
      }

      // Parse JSON strings if needed
      if (typeof productData.sizes === 'string') {
        try {
          productData.sizes = JSON.parse(productData.sizes);
        } catch (e) {
          delete productData.sizes;
        }
      }

      if (typeof productData.colors === 'string') {
        try {
          productData.colors = JSON.parse(productData.colors);
        } catch (e) {
          delete productData.colors;
        }
      }

      if (typeof productData.careInstructions === 'string') {
        productData.careInstructions = productData.careInstructions
          .split('\n')
          .filter(instruction => instruction.trim())
          .map(instruction => instruction.trim());
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
      
      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map(err => err.message);
        return res.status(400).json({
          status: 'error',
          message: 'Validation error',
          errors
        });
      }

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
        $or: [
          { name: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } }
        ],
        status: 'active'
      };

      const skip = (page - 1) * limit;
      const total = await Product.countDocuments(filter);
      const totalPages = Math.ceil(total / limit);

      const products = await Product.find(filter)
        .populate('category', 'name slug')
        .sort('-createdAt')
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
        data: { product }
      });
    } catch (error) {
      console.error('Update inventory error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Get inventory
  async getInventory(req, res) {
    try {
      const product = await Product.findById(req.params.id)
        .select('name sizes totalQuantity');

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