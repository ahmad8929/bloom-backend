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
        color, // NEW: Color filter (from fixed set)
        material,
        category,
        isNewArrival,
        isSale,
        isStretched,
        search
      } = req.query;

      console.log('getProducts called with params:', req.query);

      // Build filter object
      const filter = {};
      
      try {
        // Size filter - check variants if they exist, otherwise check legacy size field
        if (size && size !== 'all') {
          filter.$or = [
            { 'variants.size': size, 'variants.stock': { $gt: 0 } },
            { size: size }
          ];
        }
        
        // Color filter - check both colors array and single color field
        if (color && color !== 'all') {
          // Use $or for color to check both colors array and single color field
          const colorOr = [
            { 'colors.name': color },
            { 'color.name': color }
          ];
          
          // If we already have $or for size, we need to combine them with $and
          if (filter.$or) {
            filter.$and = [
              { $or: filter.$or },
              { $or: colorOr }
            ];
            delete filter.$or;
          } else {
            filter.$or = colorOr;
          }
        }
        
        if (material) {
          console.log('Filtering by material:', material);
          filter.material = { $regex: new RegExp(material, 'i') };
        }

        // Category filtering
        if (category) {
          console.log('Filtering by category:', category);
          filter.category = { $regex: new RegExp(category, 'i') };
        }
        
        if (isNewArrival !== undefined) filter.isNewArrival = isNewArrival === 'true';
        if (isSale !== undefined) filter.isSale = isSale === 'true';
        if (isStretched !== undefined) filter.isStretched = isStretched === 'true';
        
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
        isSale,
        isStretched
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
      if (isStretched !== undefined) filter.isStretched = isStretched === 'true';
      
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
      
      // Handle files - req.files is now an object with 'images' and 'video' arrays
      const imageFiles = req.files?.images || [];
      const videoFile = req.files?.video?.[0] || null;
      
      console.log('Files received - Images:', imageFiles.length, 'Video:', videoFile ? 'Yes' : 'No');

      // Handle image uploads - at least one image is required
      let uploadedImages = [];
      if (imageFiles && imageFiles.length > 0) {
        try {
          console.log('Uploading', imageFiles.length, 'images to Cloudinary...');
          const imagePromises = imageFiles.map(file => 
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
        // At least one image is required
        return res.status(400).json({
          status: 'error',
          message: 'At least one product image is required'
        });
      }

      // Handle video upload (optional)
      let uploadedVideo = null;
      if (videoFile) {
        try {
          console.log('Uploading video to Cloudinary...');
          const videoResult = await uploadToCloudinary(videoFile.buffer, 'products/videos');
          uploadedVideo = videoResult.secure_url;
          console.log('Video uploaded successfully');
        } catch (uploadError) {
          console.error('Video upload error:', uploadError);
          return res.status(400).json({
            status: 'error',
            message: 'Failed to upload video: ' + uploadError.message
          });
        }
      }

      // Parse colors array if it comes as string
      if (typeof productData.colors === 'string') {
        try {
          productData.colors = JSON.parse(productData.colors);
        } catch (e) {
          productData.colors = [];
        }
      }
      
      // Ensure colors is an array
      if (!Array.isArray(productData.colors)) {
        productData.colors = [];
      }

      // Parse materials array if it comes as string
      if (typeof productData.materials === 'string') {
        try {
          productData.materials = JSON.parse(productData.materials);
        } catch (e) {
          productData.materials = [];
        }
      }
      
      // Ensure materials is an array
      if (!Array.isArray(productData.materials)) {
        productData.materials = [];
      }

      // Set primary color from first color in array (for backward compatibility)
      if (productData.colors && productData.colors.length > 0) {
        productData.color = productData.colors[0];
      } else if (typeof productData.color === 'string') {
        // Legacy: parse single color if provided as string
        try {
          productData.color = JSON.parse(productData.color);
        } catch (e) {
          productData.color = null;
        }
      }

      // Parse variants if they come as strings
      if (typeof productData.variants === 'string') {
        try {
          productData.variants = JSON.parse(productData.variants);
        } catch (e) {
          console.error('Error parsing variants:', e);
          productData.variants = [];
        }
      }

      // Validate and process variants (size + stock only, no color)
      if (productData.variants && Array.isArray(productData.variants)) {
        // Ensure each variant has required fields (size and stock)
        productData.variants = productData.variants.map((variant, index) => {
          if (!variant.size || variant.stock === undefined) {
            throw new Error(`Variant ${index + 1} is missing required fields (size or stock)`);
          }
          return {
            size: variant.size,
            stock: Number(variant.stock) || 0,
            sku: variant.sku || `${productData.name}-${variant.size}`.replace(/\s+/g, '-').toUpperCase()
          };
        });
      } else {
        // If no variants provided, create a default variant from legacy size field
        if (productData.size) {
          productData.variants = [{
            size: productData.size,
            stock: 0, // Default stock
            sku: `${productData.name}-${productData.size}`.replace(/\s+/g, '-').toUpperCase()
          }];
        } else {
          productData.variants = [];
        }
      }

      // Convert boolean strings to actual booleans
      if (typeof productData.isNewArrival === 'string') {
        productData.isNewArrival = productData.isNewArrival === 'true';
      }

      if (typeof productData.isSale === 'string') {
        productData.isSale = productData.isSale === 'true';
      }

      if (typeof productData.isStretched === 'string') {
        productData.isStretched = productData.isStretched === 'true';
      }

      // Validate comparePrice if provided
      if (productData.comparePrice !== undefined && productData.comparePrice !== null) {
        const comparePrice = Number(productData.comparePrice);
        
        if (comparePrice < 0) {
          return res.status(400).json({
            status: 'error',
            message: 'Compare price cannot be negative'
          });
        }
      }

      // Validate price is not negative
      if (productData.price !== undefined && Number(productData.price) < 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Price cannot be negative'
        });
      }

      // Set final data
      productData.images = uploadedImages;
      if (uploadedVideo) {
        productData.video = uploadedVideo;
      }

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

      // Handle files - req.files is now an object with 'images' and 'video' arrays
      const imageFiles = req.files?.images || [];
      const videoFile = req.files?.video?.[0] || null;

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
      if (imageFiles && imageFiles.length > 0) {
        try {
          console.log('Uploading', imageFiles.length, 'new images to Cloudinary...');
          const imagePromises = imageFiles.map(file => 
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

      // Handle video upload (optional)
      let uploadedVideo = null;
      if (videoFile) {
        try {
          console.log('Uploading video to Cloudinary...');
          const videoResult = await uploadToCloudinary(videoFile.buffer, 'products/videos');
          uploadedVideo = videoResult.secure_url;
          console.log('Video uploaded successfully');
        } catch (uploadError) {
          console.error('Video upload error:', uploadError);
          return res.status(400).json({
            status: 'error',
            message: 'Failed to upload video: ' + uploadError.message
          });
        }
      } else if (productData.existingVideo) {
        // Keep existing video if no new one is uploaded
        uploadedVideo = productData.existingVideo;
      }

      // Get existing product for validation
      const existingProduct = await Product.findById(req.params.id);
      if (!existingProduct) {
        return res.status(404).json({
          status: 'error',
          message: 'Product not found'
        });
      }

      // At least one image is required
      if (finalImages.length === 0) {
        // Check if product already has images
        if (!existingProduct.images || existingProduct.images.length === 0) {
          return res.status(400).json({
            status: 'error',
            message: 'At least one product image is required'
          });
        }
        // Keep existing images if no new ones provided
      } else {
        productData.images = finalImages;
      }

      // Set video if uploaded or existing
      if (uploadedVideo !== null) {
        productData.video = uploadedVideo;
      }

      // Validate comparePrice if provided
      if (productData.comparePrice !== undefined && productData.comparePrice !== null) {
        const comparePrice = Number(productData.comparePrice);
        
        if (comparePrice < 0) {
          return res.status(400).json({
            status: 'error',
            message: 'Compare price cannot be negative'
          });
        }
      }

      // Validate price is not negative
      if (productData.price !== undefined && Number(productData.price) < 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Price cannot be negative'
        });
      }

      // Parse colors array if it comes as string
      if (typeof productData.colors === 'string') {
        try {
          productData.colors = JSON.parse(productData.colors);
        } catch (e) {
          // Keep existing colors if parsing fails
          if (existingProduct.colors) {
            productData.colors = existingProduct.colors;
          } else {
            productData.colors = [];
          }
        }
      }
      
      // Ensure colors is an array
      if (!Array.isArray(productData.colors)) {
        productData.colors = existingProduct?.colors || [];
      }

      // Parse materials array if it comes as string
      if (typeof productData.materials === 'string') {
        try {
          productData.materials = JSON.parse(productData.materials);
        } catch (e) {
          // Keep existing materials if parsing fails
          if (existingProduct.materials) {
            productData.materials = existingProduct.materials;
          } else {
            productData.materials = [];
          }
        }
      }
      
      // Ensure materials is an array
      if (!Array.isArray(productData.materials)) {
        productData.materials = existingProduct?.materials || [];
      }

      // Set primary color from first color in array (for backward compatibility)
      if (productData.colors && productData.colors.length > 0) {
        productData.color = productData.colors[0];
      } else if (typeof productData.color === 'string') {
        // Legacy: parse single color if provided as string
        try {
          productData.color = JSON.parse(productData.color);
        } catch (e) {
          productData.color = existingProduct?.color || null;
        }
      }

      // Parse variants if they come as strings
      if (typeof productData.variants === 'string') {
        try {
          productData.variants = JSON.parse(productData.variants);
        } catch (e) {
          console.error('Error parsing variants:', e);
          // Don't delete variants, keep existing ones
        }
      }

      // Validate and process variants if provided (size + stock only)
      if (productData.variants && Array.isArray(productData.variants)) {
        // Ensure each variant has required fields (size and stock)
        productData.variants = productData.variants.map((variant, index) => {
          if (!variant.size || variant.stock === undefined) {
            throw new Error(`Variant ${index + 1} is missing required fields (size or stock)`);
          }
          return {
            size: variant.size,
            stock: Number(variant.stock) || 0,
            sku: variant.sku || `${productData.name || 'Product'}-${variant.size}`.replace(/\s+/g, '-').toUpperCase()
          };
        });
      }

      // Convert boolean strings to actual booleans
      if (typeof productData.isNewArrival === 'string') {
        productData.isNewArrival = productData.isNewArrival === 'true';
      }

      if (typeof productData.isSale === 'string') {
        productData.isSale = productData.isSale === 'true';
      }

      if (typeof productData.isStretched === 'string') {
        productData.isStretched = productData.isStretched === 'true';
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
      const { q, page = 1, limit = 20, size, material, category, isNewArrival, isSale, isStretched } = req.query;

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
      if (isStretched !== undefined) filter.isStretched = isStretched === 'true';

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