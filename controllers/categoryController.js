

// controllers/categoryController.js
const Category = require('../models/Category');
const Product = require('../models/Product');
const { uploadToCloudinary } = require('../utils/cloudinary');

const categoryController = {
  // Get all categories
  async getCategories(req, res) {
    try {
      const { parent, status = 'active' } = req.query;
      
      const filter = { status };
      if (parent) {
        filter.parent = parent === 'null' ? null : parent;
      }

      const categories = await Category.find(filter)
        .populate('subcategories')
        .sort('sort name')
        .lean();

      res.json({
        status: 'success',
        data: { categories }
      });
    } catch (error) {
      console.error('Get categories error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Get single category
  async getCategory(req, res) {
    try {
      const category = await Category.findById(req.params.id)
        .populate('subcategories')
        .populate('parent', 'name slug');

      if (!category) {
        return res.status(404).json({
          status: 'error',
          message: 'Category not found'
        });
      }

      res.json({
        status: 'success',
        data: { category }
      });
    } catch (error) {
      console.error('Get category error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Create category
  async createCategory(req, res) {
    try {
      const categoryData = req.body;

      // Handle image upload
      if (req.file) {
        const uploadResult = await uploadToCloudinary(req.file.buffer, 'categories');
        categoryData.image = {
          url: uploadResult.secure_url,
          alt: categoryData.name
        };
      }

      const category = new Category(categoryData);
      await category.save();

      res.status(201).json({
        status: 'success',
        message: 'Category created successfully',
        data: { category }
      });
    } catch (error) {
      console.error('Create category error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Update category
  async updateCategory(req, res) {
    try {
      const categoryData = req.body;

      // Handle image upload
      if (req.file) {
        const uploadResult = await uploadToCloudinary(req.file.buffer, 'categories');
        categoryData.image = {
          url: uploadResult.secure_url,
          alt: categoryData.name
        };
      }

      const category = await Category.findByIdAndUpdate(
        req.params.id,
        categoryData,
        { new: true, runValidators: true }
      );

      if (!category) {
        return res.status(404).json({
          status: 'error',
          message: 'Category not found'
        });
      }

      res.json({
        status: 'success',
        message: 'Category updated successfully',
        data: { category }
      });
    } catch (error) {
      console.error('Update category error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Delete category
  async deleteCategory(req, res) {
    try {
      // Check if category has products
      const productCount = await Product.countDocuments({ category: req.params.id });
      if (productCount > 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Cannot delete category with existing products'
        });
      }

      // Check if category has subcategories
      const subcategoryCount = await Category.countDocuments({ parent: req.params.id });
      if (subcategoryCount > 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Cannot delete category with subcategories'
        });
      }

      const category = await Category.findByIdAndDelete(req.params.id);
      if (!category) {
        return res.status(404).json({
          status: 'error',
          message: 'Category not found'
        });
      }

      res.json({
        status: 'success',
        message: 'Category deleted successfully'
      });
    } catch (error) {
      console.error('Delete category error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Get category products
  async getCategoryProducts(req, res) {
    try {
      const { page = 1, limit = 20, sort = '-createdAt' } = req.query;

      // Get category and its subcategories
      const category = await Category.findById(req.params.id);
      if (!category) {
        return res.status(404).json({
          status: 'error',
          message: 'Category not found'
        });
      }

      const subcategories = await Category.find({ parent: req.params.id });
      const categoryIds = [req.params.id, ...subcategories.map(sub => sub._id)];

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
      console.error('Get category products error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }
};

module.exports = categoryController;
