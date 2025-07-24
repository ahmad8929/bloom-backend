


// controllers/adminController.js
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Category = require('../models/Category');

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
        lowStockProducts
      ] = await Promise.all([
        User.countDocuments({ role: 'user' }),
        Product.countDocuments({ status: 'active' }),
        Order.countDocuments(),
        Order.aggregate([
          { $match: { 'payment.status': 'completed' } },
          { $group: { _id: null, total: { $sum: '$totals.total' } } }
        ]),
        Order.find()
          .populate('user', 'firstName lastName')
          .sort('-createdAt')
          .limit(5),
        Product.find({
          trackQuantity: true,
          $expr: { $lte: ['$quantity', '$lowStockThreshold'] }
        }).limit(10)
      ]);

      const revenue = totalRevenue[0]?.total || 0;

      // Get monthly statistics
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const monthlyStats = await Order.aggregate([
        {
          $match: {
            createdAt: { $gte: sixMonthsAgo },
            'payment.status': 'completed'
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            orders: { $sum: 1 },
            revenue: { $sum: '$totals.total' }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]);

      res.json({
        status: 'success',
        data: {
          stats: {
            totalUsers,
            totalProducts,
            totalOrders,
            totalRevenue: revenue,
            lowStockCount: lowStockProducts.length
          },
          recentOrders,
          lowStockProducts,
          monthlyStats
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

  // Get all users
  async getUsers(req, res) {
    try {
      const { page = 1, limit = 20, role, search, status } = req.query;

      const filter = {};
      if (role) filter.role = role;
      if (status) filter.isActive = status === 'active';
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

      const users = await User.find(filter)
        .select('-password')
        .sort('-createdAt')
        .skip(skip)
        .limit(Number(limit))
        .lean();

      res.json({
        status: 'success',
        data: {
          users,
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
      console.error('Get users error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Update user status
  async updateUserStatus(req, res) {
    try {
      const { isActive } = req.body;

      const user = await User.findByIdAndUpdate(
        req.params.id,
        { isActive },
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
        message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
        data: { user }
      });
    } catch (error) {
      console.error('Update user status error:', error);
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

      if (!['user', 'admin', 'super-admin'].includes(role)) {
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

  // Get low stock products
  async getLowStockProducts(req, res) {
    try {
      const products = await Product.find({
        trackQuantity: true,
        $expr: { $lte: ['$quantity', '$lowStockThreshold'] }
      })
        .populate('category', 'name')
        .sort('quantity')
        .lean();

      res.json({
        status: 'success',
        data: { products }
      });
    } catch (error) {
      console.error('Get low stock products error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Get product statistics
  async getProductStats(req, res) {
    try {
      const [
        totalProducts,
        activeProducts,
        outOfStockProducts,
        categoryStats
      ] = await Promise.all([
        Product.countDocuments(),
        Product.countDocuments({ status: 'active' }),
        Product.countDocuments({ 
          trackQuantity: true, 
          quantity: 0 
        }),
        Product.aggregate([
          { $match: { status: 'active' } },
          {
            $group: {
              _id: '$category',
              count: { $sum: 1 },
              totalValue: { $sum: { $multiply: ['$price', '$quantity'] } }
            }
          },
          {
            $lookup: {
              from: 'categories',
              localField: '_id',
              foreignField: '_id',
              as: 'category'
            }
          },
          { $unwind: '$category' },
          {
            $project: {
              categoryName: '$category.name',
              count: 1,
              totalValue: 1
            }
          }
        ])
      ]);

      res.json({
        status: 'success',
        data: {
          totalProducts,
          activeProducts,
          outOfStockProducts,
          categoryStats
        }
      });
    } catch (error) {
      console.error('Get product stats error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Get recent orders
  async getRecentOrders(req, res) {
    try {
      const { limit = 10 } = req.query;

      const orders = await Order.find()
        .populate('user', 'firstName lastName email')
        .sort('-createdAt')
        .limit(Number(limit))
        .lean();

      res.json({
        status: 'success',
        data: { orders }
      });
    } catch (error) {
      console.error('Get recent orders error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Get order statistics
  async getOrderStats(req, res) {
    try {
      const [
        totalOrders,
        pendingOrders,
        completedOrders,
        statusStats
      ] = await Promise.all([
        Order.countDocuments(),
        Order.countDocuments({ status: { $in: ['pending', 'confirmed'] } }),
        Order.countDocuments({ status: 'delivered' }),
        Order.aggregate([
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 }
            }
          }
        ])
      ]);

      res.json({
        status: 'success',
        data: {
          totalOrders,
          pendingOrders,
          completedOrders,
          statusStats
        }
      });
    } catch (error) {
      console.error('Get order stats error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Get sales analytics
  async getSalesAnalytics(req, res) {
    try {
      const { period = '30d' } = req.query;

      let startDate = new Date();
      switch (period) {
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(startDate.getDate() - 90);
          break;
        case '1y':
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
        default:
          startDate.setDate(startDate.getDate() - 30);
      }

      const salesData = await Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
            'payment.status': 'completed'
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' }
            },
            revenue: { $sum: '$totals.total' },
            orders: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
      ]);

      res.json({
        status: 'success',
        data: { salesData }
      });
    } catch (error) {
      console.error('Get sales analytics error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Get customer analytics
  async getCustomerAnalytics(req, res) {
    try {
      const [
        newCustomers,
        totalCustomers,
        topCustomers
      ] = await Promise.all([
        User.countDocuments({
          role: 'user',
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        }),
        User.countDocuments({ role: 'user' }),
        Order.aggregate([
          { $match: { 'payment.status': 'completed' } },
          {
            $group: {
              _id: '$user',
              totalSpent: { $sum: '$totals.total' },
              orderCount: { $sum: 1 }
            }
          },
          {
            $lookup: {
              from: 'users',
              localField: '_id',
              foreignField: '_id',
              as: 'user'
            }
          },
          { $unwind: '$user' },
          {
            $project: {
              name: { $concat: ['$user.firstName', ' ', '$user.lastName'] },
              email: '$user.email',
              totalSpent: 1,
              orderCount: 1
            }
          },
          { $sort: { totalSpent: -1 } },
          { $limit: 10 }
        ])
      ]);

      res.json({
        status: 'success',
        data: {
          newCustomers,
          totalCustomers,
          topCustomers
        }
      });
    } catch (error) {
      console.error('Get customer analytics error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }
};

module.exports = adminController;