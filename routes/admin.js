// routes/admin.js - Add debug route
const express = require('express');
const { adminAuth } = require('../middlewares/auth');
const adminController = require('../controllers/adminController');

const router = express.Router();

// Dashboard stats
router.get('/dashboard', adminAuth, adminController.getDashboardStats);

// Customer management
router.get('/customers', adminAuth, adminController.getCustomers);
router.get('/customers/debug', adminAuth, adminController.getAllUsersDebug); // Add this debug route
router.patch('/customers/:id/email-verification', adminAuth, adminController.toggleEmailVerification);
router.patch('/customers/:id/role', adminAuth, adminController.updateUserRole);

// Order management
router.get('/orders', adminAuth, adminController.getOrders);
router.get('/orders/:id', adminAuth, adminController.getOrder);
router.patch('/orders/:id/status', adminAuth, adminController.updateOrderStatus);

// Order approval/rejection
router.patch('/orders/:id/approve', adminAuth, adminController.approveOrder);
router.patch('/orders/:id/reject', adminController.rejectOrder);

// Get orders by specific user
router.get('/users/:userId/orders', adminAuth, adminController.getOrdersByUser);

module.exports = router;