// controllers/orderController.js
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const User = require('../models/User');
const Coupon = require('../models/Coupon');
const { sendEmail } = require('../utils/email');
const { uploadToCloudinary } = require('../utils/cloudinary');
const upload = require('../middlewares/upload');

const orderController = {
  // Create order
  async createOrder(req, res) {
    try {
      const { shippingAddress, paymentMethod, paymentDetails, couponCode } = req.body;

      // Get user's cart
      const cart = await Cart.findOne({ userId: req.user.id }).populate({
        path: 'items.product',
        select: 'name price comparePrice images size material slug'
      });

      if (!cart || cart.items.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Cart is empty'
        });
      }

      // Validate stock for all items (check variants if available)
      for (const item of cart.items) {
        const product = await Product.findById(item.productId);
        if (!product) {
          return res.status(404).json({
            status: 'error',
            message: `Product not found for item ${item.productId}`
          });
        }

        // Check variant stock if product has variants
        if (product.variants && product.variants.length > 0) {
          if (item.size) {
            const variantStock = product.getVariantStock(item.size);
            if (variantStock === null || variantStock < item.quantity) {
              return res.status(400).json({
                status: 'error',
                message: `Insufficient stock for ${product.name} (Size: ${item.size})`
              });
            }
          }
        } else if (product.trackQuantity && product.quantity < item.quantity) {
          // Legacy: check product quantity directly
          return res.status(400).json({
            status: 'error',
            message: `Insufficient stock for ${product.name}`
          });
        }
      }

      // Calculate totals
      const originalSubtotal = cart.totalAmount;
      let automaticDiscount = 0;
      let couponDiscount = 0;
      let coupon = null;

      // Apply automatic discount based on subtotal (before coupon)
      // If subtotal > ₹20,000: 10% discount
      // If subtotal > ₹10,000: 4% discount
      // Only highest eligible discount applies
      if (originalSubtotal > 20000) {
        automaticDiscount = Math.round(originalSubtotal * 0.10);
      } else if (originalSubtotal > 10000) {
        automaticDiscount = Math.round(originalSubtotal * 0.04);
      }

      // Validate and apply coupon if provided
      if (couponCode) {
        coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
        
        if (!coupon) {
          return res.status(400).json({
            status: 'error',
            message: 'Invalid coupon code'
          });
        }

        // Check if coupon is valid
        const validityCheck = coupon.isValid(req.user.id);
        if (!validityCheck.valid) {
          return res.status(400).json({
            status: 'error',
            message: validityCheck.message
          });
        }

        // Calculate coupon discount on subtotal after automatic discount
        const subtotalAfterAutoDiscount = originalSubtotal - automaticDiscount;
        const discountCalculation = coupon.calculateDiscount(subtotalAfterAutoDiscount);
        if (!discountCalculation.valid) {
          return res.status(400).json({
            status: 'error',
            message: discountCalculation.message
          });
        }

        couponDiscount = discountCalculation.discountAmount;
      }

      // Total discount (automatic + coupon)
      const totalDiscount = automaticDiscount + couponDiscount;
      const subtotalAfterDiscount = originalSubtotal - totalDiscount;

      // Prevent direct creation of cashfree orders - they should be created via payment session
      if (paymentMethod === 'cashfree') {
        return res.status(400).json({
          status: 'error',
          message: 'Cashfree orders must be created through payment session. Please use /api/payments/cashfree/create-session endpoint.'
        });
      }

      // Only COD orders can be created directly from this endpoint.
      // Online payments are handled via Cashfree session creation.
      if (paymentMethod !== 'cod') {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid payment method. Please select Cashfree for online payments or COD for cash on delivery.'
        });
      }

      // Calculate shipping and advance payment based on payment method
      let shipping = 0;
      let advancePayment = 0;

      // COD: shipping charge (no advance payment)
      shipping = 199;
      advancePayment = 0;

      // Calculate final total (advance payment is NOT included - it's paid separately)
      const totalAmount = subtotalAfterDiscount + shipping;

      // Create order
      const order = new Order({
        user: req.user.id,
        items: cart.items.map(item => ({
          productId: item.product._id,
          name: item.product.name,
          price: item.product.price,
          quantity: item.quantity,
          size: item.size || item.product.size,
          color: item.color || item.product.color || null,
          image: item.product.images[0]?.url
        })),
        shippingAddress,
        paymentMethod,
        subtotal: originalSubtotal, // Original subtotal before discount
        discount: totalDiscount, // Total discount (automatic + coupon)
        shipping,
        advancePayment,
        tax: 0, // No tax as per new requirements
        totalAmount,
        couponCode: couponCode ? couponCode.toUpperCase() : undefined,
        status: 'confirmed', // COD orders are directly confirmed
        timeline: [{
          status: 'confirmed',
          note: couponCode ? `Order created with coupon ${couponCode.toUpperCase()}` : 'Order created',
          timestamp: new Date(),
          updatedBy: req.user.id
        }]
      });

      // COD payments are collected on delivery (advance paid separately, if applicable)
      order.paymentStatus = 'pending';

      // Save order
      await order.save();

      // Update coupon usage if coupon was applied
      if (coupon) {
        coupon.usageCount += 1;
        coupon.usageHistory.push({
          userId: req.user.id,
          orderId: order._id,
          discountAmount: couponDiscount,
          orderAmount: cart.totalAmount,
          usedAt: new Date()
        });
        await coupon.save();
      }

      // Clear cart
      cart.items = [];
      await cart.save();

      // Populate order for response
      await order.populate([
        {
          path: 'items.product',
          select: 'name price images size material slug'
        },
        {
          path: 'user',
          select: 'firstName lastName email'
        }
      ]);

      // Send confirmation email
      const user = await User.findById(req.user.id);
      if (user && user.email) {
        try {
          await sendEmail({
            to: user.email,
            subject: 'Order Confirmation - Bloom Tales',
            template: 'orderConfirmation',
            context: {
              name: user.firstName,
              orderNumber: order.orderNumber,
              total: order.totalAmount,
              items: order.items
            }
          });
        } catch (emailError) {
          console.error('Email sending failed:', emailError);
          // Don't fail the order creation if email fails
        }
      }

      res.status(201).json({
        status: 'success',
        message: 'Order created successfully and sent for admin approval',
        data: { order }
      });
    } catch (error) {
      console.error('Create order error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // Get user orders with categories
  async getUserOrders(req, res) {
    try {
      const { page = 1, limit = 10, category } = req.query;

      let statusFilter = {};
      
      // Filter by category
      if (category) {
        switch (category) {
          case 'ongoing':
            statusFilter = { status: { $in: ['confirmed', 'processing', 'shipped'] } };
            break;
          case 'completed':
            statusFilter = { status: 'delivered' };
            break;
          case 'cancelled':
            statusFilter = { status: { $in: ['cancelled', 'rejected'] } };
            break;
        }
      }

      const filter = { 
        user: req.user.id,
        ...statusFilter
      };

      const skip = (page - 1) * limit;
      const total = await Order.countDocuments(filter);
      const totalPages = Math.ceil(total / limit);

      const orders = await Order.find(filter)
        .sort('-createdAt')
        .skip(skip)
        .limit(Number(limit))
        .populate({
          path: 'items.product',
          select: 'name images slug size material'
        })
        .lean();

      // Add category to each order
      const ordersWithCategory = orders.map(order => ({
        ...order,
        category: order.status === 'delivered' ? 'completed' :
                 ['cancelled', 'rejected'].includes(order.status) ? 'cancelled' : 'ongoing'
      }));

      res.json({
        status: 'success',
        data: {
          orders: ordersWithCategory,
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
        .populate({
          path: 'items.product',
          select: 'name images slug size material'
        })
        .populate('user', 'firstName lastName email')
        .populate({
          path: 'timeline.updatedBy',
          select: 'firstName lastName'
        });

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

  // Manual payment proof/details endpoints removed (online payments handled by Cashfree)

  // Cancel order (only for ongoing orders)
  async cancelOrder(req, res) {
    try {
      const { reason } = req.body;
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
      if (!['confirmed'].includes(order.status)) {
        return res.status(400).json({
          status: 'error',
          message: 'Order cannot be cancelled at this stage'
        });
      }

      order.status = 'cancelled';
      order.cancelledAt = new Date();
      order.cancelReason = reason || 'Cancelled by customer';
      order.timeline.push({
        status: 'cancelled',
        note: `Order cancelled by customer. Reason: ${reason || 'No reason provided'}`,
        timestamp: new Date(),
        updatedBy: req.user.id
      });

      await order.save();

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
        .select('orderNumber status tracking timeline createdAt estimatedDelivery trackingNumber')
        .lean();

      if (!order) {
        return res.status(404).json({
          status: 'error',
          message: 'Order not found'
        });
      }

      res.json({
        status: 'success',
        data: { 
          tracking: {
            orderId: order._id,
            orderNumber: order.orderNumber,
            status: order.status,
            trackingNumber: order.trackingNumber,
            estimatedDelivery: order.estimatedDelivery,
            trackingHistory: order.timeline || []
          }
        }
      });
    } catch (error) {
      console.error('Track order error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Get order statistics
  async getOrderStats(req, res) {
    try {
      const stats = await Order.aggregate([
        {
          $match: { user: req.user.id }
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            ongoing: { 
              $sum: { 
                $cond: [
                  { $in: ['$status', ['confirmed', 'processing', 'shipped']] }, 
                  1, 
                  0
                ] 
              } 
            },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
            cancelled: { 
              $sum: { 
                $cond: [
                  { $in: ['$status', ['cancelled', 'rejected']] }, 
                  1, 
                  0
                ] 
              } 
            },
            totalValue: { $sum: '$totalAmount' }
          }
        }
      ]);

      const result = stats[0] || {
        total: 0, ongoing: 0, completed: 0, cancelled: 0, totalValue: 0
      };

      res.json({
        status: 'success',
        data: { stats: result }
      });
    } catch (error) {
      console.error('Get order stats error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Admin: Get all orders with filters
  async getAllOrders(req, res) {
    try {
      const { 
        page = 1, 
        limit = 20, 
        status, 
        paymentStatus,
        approvalStatus,
        startDate,
        endDate,
        search
      } = req.query;

      const filter = {};
      if (status) filter.status = status;
      if (paymentStatus) filter.paymentStatus = paymentStatus;
      
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(endDate);
      }

      if (search) {
        filter.$or = [
          { orderNumber: { $regex: search, $options: 'i' } },
          { 'shippingAddress.fullName': { $regex: search, $options: 'i' } },
          { 'shippingAddress.email': { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (page - 1) * limit;
      const total = await Order.countDocuments(filter);
      const totalPages = Math.ceil(total / limit);

      const orders = await Order.find(filter)
        .populate('user', 'firstName lastName email')
        .populate({
          path: 'items.product',
          select: 'name images'
        })
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

  // Admin: Approve order
  async approveOrder(req, res) {
    try {
      const { remarks } = req.body;
      const order = await Order.findById(req.params.id);

      if (!order) {
        return res.status(404).json({
          status: 'error',
          message: 'Order not found'
        });
      }

      // Orders are now auto-confirmed, but admin can still update status
      if (order.status === 'cancelled' || order.status === 'delivered') {
        return res.status(400).json({
          status: 'error',
          message: 'Cannot update status of cancelled or delivered orders'
        });
      }

      // Update product quantities when confirming order
      if (order.status !== 'confirmed' && status === 'confirmed') {
        for (const item of order.items) {
          const product = await Product.findById(item.product);
          if (product && product.trackQuantity) {
            await Product.findByIdAndUpdate(item.product, {
              $inc: { 
                quantity: -item.quantity,
                'sales.totalSold': item.quantity,
                'sales.revenue': item.price * item.quantity
              }
            });
          }
        }
      }

      order.status = 'confirmed';
      order.timeline.push({
        status: 'confirmed',
        note: `Order confirmed by admin. ${remarks ? `Remarks: ${remarks}` : ''}`,
        timestamp: new Date(),
        updatedBy: req.user.id
      });

      await order.save();

      await order.populate([
        { path: 'user', select: 'firstName lastName email' }
      ]);

      res.json({
        status: 'success',
        message: 'Order confirmed successfully',
        data: { order }
      });
    } catch (error) {
      console.error('Approve order error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Admin: Reject order
  async rejectOrder(req, res) {
    try {
      const { remarks } = req.body;
      const order = await Order.findById(req.params.id);

      if (!order) {
        return res.status(404).json({
          status: 'error',
          message: 'Order not found'
        });
      }

      if (order.status === 'cancelled' || order.status === 'delivered') {
        return res.status(400).json({
          status: 'error',
          message: 'Cannot reject cancelled or delivered orders'
        });
      }

      order.status = 'rejected';
      order.rejectedAt = new Date();
      order.rejectReason = remarks || 'Order rejected by admin';

      order.timeline.push({
        status: 'rejected',
        note: `Order rejected by admin. ${remarks ? `Reason: ${remarks}` : ''}`,
        timestamp: new Date(),
        updatedBy: req.user.id
      });

      await order.save();

      await order.populate([
        { path: 'user', select: 'firstName lastName email' }
      ]);

      res.json({
        status: 'success',
        message: 'Order rejected successfully',
        data: { order }
      });
    } catch (error) {
      console.error('Reject order error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Admin: Update order status
  async updateOrderStatus(req, res) {
    try {
      const { status, note } = req.body;

      const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'rejected'];
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
        note: note || `Order status updated to ${status} by admin`,
        timestamp: new Date(),
        updatedBy: req.user.id
      });

      if (status === 'delivered') {
        order.deliveredAt = new Date();
        order.paymentStatus = 'completed';
      }

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

  // Admin: Update shipping info
  async updateShipping(req, res) {
    try {
      const { carrier, trackingNumber, trackingUrl, estimatedDelivery } = req.body;

      const order = await Order.findById(req.params.id);
      if (!order) {
        return res.status(404).json({
          status: 'error',
          message: 'Order not found'
        });
      }

      order.trackingNumber = trackingNumber;
      if (estimatedDelivery) {
        order.estimatedDelivery = new Date(estimatedDelivery);
      }

      if (order.status === 'processing' || order.status === 'confirmed') {
        order.status = 'shipped';
        order.timeline.push({
          status: 'shipped',
          note: `Order shipped${carrier ? ` via ${carrier}` : ''}. Tracking: ${trackingNumber}`,
          timestamp: new Date(),
          updatedBy: req.user.id
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

// Legacy upload middleware removed (manual payment proof no longer supported)

module.exports = orderController;