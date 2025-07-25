// controllers/adminController.js
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');

const adminController = {
  // Get dashboard statistics
  async getDashboardStats(req, res) {
    try {
      const [
        totalUsers,
        totalProducts,
        totalOrders,
        totalRevenue,
        recentOrders,
        verifiedUsers,
        unverifiedUsers
      ] = await Promise.all([
        User.countDocuments({ role: 'user' }),
        Product.countDocuments({ status: 'active' }),
        Order.countDocuments(),
        Order.aggregate([
          { $match: { status: { $in: ['delivered', 'completed'] } } },
          { $group: { _id: null, total: { $sum: '$total' } } }
        ]),
        Order.find()
          .populate('user', 'firstName lastName email')
          .sort('-createdAt')
          .limit(5)
          .lean(),
        User.countDocuments({ role: 'user', emailVerified: true }),
        User.countDocuments({ role: 'user', emailVerified: false })
      ]);

      const revenue = totalRevenue[0]?.total || 0;

      res.json({
        status: 'success',
        data: {
          stats: {
            totalUsers,
            totalProducts,
            totalOrders,
            totalRevenue: revenue,
            verifiedUsers,
            unverifiedUsers
          },
          recentOrders: recentOrders.map(order => ({
            id: order._id,
            orderNumber: order.orderNumber || `ORD-${order._id.toString().slice(-6).toUpperCase()}`,
            customerName: order.user ? `${order.user.firstName} ${order.user.lastName}` : 'Guest',
            customerEmail: order.user?.email || 'N/A',
            status: order.status,
            total: order.total || 0,
            items: order.items?.length || 0,
            createdAt: order.createdAt
          }))
        }
      });
    } catch (error) {
      console.error('Get dashboard stats error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Get all customers (users)
  async getCustomers(req, res) {
    try {
      const { page = 1, limit = 20, search, emailVerified } = req.query;

      const filter = { role: 'user' };
      
      if (emailVerified !== undefined) {
        filter.emailVerified = emailVerified === 'true';
      }
      
      if (search) {
        filter.$or = [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (page - 1) * limit;
      const total = await User.countDocuments(filter);
      const totalPages = Math.ceil(total / limit);

      const customers = await User.find(filter)
        .select('-password')
        .sort('-createdAt')
        .skip(skip)
        .limit(Number(limit))
        .lean();

      // Get order stats for each customer
      const customersWithStats = await Promise.all(
        customers.map(async (customer) => {
          const orderStats = await Order.aggregate([
            { $match: { user: customer._id } },
            {
              $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalSpent: { $sum: '$total' }
              }
            }
          ]);

          return {
            id: customer._id,
            firstName: customer.firstName,
            lastName: customer.lastName,
            email: customer.email,
            emailVerified: customer.emailVerified,
            role: customer.role,
            totalOrders: orderStats[0]?.totalOrders || 0,
            totalSpent: orderStats[0]?.totalSpent || 0,
            createdAt: customer.createdAt,
            lastLoginAt: customer.lastLogin
          };
        })
      );

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
        message: 'Internal server error'
      });
    }
  },

  // Toggle email verification
  async toggleEmailVerification(req, res) {
    try {
      const { emailVerified } = req.body;

      const user = await User.findByIdAndUpdate(
        req.params.id,
        { emailVerified },
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
        message: `Email ${emailVerified ? 'verified' : 'unverified'} successfully`,
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
      const { role } = req.body;

      if (!['user', 'admin'].includes(role)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid role'
        });
      }

      const user = await User.findByIdAndUpdate(
        req.params.id,
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
        message: 'User role updated successfully',
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

  // Get all orders
  async getOrders(req, res) {
    try {
      const { page = 1, limit = 20, status, search } = req.query;

      const filter = {};
      if (status && status !== 'all') {
        filter.status = status;
      }
      
      if (search) {
        const users = await User.find({
          $or: [
            { firstName: { $regex: search, $options: 'i' } },
            { lastName: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } }
          ]
        }).select('_id');
        
        const userIds = users.map(user => user._id);
        filter.$or = [
          { user: { $in: userIds } },
          { orderNumber: { $regex: search, $options: 'i' } }
        ];
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

      const formattedOrders = orders.map(order => ({
        id: order._id,
        orderNumber: order.orderNumber || `ORD-${order._id.toString().slice(-6).toUpperCase()}`,
        customerName: order.user ? `${order.user.firstName} ${order.user.lastName}` : 'Guest',
        customerEmail: order.user?.email || 'N/A',
        status: order.status,
        total: order.total || 0,
        items: order.items?.length || 0,
        createdAt: order.createdAt,
        shippingAddress: order.shippingAddress || {}
      }));

      res.json({
        status: 'success',
        data: {
          orders: formattedOrders,
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

  // Update order status
  async updateOrderStatus(req, res) {
    try {
      const { status } = req.body;
      const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid order status'
        });
      }

      const order = await Order.findByIdAndUpdate(
        req.params.id,
        { status, updatedAt: new Date() },
        { new: true }
      ).populate('user', 'firstName lastName email');

      if (!order) {
        return res.status(404).json({
          status: 'error',
          message: 'Order not found'
        });
      }

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

  // Get single order details
  async getOrder(req, res) {
    try {
      const order = await Order.findById(req.params.id)
        .populate('user', 'firstName lastName email')
        .populate('items.product', 'name price images')
        .lean();

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
  }
};

module.exports = adminController;