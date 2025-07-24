

// controllers/wishlistController.js
const Wishlist = require('../models/Wishlist');
const Product = require('../models/Product');

const wishlistController = {
  // Get user's wishlist
  async getWishlist(req, res) {
    try {
      let wishlist = await Wishlist.findOne({ user: req.user.id })
        .populate('items.product', 'name price images stockStatus rating');

      if (!wishlist) {
        wishlist = new Wishlist({ user: req.user.id, items: [] });
        await wishlist.save();
      }

      res.json({
        status: 'success',
        data: { wishlist }
      });
    } catch (error) {
      console.error('Get wishlist error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Add to wishlist
  async addToWishlist(req, res) {
    try {
      const { productId } = req.params;

      // Validate product
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({
          status: 'error',
          message: 'Product not found'
        });
      }

      // Find or create wishlist
      let wishlist = await Wishlist.findOne({ user: req.user.id });
      if (!wishlist) {
        wishlist = new Wishlist({ user: req.user.id, items: [] });
      }

      // Check if product already in wishlist
      const existingItem = wishlist.items.find(item => 
        item.product.toString() === productId
      );

      if (existingItem) {
        return res.status(400).json({
          status: 'error',
          message: 'Product already in wishlist'
        });
      }

      // Add to wishlist
      wishlist.items.push({ product: productId });
      await wishlist.save();
      await wishlist.populate('items.product', 'name price images stockStatus rating');

      res.json({
        status: 'success',
        message: 'Product added to wishlist',
        data: { wishlist }
      });
    } catch (error) {
      console.error('Add to wishlist error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Remove from wishlist
  async removeFromWishlist(req, res) {
    try {
      const { productId } = req.params;

      const wishlist = await Wishlist.findOne({ user: req.user.id });
      if (!wishlist) {
        return res.status(404).json({
          status: 'error',
          message: 'Wishlist not found'
        });
      }

      wishlist.items = wishlist.items.filter(item => 
        item.product.toString() !== productId
      );

      await wishlist.save();
      await wishlist.populate('items.product', 'name price images stockStatus rating');

      res.json({
        status: 'success',
        message: 'Product removed from wishlist',
        data: { wishlist }
      });
    } catch (error) {
      console.error('Remove from wishlist error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Clear wishlist
  async clearWishlist(req, res) {
    try {
      const wishlist = await Wishlist.findOne({ user: req.user.id });
      if (!wishlist) {
        return res.status(404).json({
          status: 'error',
          message: 'Wishlist not found'
        });
      }

      wishlist.items = [];
      await wishlist.save();

      res.json({
        status: 'success',
        message: 'Wishlist cleared',
        data: { wishlist }
      });
    } catch (error) {
      console.error('Clear wishlist error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }
};

module.exports = wishlistController;