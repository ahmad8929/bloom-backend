// controllers/orderController.js
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const User = require('../models/User');
const { sendEmail } = require('../utils/email');
const { uploadToCloudinary } = require('../utils/cloudinary');
const upload = require('../middlewares/upload');

const orderController = {
  // Create order
  async createOrder(req, res) {
    try {
      const { shippingAddress, paymentMethod, paymentDetails } = req.body;

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

      // Validate stock for all items
      for (const item of cart.items) {
        const product = await Product.findById(item.productId);
        if (product && product.trackQuantity && product.quantity < item.quantity) {
          return res.status(400).json({
            status: 'error',
            message: `Insufficient stock for ${product.name}`
          });
        }
      }

      // Calculate totals
      const subtotal = cart.totalAmount;
      const shipping = subtotal > 1000 ? 0 : 99; // Free shipping above ₹1000
      const tax = Math.round(subtotal * 0.18); // 18% GST
      const totalAmount = subtotal + shipping + tax;

      // Create order
      const order = new Order({
        user: req.user.id,
        items: cart.items.map(item => ({
          product: item.product._id,
          productId: item.product._id,
          name: item.product.name,
          price: item.product.price,
          quantity: item.quantity,
          size: item.size || item.product.size,
          image: item.product.images[0]?.url
        })),
        shippingAddress,
        paymentMethod,
        subtotal,
        shipping,
        tax,
        totalAmount,
        status: 'awaiting_approval', // Changed to awaiting_approval instead of pending
        adminApproval: {
          status: 'pending'
        },
        timeline: [{
          status: 'awaiting_approval',
          note: 'Order created and awaiting admin approval',
          timestamp: new Date(),
          updatedBy: req.user.id
        }]
      });

      // Handle payment details for UPI
      if (paymentMethod === 'upi' && paymentDetails) {
        order.paymentDetails = {
          payerName: paymentDetails.payerName,
          transactionId: paymentDetails.transactionId,
          paymentDate: paymentDetails.paymentDate,
          paymentTime: paymentDetails.paymentTime,
          amount: paymentDetails.amount
        };
        order.paymentStatus = 'completed';
      } else if (paymentMethod === 'cod') {
        order.paymentStatus = 'pending';
      }

      // Save order
      await order.save();

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
            statusFilter = { status: { $in: ['awaiting_approval', 'confirmed', 'processing', 'shipped'] } };
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
        .populate('adminApproval.approvedBy', 'firstName lastName')
        .populate('adminApproval.rejectedBy', 'firstName lastName');

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

  // Upload payment proof
  async uploadPaymentProof(req, res) {
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

      if (!req.file) {
        return res.status(400).json({
          status: 'error',
          message: 'Payment proof image is required'
        });
      }

      try {
        // Upload to Cloudinary
        const result = await uploadToCloudinary(req.file.buffer, 'payment-proofs');

        // Update order with payment proof
        order.paymentDetails = order.paymentDetails || {};
        order.paymentDetails.paymentProof = {
          url: result.secure_url,
          publicId: result.public_id,
          uploadedAt: new Date()
        };

        // Add timeline entry
        order.timeline.push({
          status: order.status,
          note: 'Payment proof uploaded by customer',
          timestamp: new Date(),
          updatedBy: req.user.id
        });

        await order.save();

        res.json({
          status: 'success',
          message: 'Payment proof uploaded successfully',
          data: { 
            order,
            paymentProof: order.paymentDetails.paymentProof
          }
        });
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        res.status(500).json({
          status: 'error',
          message: 'Failed to upload payment proof'
        });
      }
    } catch (error) {
      console.error('Upload payment proof error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Update payment details
  async updatePaymentDetails(req, res) {
    try {
      const { paymentDetails } = req.body;
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

      // Check if order allows payment updates
      if (!['awaiting_approval', 'pending'].includes(order.status)) {
        return res.status(400).json({
          status: 'error',
          message: 'Payment details cannot be updated for this order'
        });
      }

      // Update payment details
      order.paymentDetails = {
        ...order.paymentDetails,
        ...paymentDetails
      };

      if (paymentDetails.transactionId) {
        order.paymentStatus = 'completed';
        order.timeline.push({
          status: order.status,
          note: 'Payment details updated',
          timestamp: new Date(),
          updatedBy: req.user.id
        });
      }

      await order.save();

      res.json({
        status: 'success',
        message: 'Payment details updated successfully',
        data: { order }
      });
    } catch (error) {
      console.error('Update payment details error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

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
      if (!['awaiting_approval', 'confirmed'].includes(order.status)) {
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
        .select('orderNumber status tracking timeline createdAt estimatedDelivery trackingNumber adminApproval')
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
            adminApproval: order.adminApproval,
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
                  { $in: ['$status', ['awaiting_approval', 'confirmed', 'processing', 'shipped']] }, 
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
      if (approvalStatus) filter['adminApproval.status'] = approvalStatus;
      
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
        .populate('adminApproval.approvedBy', 'firstName lastName')
        .populate('adminApproval.rejectedBy', 'firstName lastName')
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

      if (order.adminApproval.status !== 'pending') {
        return res.status(400).json({
          status: 'error',
          message: 'Order has already been processed'
        });
      }

      order.adminApproval.status = 'approved';
      order.adminApproval.approvedBy = req.user.id;
      order.adminApproval.approvedAt = new Date();
      order.adminApproval.remarks = remarks;
      order.status = 'confirmed';

      order.timeline.push({
        status: 'confirmed',
        note: `Order approved by admin. ${remarks ? `Remarks: ${remarks}` : ''}`,
        timestamp: new Date(),
        updatedBy: req.user.id
      });

      await order.save();

      // Update product quantities
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

      await order.populate([
        { path: 'user', select: 'firstName lastName email' },
        { path: 'adminApproval.approvedBy', select: 'firstName lastName' }
      ]);

      res.json({
        status: 'success',
        message: 'Order approved successfully',
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

      if (order.adminApproval.status !== 'pending') {
        return res.status(400).json({
          status: 'error',
          message: 'Order has already been processed'
        });
      }

      order.adminApproval.status = 'rejected';
      order.adminApproval.rejectedBy = req.user.id;
      order.adminApproval.rejectedAt = new Date();
      order.adminApproval.remarks = remarks;
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
        { path: 'user', select: 'firstName lastName email' },
        { path: 'adminApproval.rejectedBy', select: 'firstName lastName' }
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

      const validStatuses = ['pending', 'awaiting_approval', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'rejected'];
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

// Export upload middleware along with controller
orderController.uploadPaymentProofMiddleware = upload.single('paymentProof');

module.exports = orderController;