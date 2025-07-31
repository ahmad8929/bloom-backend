const Cart = require('../models/Cart');
const Product = require('../models/Product');

const cartController = {
  // Get user's cart
  async getCart(req, res) {
    try {
      let cart = await Cart.findOne({ userId: req.user.id })
        .populate({
          path: 'items.product',
          select: 'name price comparePrice images size material slug'
        });

      if (!cart) {
        cart = new Cart({ 
          userId: req.user.id, 
          items: [],
          totalItems: 0,
          totalAmount: 0
        });
        await cart.save();
      }

      res.json({ 
        status: 'success',
        data: { cart }
      });
    } catch (error) {
      console.error('Get cart error:', error);
      res.status(500).json({ 
        status: 'error',
        error: error.message 
      });
    }
  },

  // Add item to cart
  async addToCart(req, res) {
    try {
      const { productId, quantity = 1, size } = req.body;

      if (!productId) {
        return res.status(400).json({ 
          status: 'error',
          error: 'Product ID is required' 
        });
      }

      // Check if product exists
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ 
          status: 'error',
          error: 'Product not found' 
        });
      }

      let cart = await Cart.findOne({ userId: req.user.id });
      if (!cart) {
        cart = new Cart({ 
          userId: req.user.id, 
          items: [],
          totalItems: 0,
          totalAmount: 0
        });
      }

      // Check if product already exists in cart
      const existingItemIndex = cart.items.findIndex(item => 
        item.productId.toString() === productId && 
        item.size === (size || product.size)
      );
      
      if (existingItemIndex > -1) {
        // Update quantity if product exists
        cart.items[existingItemIndex].quantity = quantity;
      } else {
        // Add new item if product doesn't exist in cart
        cart.items.push({ 
          productId: productId,
          product: productId,
          quantity: quantity,
          size: size || product.size
        });
      }

      await cart.save();
      
      // Populate and return updated cart
      await cart.populate({
        path: 'items.product',
        select: 'name price comparePrice images size material slug'
      });

      res.json({ 
        status: 'success',
        message: 'Item added to cart successfully',
        data: { 
          cart,
          item: cart.items[existingItemIndex > -1 ? existingItemIndex : cart.items.length - 1]
        }
      });
    } catch (error) {
      console.error('Add to cart error:', error);
      res.status(500).json({ 
        status: 'error',
        error: error.message 
      });
    }
  },

  // Update cart item quantity
  async updateCartItem(req, res) {
    try {
      const { itemId } = req.params;
      const { quantity } = req.body;

      if (!quantity || quantity < 1) {
        return res.status(400).json({ 
          status: 'error',
          error: 'Quantity must be at least 1' 
        });
      }

      const cart = await Cart.findOne({ userId: req.user.id });
      if (!cart) {
        return res.status(404).json({ 
          status: 'error',
          error: 'Cart not found' 
        });
      }

      const itemIndex = cart.items.findIndex(item => item._id.toString() === itemId);
      if (itemIndex === -1) {
        return res.status(404).json({ 
          status: 'error',
          error: 'Item not found in cart' 
        });
      }

      cart.items[itemIndex].quantity = quantity;
      await cart.save();
      
      await cart.populate({
        path: 'items.product',
        select: 'name price comparePrice images size material slug'
      });

      res.json({ 
        status: 'success',
        message: 'Cart item updated successfully',
        data: { 
          cart,
          item: cart.items[itemIndex]
        }
      });
    } catch (error) {
      console.error('Update cart item error:', error);
      res.status(500).json({ 
        status: 'error',
        error: error.message 
      });
    }
  },

  // Remove item from cart
  async removeFromCart(req, res) {
    try {
      const { itemId } = req.params;

      const cart = await Cart.findOne({ userId: req.user.id });
      if (!cart) {
        return res.status(404).json({ 
          status: 'error',
          error: 'Cart not found' 
        });
      }

      const initialLength = cart.items.length;
      cart.items = cart.items.filter(item => item._id.toString() !== itemId);
      
      if (cart.items.length === initialLength) {
        return res.status(404).json({ 
          status: 'error',
          error: 'Item not found in cart' 
        });
      }

      await cart.save();
      
      await cart.populate({
        path: 'items.product',
        select: 'name price comparePrice images size material slug'
      });

      res.json({ 
        status: 'success',
        message: 'Item removed from cart successfully',
        data: { cart }
      });
    } catch (error) {
      console.error('Remove from cart error:', error);
      res.status(500).json({ 
        status: 'error',
        error: error.message 
      });
    }
  },

  // Clear cart
  async clearCart(req, res) {
    try {
      const cart = await Cart.findOne({ userId: req.user.id });
      if (!cart) {
        return res.status(404).json({ 
          status: 'error',
          error: 'Cart not found' 
        });
      }

      cart.items = [];
      await cart.save();

      res.json({ 
        status: 'success',
        message: 'Cart cleared successfully'
      });
    } catch (error) {
      console.error('Clear cart error:', error);
      res.status(500).json({ 
        status: 'error',
        error: error.message 
      });
    }
  },

  // Get cart summary
  async getCartSummary(req, res) {
    try {
      const cart = await Cart.findOne({ userId: req.user.id });
      
      if (!cart || !cart.items.length) {
        return res.json({ 
          status: 'success',
          data: {
            totalItems: 0,
            totalAmount: 0,
            itemCount: 0
          }
        });
      }

      res.json({ 
        status: 'success',
        data: {
          totalItems: cart.totalItems,
          totalAmount: cart.totalAmount,
          itemCount: cart.items.length
        }
      });
    } catch (error) {
      console.error('Get cart summary error:', error);
      res.status(500).json({ 
        status: 'error',
        error: error.message 
      });
    }
  }
};

module.exports = cartController;