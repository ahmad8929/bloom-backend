// routes/coupons.js
const express = require('express');
const { adminAuth, authenticate } = require('../middlewares/auth');
const couponController = require('../controllers/couponController');

const router = express.Router();

// Public endpoint - validate coupon (optional auth for user-specific limits)
router.get('/validate', couponController.validateCoupon);

// Admin endpoints
router.post('/', adminAuth, couponController.validateCreate, couponController.createCoupon);
router.get('/', adminAuth, couponController.getAllCoupons);
router.get('/analytics', adminAuth, couponController.getCouponAnalytics);
router.get('/:id', adminAuth, couponController.getCoupon);
router.put('/:id', adminAuth, couponController.validateCreate, couponController.updateCoupon);
router.delete('/:id', adminAuth, couponController.deleteCoupon);

module.exports = router;

