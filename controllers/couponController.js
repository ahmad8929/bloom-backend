// controllers/couponController.js
const Coupon = require('../models/Coupon');
const Order = require('../models/Order');
const { body, validationResult } = require('express-validator');

const couponController = {
  // Validation rules
  validateCreate: [
    body('code')
      .trim()
      .isLength({ min: 3, max: 20 })
      .withMessage('Coupon code must be between 3 and 20 characters')
      .matches(/^[A-Z0-9]+$/)
      .withMessage('Coupon code must contain only uppercase letters and numbers'),
    body('discountType')
      .isIn(['percentage', 'fixed'])
      .withMessage('Discount type must be either percentage or fixed'),
    body('discountValue')
      .isFloat({ min: 0.01 })
      .withMessage('Discount value must be a positive number'),
    body('validUntil')
      .isISO8601()
      .withMessage('Valid until must be a valid date')
      .custom((value, { req }) => {
        if (new Date(value) <= new Date(req.body.validFrom || Date.now())) {
          throw new Error('Valid until date must be after valid from date');
        }
        return true;
      }),
    body('usageLimit')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Usage limit must be a positive integer'),
    body('minPurchaseAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Minimum purchase amount must be a non-negative number')
  ],

  // Create coupon (Admin only)
  async createCoupon(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const {
        code,
        description,
        discountType,
        discountValue,
        minPurchaseAmount,
        maxDiscountAmount,
        validFrom,
        validUntil,
        usageLimit,
        userUsageLimit,
        applicableCategories,
        applicableProducts
      } = req.body;

      // Check if code already exists
      const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
      if (existingCoupon) {
        return res.status(400).json({
          status: 'error',
          message: 'Coupon code already exists'
        });
      }

      // Validate discount value based on type
      if (discountType === 'percentage' && (discountValue < 1 || discountValue > 100)) {
        return res.status(400).json({
          status: 'error',
          message: 'Percentage discount must be between 1 and 100'
        });
      }

      const coupon = new Coupon({
        code: code.toUpperCase(),
        description,
        discountType,
        discountValue,
        minPurchaseAmount: minPurchaseAmount || 0,
        maxDiscountAmount: maxDiscountAmount || null,
        validFrom: validFrom ? new Date(validFrom) : new Date(),
        validUntil: new Date(validUntil),
        usageLimit: usageLimit || null,
        userUsageLimit: userUsageLimit || 1,
        applicableCategories: applicableCategories || [],
        applicableProducts: applicableProducts || [],
        createdBy: req.user.id,
        isActive: true
      });

      await coupon.save();

      res.status(201).json({
        status: 'success',
        message: 'Coupon created successfully',
        data: { coupon }
      });
    } catch (error) {
      console.error('Create coupon error:', error);
      if (error.code === 11000) {
        return res.status(400).json({
          status: 'error',
          message: 'Coupon code already exists'
        });
      }
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Validate coupon (Public endpoint)
  async validateCoupon(req, res) {
    try {
      const { code, subtotal } = req.query;
      const userId = req.user?.id || null;

      if (!code) {
        return res.status(400).json({
          status: 'error',
          message: 'Coupon code is required'
        });
      }

      const coupon = await Coupon.findOne({ code: code.toUpperCase() });

      if (!coupon) {
        return res.status(404).json({
          status: 'error',
          message: 'Invalid coupon code'
        });
      }

      // Check if coupon is valid
      const validityCheck = coupon.isValid(userId);
      if (!validityCheck.valid) {
        return res.status(400).json({
          status: 'error',
          message: validityCheck.message
        });
      }

      // Calculate discount if subtotal provided
      let discountInfo = null;
      if (subtotal) {
        const subtotalNum = parseFloat(subtotal);
        if (isNaN(subtotalNum) || subtotalNum < 0) {
          return res.status(400).json({
            status: 'error',
            message: 'Invalid subtotal amount'
          });
        }

        const discountCalculation = coupon.calculateDiscount(subtotalNum);
        if (!discountCalculation.valid) {
          return res.status(400).json({
            status: 'error',
            message: discountCalculation.message
          });
        }

        discountInfo = {
          discountAmount: discountCalculation.discountAmount,
          finalAmount: subtotalNum - discountCalculation.discountAmount
        };
      }

      res.json({
        status: 'success',
        message: 'Coupon is valid',
        data: {
          coupon: {
            code: coupon.code,
            description: coupon.description,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            minPurchaseAmount: coupon.minPurchaseAmount,
            maxDiscountAmount: coupon.maxDiscountAmount
          },
          discount: discountInfo
        }
      });
    } catch (error) {
      console.error('Validate coupon error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Get all coupons (Admin only)
  async getAllCoupons(req, res) {
    try {
      const { page = 1, limit = 20, status, search } = req.query;

      const filter = {};
      
      if (status === 'active') {
        const now = new Date();
        filter.isActive = true;
        filter.validFrom = { $lte: now };
        filter.validUntil = { $gte: now };
      } else if (status === 'expired') {
        filter.validUntil = { $lt: new Date() };
      } else if (status === 'inactive') {
        filter.isActive = false;
      }

      if (search) {
        filter.$or = [
          { code: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (page - 1) * limit;
      const total = await Coupon.countDocuments(filter);
      const totalPages = Math.ceil(total / limit);

      const coupons = await Coupon.find(filter)
        .populate('createdBy', 'firstName lastName email')
        .sort('-createdAt')
        .skip(skip)
        .limit(Number(limit))
        .lean();

      // Calculate analytics for each coupon
      const couponsWithAnalytics = coupons.map(coupon => {
        const totalDiscountGiven = coupon.usageHistory?.reduce(
          (sum, usage) => sum + (usage.discountAmount || 0), 
          0
        ) || 0;

        return {
          ...coupon,
          totalDiscountGiven,
          isExpired: new Date(coupon.validUntil) < new Date(),
          isCurrentlyValid: coupon.isActive && 
                           new Date() >= new Date(coupon.validFrom) && 
                           new Date() <= new Date(coupon.validUntil)
        };
      });

      res.json({
        status: 'success',
        data: {
          coupons: couponsWithAnalytics,
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
      console.error('Get all coupons error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Get single coupon (Admin only)
  async getCoupon(req, res) {
    try {
      const coupon = await Coupon.findById(req.params.id)
        .populate('createdBy', 'firstName lastName email')
        .populate('applicableProducts', 'name price images')
        .lean();

      if (!coupon) {
        return res.status(404).json({
          status: 'error',
          message: 'Coupon not found'
        });
      }

      // Get usage history with order details
      const usageHistory = await Order.find({
        couponCode: coupon.code
      })
        .populate('user', 'firstName lastName email')
        .select('orderNumber totalAmount discount createdAt')
        .sort('-createdAt')
        .lean();

      const totalDiscountGiven = coupon.usageHistory?.reduce(
        (sum, usage) => sum + (usage.discountAmount || 0), 
        0
      ) || 0;

      res.json({
        status: 'success',
        data: {
          coupon: {
            ...coupon,
            totalDiscountGiven,
            usageHistory: usageHistory.map(order => ({
              orderNumber: order.orderNumber,
              orderAmount: order.totalAmount + (order.discount || 0),
              discountAmount: order.discount || 0,
              user: order.user,
              usedAt: order.createdAt
            }))
          }
        }
      });
    } catch (error) {
      console.error('Get coupon error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Update coupon (Admin only)
  async updateCoupon(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const coupon = await Coupon.findById(req.params.id);

      if (!coupon) {
        return res.status(404).json({
          status: 'error',
          message: 'Coupon not found'
        });
      }

      const {
        description,
        discountType,
        discountValue,
        minPurchaseAmount,
        maxDiscountAmount,
        validFrom,
        validUntil,
        usageLimit,
        userUsageLimit,
        isActive,
        applicableCategories,
        applicableProducts
      } = req.body;

      // Update fields
      if (description !== undefined) coupon.description = description;
      if (discountType !== undefined) coupon.discountType = discountType;
      if (discountValue !== undefined) coupon.discountValue = discountValue;
      if (minPurchaseAmount !== undefined) coupon.minPurchaseAmount = minPurchaseAmount;
      if (maxDiscountAmount !== undefined) coupon.maxDiscountAmount = maxDiscountAmount;
      if (validFrom !== undefined) coupon.validFrom = new Date(validFrom);
      if (validUntil !== undefined) coupon.validUntil = new Date(validUntil);
      if (usageLimit !== undefined) coupon.usageLimit = usageLimit;
      if (userUsageLimit !== undefined) coupon.userUsageLimit = userUsageLimit;
      if (isActive !== undefined) coupon.isActive = isActive;
      if (applicableCategories !== undefined) coupon.applicableCategories = applicableCategories;
      if (applicableProducts !== undefined) coupon.applicableProducts = applicableProducts;

      // Validate discount value
      if (coupon.discountType === 'percentage' && (coupon.discountValue < 1 || coupon.discountValue > 100)) {
        return res.status(400).json({
          status: 'error',
          message: 'Percentage discount must be between 1 and 100'
        });
      }

      await coupon.save();

      res.json({
        status: 'success',
        message: 'Coupon updated successfully',
        data: { coupon }
      });
    } catch (error) {
      console.error('Update coupon error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Delete coupon (Admin only)
  async deleteCoupon(req, res) {
    try {
      const coupon = await Coupon.findById(req.params.id);

      if (!coupon) {
        return res.status(404).json({
          status: 'error',
          message: 'Coupon not found'
        });
      }

      // Check if coupon has been used
      if (coupon.usageCount > 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Cannot delete coupon that has been used. Deactivate it instead.'
        });
      }

      await Coupon.findByIdAndDelete(req.params.id);

      res.json({
        status: 'success',
        message: 'Coupon deleted successfully'
      });
    } catch (error) {
      console.error('Delete coupon error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  },

  // Get coupon analytics (Admin only)
  async getCouponAnalytics(req, res) {
    try {
      const { startDate, endDate } = req.query;

      const matchFilter = {};
      if (startDate || endDate) {
        matchFilter.createdAt = {};
        if (startDate) matchFilter.createdAt.$gte = new Date(startDate);
        if (endDate) matchFilter.createdAt.$lte = new Date(endDate);
      }

      const analytics = await Coupon.aggregate([
        { $match: matchFilter },
        {
          $project: {
            code: 1,
            discountType: 1,
            discountValue: 1,
            usageCount: 1,
            usageLimit: 1,
            validFrom: 1,
            validUntil: 1,
            isActive: 1,
            createdAt: 1,
            totalDiscountGiven: {
              $sum: '$usageHistory.discountAmount'
            },
            totalOrders: {
              $size: { $ifNull: ['$usageHistory', []] }
            },
            totalRevenue: {
              $sum: '$usageHistory.orderAmount'
            }
          }
        },
        {
          $sort: { createdAt: -1 }
        }
      ]);

      // Overall statistics
      const overallStats = {
        totalCoupons: analytics.length,
        activeCoupons: analytics.filter(c => c.isActive && new Date(c.validUntil) >= new Date()).length,
        expiredCoupons: analytics.filter(c => new Date(c.validUntil) < new Date()).length,
        totalUsage: analytics.reduce((sum, c) => sum + (c.usageCount || 0), 0),
        totalDiscountGiven: analytics.reduce((sum, c) => sum + (c.totalDiscountGiven || 0), 0),
        totalOrders: analytics.reduce((sum, c) => sum + (c.totalOrders || 0), 0),
        totalRevenue: analytics.reduce((sum, c) => sum + (c.totalRevenue || 0), 0)
      };

      res.json({
        status: 'success',
        data: {
          analytics,
          overallStats
        }
      });
    } catch (error) {
      console.error('Get coupon analytics error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }
};

module.exports = couponController;




