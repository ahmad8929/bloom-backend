const Product = require('../models/Product');
const { uploadToCloudinary } = require('../utils/cloudinary');

const productController = {
  // Get all products with filtering, sorting, and pagination
  async getProducts(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        sort = '-createdAt',
        minPrice,
        maxPrice,
        size,
        material,
        category, // NEW: Category filter
        isNewArrival,
        isSale,
        search
      } = req.query;

      console.log('getProducts called with params:', req.query);

      // Build filter object
      const filter = {};
      
      try {
        if (size && size !== 'all') filter.size = size;
        
        if (material) {
          console.log('Filtering by material:', material);
          filter.material = { $regex: new RegExp(material, 'i') };
        }

        // NEW: Category filtering
        if (category) {
          console.log('Filtering by category:', category);
          filter.category = { $regex: new RegExp(category, 'i') };
        }
        
        if (isNewArrival !== undefined) filter.isNewArrival = isNewArrival === 'true';
        if (isSale !== undefined) filter.isSale = isSale === 'true';
        
        if (minPrice || maxPrice) {
          filter.price = {};
          if (minPrice) filter.price.$gte = Number(minPrice);
          if (maxPrice) filter.price.$lte = Number(maxPrice);
        }

        if (search) {
          filter.$or = [
            { name: { $regex: new RegExp(search, 'i') } },
            { description: { $regex: new RegExp(search, 'i') } },
            { material: { $regex: new RegExp(search, 'i') } },
            { category: { $regex: new RegExp(search, 'i') } } // NEW: Search by category
          ];
        }

        console.log('Filter object:', JSON.stringify(filter, null, 2));
      } catch (filterError) {
        console.error('Error building filter:', filterError);
        return res.status(400).json({
          status: 'error',
          message: 'Invalid filter parameters: ' + filterError.message
        });
      }

      // Calculate pagination
      const skip = (page - 1) * limit;
      
      let total;
      let products;
      
      try {
        total = await Product.countDocuments(filter);
        console.log('Total products found:', total);
        
        const totalPages = Math.ceil(total / limit);

        // Get products
        products = await Product.find(filter)
          .sort(sort)
          .skip(skip)
          .limit(Number(limit))
          .lean();

        console.log('Products retrieved:', products.length);
      } catch (dbError) {
        console.error('Database error:', dbError);
        return res.status(500).json({
          status: 'error',
          message: 'Database error: ' + dbError.message
        });
      }

      const totalPages = Math.ceil(total / limit);

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
        message: 'Internal server error: ' + error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  },

  // NEW: Get products by category
  async getProductsByCategory(req, res) {
    try {
      const { categoryId } = req.params;
      const {
        page = 1,
        limit = 20,
        sort = '-createdAt',
        minPrice,
        maxPrice,
        size,
        material,
        isNewArrival,
        isSale
      } = req.query;

      console.log('getProductsByCategory called with category:', categoryId);

      // Build filter object
      const filter = {
        category: { $regex: new RegExp(categoryId, 'i') }
      };

      // Add additional filters
      if (size && size !== 'all') filter.size = size;
      if (material) filter.material = { $regex: new RegExp(material, 'i') };
      if (isNewArrival !== undefined) filter.isNewArrival = isNewArrival === 'true';
      if (isSale !== undefined) filter.isSale = isSale === 'true';
      
      if (minPrice || maxPrice) {
        filter.price = {};
        if (minPrice) filter.price.$gte = Number(minPrice);
        if (maxPrice) filter.price.$lte = Number(maxPrice);
      }

      console.log('Category filter object:', JSON.stringify(filter, null, 2));

      // Calculate pagination
      const skip = (page - 1) * limit;
      const total = await Product.countDocuments(filter);
      const totalPages = Math.ceil(total / limit);

      // Get products
      const products = await Product.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(Number(limit))
        .lean();

      console.log('Category products retrieved:', products.length);

      res.json({
        status: 'success',
        data: {
          products,
          category: categoryId,
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
        message: 'Internal server error: ' + error.message
      });
    }
  },

  // NEW: Get all categories with product counts
  // async getCategories(req, res) {
  //   try {
  //     console.log('getCategories called');

  //     // Get category counts using aggregation
  //     const categoryCounts = await Product.aggregate([
  //       {
  //         $group: {
  //           _id: '$category',
  //           count: { $sum: 1 }
  //         }
  //       },
  //       {
  //         $sort: { count: -1 }
  //       }
  //     ]);

  //     // Format the response
  //     const categories = categoryCounts.map(item => ({
  //       name: item._id,
  //       count: item.count,
  //       slug: item._id.toLowerCase().replace(/\s+/g, '-')
  //     }));

  //     console.log('Categories retrieved:', categories);

  //     res.json({
  //       status: 'success',
  //       data: {
  //         categories
  //       }
  //     });
  //   } catch (error) {
  //     console.error('Get categories error:', error);
  //     res.status(500).json({
  //       status: 'error',
  //       message: 'Internal server error: ' + error.message
  //     });
  //   }
  // },

  async getCategories(req, res) {
  try {
    console.log('=== getCategories API called ===');
    
    // Check if we have products first
    const totalProducts = await Product.countDocuments({});
    console.log('Total products in database:', totalProducts);
    
    if (totalProducts === 0) {
      console.log('No products found, returning empty categories');
      return res.json({
        status: 'success',
        data: {
          categories: []
        }
      });
    }

    // Get category counts using aggregation, filtering out null/undefined categories
    const categoryCounts = await Product.aggregate([
      {
        // First filter out products without categories
        $match: {
          category: { $ne: null, $exists: true, $ne: "" }
        }
      },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    console.log('Category aggregation result:', categoryCounts);

    // Format the response
    const categories = categoryCounts
      .filter(item => item._id) // Extra safety filter
      .map(item => ({
        name: item._id,
        count: item.count,
        slug: item._id.toLowerCase().replace(/\s+/g, '-')
      }));

    console.log('Formatted categories:', categories);

    // Check for products without categories
    const productsWithoutCategory = await Product.countDocuments({ 
      $or: [
        { category: { $exists: false } },
        { category: null },
        { category: '' }
      ]
    });

    if (productsWithoutCategory > 0) {
      console.log(`⚠️  Warning: ${productsWithoutCategory} products found without categories`);
    }

    res.json({
      status: 'success',
      data: {
        categories,
        metadata: {
          totalProducts,
          productsWithoutCategory
        }
      }
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error: ' + error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
},

  // Get single product (unchanged)
  async getProduct(req, res) {
    try {
      const product = await Product.findById(req.params.id);

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

  // Create product (updated to handle category)
  async createProduct(req, res) {
    try {
      const productData = req.body;
      console.log('Creating product with data:', productData);
      console.log('Files received:', req.files?.length || 0);

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

      // Parse colors if they come as strings
      if (typeof productData.colors === 'string') {
        try {
          productData.colors = JSON.parse(productData.colors);
        } catch (e) {
          productData.colors = [{ name: 'Default', hexCode: '#000000' }];
        }
      }

      // Convert boolean strings to actual booleans
      if (typeof productData.isNewArrival === 'string') {
        productData.isNewArrival = productData.isNewArrival === 'true';
      }

      if (typeof productData.isSale === 'string') {
        productData.isSale = productData.isSale === 'true';
      }

      // Set final data
      productData.images = uploadedImages;

      // Create product
      const product = new Product(productData);
      await product.save();

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

  // Update product (updated to handle category)
  async updateProduct(req, res) {
    try {
      const productData = req.body;
      console.log('Updating product with data:', productData);

      // Handle existing images
      let finalImages = [];
      
      // Parse existing images if provided
      if (productData.existingImages) {
        try {
          const existingImages = typeof productData.existingImages === 'string' 
            ? JSON.parse(productData.existingImages) 
            : productData.existingImages;
          
          finalImages = existingImages.map((url, index) => ({
            url,
            alt: productData.name || `Product image ${index + 1}`,
            isPrimary: index === 0
          }));
        } catch (e) {
          console.error('Error parsing existing images:', e);
        }
      }

      // Handle new image uploads
      if (req.files && req.files.length > 0) {
        try {
          console.log('Uploading', req.files.length, 'new images to Cloudinary...');
          const imagePromises = req.files.map(file => 
            uploadToCloudinary(file.buffer, 'products')
          );
          const cloudinaryResults = await Promise.all(imagePromises);
          
          const newImages = cloudinaryResults.map((result, index) => ({
            url: result.secure_url,
            alt: productData.name || `Product image ${finalImages.length + index + 1}`,
            isPrimary: finalImages.length === 0 && index === 0
          }));

          finalImages = [...finalImages, ...newImages];
        } catch (uploadError) {
          console.error('Image upload error:', uploadError);
          return res.status(400).json({
            status: 'error',
            message: 'Failed to upload images: ' + uploadError.message
          });
        }
      }

      // Set images if we have any
      if (finalImages.length > 0) {
        productData.images = finalImages;
      }

      // Parse colors if they come as strings
      if (typeof productData.colors === 'string') {
        try {
          productData.colors = JSON.parse(productData.colors);
        } catch (e) {
          delete productData.colors;
        }
      }

      // Convert boolean strings to actual booleans
      if (typeof productData.isNewArrival === 'string') {
        productData.isNewArrival = productData.isNewArrival === 'true';
      }

      if (typeof productData.isSale === 'string') {
        productData.isSale = productData.isSale === 'true';
      }

      // Remove existingImages from update data
      delete productData.existingImages;

      const product = await Product.findByIdAndUpdate(
        req.params.id,
        productData,
        { new: true, runValidators: true }
      );

      if (!product) {
        return res.status(404).json({
          status: 'error',
          message: 'Product not found'
        });
      }

      console.log('Product updated successfully:', product.name);

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
        message: 'Internal server error: ' + error.message
      });
    }
  },

  // Delete product (unchanged)
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

  // Get new arrivals (unchanged)
  async getNewArrivals(req, res) {
    try {
      const { limit = 10 } = req.query;

      const products = await Product.find({ isNewArrival: true })
        .sort('-createdAt')
        .limit(Number(limit))
        .lean();

      res.json({
        status: 'success',
        data: { products }
      });
    } catch (error) {
      console.error('Get new arrivals error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Get sale products (unchanged)
  async getSaleProducts(req, res) {
    try {
      const { limit = 10 } = req.query;

      const products = await Product.find({ isSale: true })
        .sort('-createdAt')
        .limit(Number(limit))
        .lean();

      res.json({
        status: 'success',
        data: { products }
      });
    } catch (error) {
      console.error('Get sale products error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Search products (updated to include category)
  async searchProducts(req, res) {
    try {
      const { q, page = 1, limit = 20, size, material, category, isNewArrival, isSale } = req.query;

      if (!q) {
        return res.status(400).json({
          status: 'error',
          message: 'Search query is required'
        });
      }

      const filter = {
        $or: [
          { name: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } },
          { material: { $regex: q, $options: 'i' } },
          { category: { $regex: q, $options: 'i' } } // NEW: Search by category
        ]
      };

      // Add additional filters
      if (size && size !== 'all') filter.size = size;
      if (material) filter.material = { $regex: material, $options: 'i' };
      if (category) filter.category = { $regex: category, $options: 'i' }; // NEW: Category filter
      if (isNewArrival !== undefined) filter.isNewArrival = isNewArrival === 'true';
      if (isSale !== undefined) filter.isSale = isSale === 'true';

      const skip = (page - 1) * limit;
      const total = await Product.countDocuments(filter);
      const totalPages = Math.ceil(total / limit);

      const products = await Product.find(filter)
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
  }
};

module.exports = productController;