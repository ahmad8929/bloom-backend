

// controllers/cartController.js
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');

const cartController = {
  // Get user's cart
  async getCart(req, res) {
    try {
      let cart = await Cart.findOne({ user: req.user.id })
        .populate('items.product', 'name price images quantity stockStatus');

      if (!cart) {
        cart = new Cart({ user: req.user.id, items: [] });
        await cart.save();
      }

      res.json({ success: true, cart });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Add item to cart
  async addToCart(req, res) {
    try {
      const { productId, quantity } = req.body;

      // Check if product exists and is in stock
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ success: false, message: 'Product not found' });
      }
      if (product.stockStatus === 'outOfStock') {
        return res.status(400).json({ success: false, message: 'Product is out of stock' });
      }

      let cart = await Cart.findOne({ user: req.user.id });
      if (!cart) {
        cart = new Cart({ user: req.user.id, items: [] });
      }

      // Check if product already exists in cart
      const existingItemIndex = cart.items.findIndex(item => item.product.toString() === productId);
      
      if (existingItemIndex > -1) {
        // Update quantity if product exists
        cart.items[existingItemIndex].quantity = quantity;
      } else {
        // Add new item if product doesn't exist in cart
        cart.items.push({ product: productId, quantity });
      }

      await cart.save();
      await cart.populate('items.product', 'name price images quantity stockStatus');

      res.json({ success: true, cart });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Update cart item quantity
  async updateCartItem(req, res) {
    try {
      const { productId, quantity } = req.body;

      if (quantity < 1) {
        return res.status(400).json({ success: false, message: 'Quantity must be at least 1' });
      }

      const cart = await Cart.findOne({ user: req.user.id });
      if (!cart) {
        return res.status(404).json({ success: false, message: 'Cart not found' });
      }

      const itemIndex = cart.items.findIndex(item => item.product.toString() === productId);
      if (itemIndex === -1) {
        return res.status(404).json({ success: false, message: 'Item not found in cart' });
      }

      cart.items[itemIndex].quantity = quantity;
      await cart.save();
      await cart.populate('items.product', 'name price images quantity stockStatus');

      res.json({ success: true, cart });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Remove item from cart
  async removeFromCart(req, res) {
    try {
      const { productId } = req.params;

      const cart = await Cart.findOne({ user: req.user.id });
      if (!cart) {
        return res.status(404).json({ success: false, message: 'Cart not found' });
      }

      cart.items = cart.items.filter(item => item.product.toString() !== productId);
      await cart.save();
      await cart.populate('items.product', 'name price images quantity stockStatus');

      res.json({ success: true, cart });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Clear cart
  async clearCart(req, res) {
    try {
      const cart = await Cart.findOne({ user: req.user.id });
      if (!cart) {
        return res.status(404).json({ success: false, message: 'Cart not found' });
      }

      cart.items = [];
      await cart.save();

      res.json({ success: true, message: 'Cart cleared successfully' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Apply coupon to cart
  async applyCoupon(req, res) {
    try {
      const { code } = req.body;

      const coupon = await Coupon.findOne({ 
        code, 
        isActive: true,
        expiryDate: { $gt: new Date() }
      });

      if (!coupon) {
        return res.status(404).json({ success: false, message: 'Invalid or expired coupon' });
      }

      const cart = await Cart.findOne({ user: req.user.id });
      if (!cart) {
        return res.status(404).json({ success: false, message: 'Cart not found' });
      }

      cart.appliedCoupon = coupon._id;
      await cart.save();
      await cart.populate('items.product appliedCoupon');

      res.json({ success: true, cart });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Remove coupon from cart
  async removeCoupon(req, res) {
    try {
      const cart = await Cart.findOne({ user: req.user.id });
      if (!cart) {
        return res.status(404).json({ success: false, message: 'Cart not found' });
      }

      cart.appliedCoupon = null;
      await cart.save();
      await cart.populate('items.product');

      res.json({ success: true, cart });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

module.exports = cartController;