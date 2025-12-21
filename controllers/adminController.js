// controllers/adminController.js
const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');

const adminController = {
  // Get dashboard statistics
  async getDashboardStats(req, res) {
    try {
      const [
        totalOrders,
        pendingApprovals,
        totalUsers,
        totalProducts,
        recentOrders,
        orderStats,
        revenueStats
      ] = await Promise.all([
        Order.countDocuments(),
        Order.countDocuments({ 'adminApproval.status': 'pending' }),
        User.countDocuments({ role: 'user' }),
        Product.countDocuments(),
        Order.find()
          .populate('user', 'firstName lastName email')
          .populate('items.product', 'name images')
          .sort('-createdAt')
          .limit(5)
          .lean(),
        Order.aggregate([
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 }
            }
          }
        ]),
        Order.aggregate([
          {
            $match: { status: 'delivered' }
          },
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: '$totalAmount' },
              averageOrderValue: { $avg: '$totalAmount' }
            }
          }
        ])
      ]);

      const stats = {
        totalOrders,
        pendingApprovals,
        totalUsers,
        totalProducts,
        recentOrders,
        ordersByStatus: orderStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {}),
        revenue: revenueStats[0] || { totalRevenue: 0, averageOrderValue: 0 }
      };

      res.json({
        status: 'success',
        data: { stats }
      });
    } catch (error) {
      console.error('Get dashboard stats error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Get all customers
  // async getCustomers(req, res) {
  //   try {
  //     const { page = 1, limit = 20, search } = req.query;

  //     const filter = { role: 'user' };
  //     if (search) {
  //       filter.$or = [
  //         { firstName: { $regex: search, $options: 'i' } },
  //         { lastName: { $regex: search, $options: 'i' } },
  //         { email: { $regex: search, $options: 'i' } }
  //       ];
  //     }

  //     const skip = (page - 1) * limit;
  //     const total = await User.countDocuments(filter);
  //     const totalPages = Math.ceil(total / limit);

  //     const customers = await User.find(filter)
  //       .select('-password')
  //       .sort('-createdAt')
  //       .skip(skip)
  //       .limit(Number(limit))
  //       .lean();

  //     // Get order count for each customer
  //     const customersWithStats = await Promise.all(
  //       customers.map(async (customer) => {
  //         const orderCount = await Order.countDocuments({ user: customer._id });
  //         const totalSpent = await Order.aggregate([
  //           { $match: { user: customer._id, status: 'delivered' } },
  //           { $group: { _id: null, total: { $sum: '$totalAmount' } } }
  //         ]);

  //         return {
  //           ...customer,
  //           orderCount,
  //           totalSpent: totalSpent[0]?.total || 0
  //         };
  //       })
  //     );

  //     res.json({
  //       status: 'success',
  //       data: {
  //         customers: customersWithStats,
  //         pagination: {
  //           page: Number(page),
  //           limit: Number(limit),
  //           total,
  //           totalPages,
  //           hasNext: page < totalPages,
  //           hasPrev: page > 1
  //         }
  //       }
  //     });
  //   } catch (error) {
  //     console.error('Get customers error:', error);
  //     res.status(500).json({
  //       status: 'error',
  //       message: 'Internal server error'
  //     });
  //   }
  // },

   async getCustomers(req, res) {
    try {
      const { page = 1, limit = 20, search } = req.query;

      // Build filter - REMOVE role filter to get all users
      const filter = {}; // Don't filter by role initially
      
      if (search) {
        filter.$or = [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }

      console.log('Filter being used:', JSON.stringify(filter, null, 2));

      const skip = (page - 1) * limit;
      
      // First, let's see total count without filter
      const totalUsersInDB = await User.countDocuments();
      console.log('Total users in database:', totalUsersInDB);
      
      const total = await User.countDocuments(filter);
      console.log('Total users matching filter:', total);
      
      const totalPages = Math.ceil(total / limit);

      const customers = await User.find(filter)
        .select('-password -resetPasswordToken -resetPasswordOTP -emailVerificationToken')
        .sort('-createdAt')
        .skip(skip)
        .limit(Number(limit))
        .lean();

      console.log('Found customers:', customers.length);
      console.log('Customer roles:', customers.map(c => ({ id: c._id, role: c.role, email: c.email })));

      // Get order stats for each customer
      const customersWithStats = await Promise.all(
        customers.map(async (customer) => {
          try {
            const orderCount = await Order.countDocuments({ user: customer._id });
            const totalSpentResult = await Order.aggregate([
              { $match: { user: customer._id, status: 'delivered' } },
              { $group: { _id: null, total: { $sum: '$totalAmount' } } }
            ]);

            return {
              ...customer,
              orderCount,
              totalSpent: totalSpentResult[0]?.total || 0
            };
          } catch (error) {
            console.error(`Error getting stats for customer ${customer._id}:`, error);
            return {
              ...customer,
              orderCount: 0,
              totalSpent: 0
            };
          }
        })
      );

      console.log('Final customer data:', customersWithStats.map(c => ({ 
        id: c._id, 
        email: c.email, 
        role: c.role, 
        isEmailVerified: c.isEmailVerified 
      })));

      res.json({
        status: 'success',
        data: {
          customers: customersWithStats,
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
      console.error('Get customers error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        debug: error.message
      });
    }
  },

  // Also add a function to check all users in the database
  async getAllUsersDebug(req, res) {
    try {
      const allUsers = await User.find({})
        .select('firstName lastName email role isEmailVerified isActive createdAt')
        .sort('-createdAt')
        .lean();

      console.log('All users in database:');
      allUsers.forEach((user, index) => {
        console.log(`${index + 1}. ${user.firstName} ${user.lastName} (${user.email}) - Role: ${user.role}, Verified: ${user.isEmailVerified}`);
      });

      res.json({
        status: 'success',
        data: {
          users: allUsers,
          count: allUsers.length
        }
      });
    } catch (error) {
      console.error('Debug users error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Toggle email verification status
async toggleEmailVerification(req, res) {
    try {
      const { id } = req.params;
      const { isEmailVerified } = req.body; // Note: using isEmailVerified to match User model

      const user = await User.findByIdAndUpdate(
        id,
        { isEmailVerified }, // This matches the User model field name
        { new: true }
      ).select('-password');

      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }

      res.json({
        status: 'success',
        message: `Email verification ${isEmailVerified ? 'enabled' : 'disabled'} for user`,
        data: { user }
      });
    } catch (error) {
      console.error('Toggle email verification error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Update user role
  async updateUserRole(req, res) {
    try {
      const { id } = req.params;
      const { role } = req.body;

      if (!['user', 'admin'].includes(role)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid role'
        });
      }

      const user = await User.findByIdAndUpdate(
        id,
        { role },
        { new: true }
      ).select('-password');

      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }

      res.json({
        status: 'success',
        message: `User role updated to ${role}`,
        data: { user }
      });
    } catch (error) {
      console.error('Update user role error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Get all orders for admin with detailed filters
  async getOrders(req, res) {
    try {
      const { 
        page = 1, 
        limit = 20, 
        status, 
        paymentStatus,
        approvalStatus,
        startDate,
        endDate,
        search,
        userId
      } = req.query;

      const filter = {};
      if (status) filter.status = status;
      if (paymentStatus) filter.paymentStatus = paymentStatus;
      if (approvalStatus) filter['adminApproval.status'] = approvalStatus;
      if (userId) filter.user = userId;
      
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
          select: 'name images price'
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
      console.error('Get orders error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Get single order with full details
  async getOrder(req, res) {
    try {
      const order = await Order.findById(req.params.id)
        .populate('user', 'firstName lastName email phone')
        .populate({
          path: 'items.product',
          select: 'name images price size material'
        })
        .populate('adminApproval.approvedBy', 'firstName lastName')
        .populate('adminApproval.rejectedBy', 'firstName lastName')
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

  // Approve order
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

      // Update product quantities (handle variants)
      for (const item of order.items) {
        const product = await Product.findById(item.product);
        if (!product) continue;

        // If product has variants, update variant stock
        if (product.variants && product.variants.length > 0 && item.size) {
          const variantIndex = product.variants.findIndex(v => v.size === item.size);

          if (variantIndex > -1) {
            // Update variant stock
            product.variants[variantIndex].stock = Math.max(0, product.variants[variantIndex].stock - item.quantity);
            await product.save();
          }
        } else if (product.trackQuantity) {
          // Legacy: update product quantity directly
          await Product.findByIdAndUpdate(item.product, {
            $inc: { 
              quantity: -item.quantity
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

  // Reject order
  async rejectOrder(req, res) {
    try {
      const { remarks } = req.body;
      
      if (!remarks || remarks.trim() === '') {
        return res.status(400).json({
          status: 'error',
          message: 'Rejection reason is required'
        });
      }

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
      order.rejectReason = remarks;

      order.timeline.push({
        status: 'rejected',
        note: `Order rejected by admin. Reason: ${remarks}`,
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

  // Update order status
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

  // Get orders by user
  async getOrdersByUser(req, res) {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const skip = (page - 1) * limit;
      const total = await Order.countDocuments({ user: userId });
      const totalPages = Math.ceil(total / limit);

      const orders = await Order.find({ user: userId })
        .populate({
          path: 'items.product',
          select: 'name images price'
        })
        .sort('-createdAt')
        .skip(skip)
        .limit(Number(limit))
        .lean();

      const user = await User.findById(userId).select('firstName lastName email');

      res.json({
        status: 'success',
        data: {
          user,
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
      console.error('Get orders by user error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }
};

module.exports = adminController;