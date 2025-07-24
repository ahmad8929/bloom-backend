// controllers/orderController.js
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const User = require('../models/User');
const { sendEmail } = require('../utils/email');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const orderController = {
  // Create order
  async createOrder(req, res) {
    try {
      const { shippingAddress, billingAddress, paymentMethod, paymentToken } = req.body;

      // Get user's cart
      const cart = await Cart.findOne({ user: req.user.id }).populate('items.product');
      if (!cart || cart.items.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Cart is empty'
        });
      }

      // Validate stock for all items
      for (const item of cart.items) {
        if (item.product.trackQuantity && item.product.quantity < item.quantity) {
          return res.status(400).json({
            status: 'error',
            message: `Insufficient stock for ${item.product.name}`
          });
        }
      }

      // Create order
      const order = new Order({
        user: req.user.id,
        items: cart.items.map(item => ({
          product: item.product._id,
          name: item.product.name,
          price: item.price,
          quantity: item.quantity,
          variant: item.variant,
          image: item.product.images[0]?.url
        })),
        shippingAddress,
        billingAddress: billingAddress || shippingAddress,
        payment: {
          method: paymentMethod,
          amount: cart.totals.total
        },
        totals: cart.totals,
        appliedCoupon: cart.appliedCoupon
      });

      // Process payment based on method
      if (paymentMethod === 'stripe') {
        try {
          const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(cart.totals.total * 100), // Convert to cents
            currency: 'usd',
            payment_method: paymentToken,
            confirm: true,
            return_url: `${process.env.FRONTEND_URL}/orders/${order._id}`
          });

          order.payment.transactionId = paymentIntent.id;
          order.payment.status = paymentIntent.status === 'succeeded' ? 'completed' : 'failed';
        } catch (stripeError) {
          return res.status(400).json({
            status: 'error',
            message: 'Payment failed',
            details: stripeError.message
          });
        }
      } else if (paymentMethod === 'cod') {
        order.payment.status = 'pending';
      }

      // Save order
      await order.save();

      // Update product quantities
      for (const item of cart.items) {
        if (item.product.trackQuantity) {
          await Product.findByIdAndUpdate(item.product._id, {
            $inc: { 
              quantity: -item.quantity,
              'sales.totalSold': item.quantity,
              'sales.revenue': item.price * item.quantity
            }
          });
        }
      }

      // Clear cart
      cart.items = [];
      cart.appliedCoupon = undefined;
      await cart.save();

      // Send confirmation email
      const user = await User.findById(req.user.id);
      await sendEmail({
        to: user.email,
        subject: 'Order Confirmation',
        template: 'orderConfirmation',
        context: {
          name: user.firstName,
          orderNumber: order.orderNumber,
          total: order.totals.total
        }
      });

      res.status(201).json({
        status: 'success',
        message: 'Order created successfully',
        data: { order }
      });
    } catch (error) {
      console.error('Create order error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Get user orders
  async getUserOrders(req, res) {
    try {
      const { page = 1, limit = 10, status } = req.query;

      const filter = { user: req.user.id };
      if (status) filter.status = status;

      const skip = (page - 1) * limit;
      const total = await Order.countDocuments(filter);
      const totalPages = Math.ceil(total / limit);

      const orders = await Order.find(filter)
        .sort('-createdAt')
        .skip(skip)
        .limit(Number(limit))
        .populate('items.product', 'name images')
        .lean();

      res.json({
        status: 'success',
        data: {
          orders,
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
      console.error('Get user orders error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Get single order
  async getOrder(req, res) {
    try {
      const order = await Order.findById(req.params.id)
        .populate('items.product', 'name images slug')
        .populate('user', 'firstName lastName email');

      if (!order) {
        return res.status(404).json({
          status: 'error',
          message: 'Order not found'
        });
      }

      // Check if user owns the order or is admin
      if (order.user._id.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({
          status: 'error',
          message: 'Access denied'
        });
      }

      res.json({
        status: 'success',
        data: { order }
      });
    } catch (error) {
      console.error('Get order error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Cancel order
  async cancelOrder(req, res) {
    try {
      const order = await Order.findById(req.params.id);

      if (!order) {
        return res.status(404).json({
          status: 'error',
          message: 'Order not found'
        });
      }

      // Check if user owns the order
      if (order.user.toString() !== req.user.id) {
        return res.status(403).json({
          status: 'error',
          message: 'Access denied'
        });
      }

      // Check if order can be cancelled
      if (!['pending', 'confirmed'].includes(order.status)) {
        return res.status(400).json({
          status: 'error',
          message: 'Order cannot be cancelled at this stage'
        });
      }

      order.status = 'cancelled';
      order.timeline.push({
        status: 'cancelled',
        note: 'Order cancelled by customer',
        timestamp: new Date()
      });

      await order.save();

      // Restore product quantities
      for (const item of order.items) {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { 
            quantity: item.quantity,
            'sales.totalSold': -item.quantity,
            'sales.revenue': -(item.price * item.quantity)
          }
        });
      }

      res.json({
        status: 'success',
        message: 'Order cancelled successfully',
        data: { order }
      });
    } catch (error) {
      console.error('Cancel order error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Track order
  async trackOrder(req, res) {
    try {
      const order = await Order.findById(req.params.id)
        .select('orderNumber status tracking timeline createdAt')
        .lean();

      if (!order) {
        return res.status(404).json({
          status: 'error',
          message: 'Order not found'
        });
      }

      res.json({
        status: 'success',
        data: { tracking: order }
      });
    } catch (error) {
      console.error('Track order error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Get all orders (Admin)
  async getAllOrders(req, res) {
    try {
      const { 
        page = 1, 
        limit = 20, 
        status, 
        paymentStatus,
        startDate,
        endDate,
        search
      } = req.query;

      const filter = {};
      if (status) filter.status = status;
      if (paymentStatus) filter['payment.status'] = paymentStatus;
      
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(endDate);
      }

      if (search) {
        filter.orderNumber = { $regex: search, $options: 'i' };
      }

      const skip = (page - 1) * limit;
      const total = await Order.countDocuments(filter);
      const totalPages = Math.ceil(total / limit);

      const orders = await Order.find(filter)
        .populate('user', 'firstName lastName email')
        .sort('-createdAt')
        .skip(skip)
        .limit(Number(limit))
        .lean();

      res.json({
        status: 'success',
        data: {
          orders,
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
      console.error('Get all orders error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Update order status (Admin)
  async updateOrderStatus(req, res) {
    try {
      const { status, note } = req.body;

      const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid status'
        });
      }

      const order = await Order.findById(req.params.id);
      if (!order) {
        return res.status(404).json({
          status: 'error',
          message: 'Order not found'
        });
      }

      order.status = status;
      order.timeline.push({
        status,
        note: note || `Order status updated to ${status}`,
        timestamp: new Date()
      });

      await order.save();

      res.json({
        status: 'success',
        message: 'Order status updated successfully',
        data: { order }
      });
    } catch (error) {
      console.error('Update order status error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Update shipping info (Admin)
  async updateShipping(req, res) {
    try {
      const { carrier, trackingNumber, trackingUrl } = req.body;

      const order = await Order.findById(req.params.id);
      if (!order) {
        return res.status(404).json({
          status: 'error',
          message: 'Order not found'
        });
      }

      order.tracking = {
        carrier,
        trackingNumber,
        trackingUrl
      };

      if (order.status === 'processing') {
        order.status = 'shipped';
        order.timeline.push({
          status: 'shipped',
          note: `Order shipped via ${carrier}. Tracking: ${trackingNumber}`,
          timestamp: new Date()
        });
      }

      await order.save();

      res.json({
        status: 'success',
        message: 'Shipping information updated successfully',
        data: { order }
      });
    } catch (error) {
      console.error('Update shipping error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }
};

module.exports = orderController; 