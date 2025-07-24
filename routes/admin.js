// routes/admin.js
const express = require('express');
const { adminAuth, superAdminAuth } = require('../middlewares/auth');
const adminController = require('../controllers/adminController');

const router = express.Router();

// Dashboard stats
router.get('/dashboard', adminAuth, adminController.getDashboardStats);

// User management
router.get('/users', adminAuth, adminController.getUsers);
router.patch('/users/:id/status', adminAuth, adminController.updateUserStatus);
router.patch('/users/:id/role', superAdminAuth, adminController.updateUserRole);

// Product management
router.get('/products/low-stock', adminAuth, adminController.getLowStockProducts);
router.get('/products/stats', adminAuth, adminController.getProductStats);

// Order management
router.get('/orders/recent', adminAuth, adminController.getRecentOrders);
router.get('/orders/stats', adminAuth, adminController.getOrderStats);

// Analytics
router.get('/analytics/sales', adminAuth, adminController.getSalesAnalytics);
router.get('/analytics/customers', adminAuth, adminController.getCustomerAnalytics);

module.exports = router;