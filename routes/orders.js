// routes/orders.js
const express = require('express');
const { auth, adminAuth } = require('../middlewares/auth');
const orderController = require('../controllers/orderController');

const router = express.Router();

// User routes - All require authentication
router.use(auth);

// GET /api/orders - Get user's orders with category filter
router.get('/', orderController.getUserOrders);

// GET /api/orders/stats - Get user's order statistics
router.get('/stats', orderController.getOrderStats);

// POST /api/orders/create - Create new order
router.post('/create', orderController.createOrder);

// GET /api/orders/:id - Get single order
router.get('/:id', orderController.getOrder);


// GET /api/orders/:id/track - Track order
router.get('/:id/track', orderController.trackOrder);

// Manual payment proof/payment details endpoints removed (online payments handled by Cashfree)

// Admin routes - Require admin authentication
// These routes are now moved to admin routes but kept here for backward compatibility
router.get('/admin/all', adminAuth, orderController.getAllOrders);
router.patch('/:id/status', adminAuth, orderController.updateOrderStatus);
router.patch('/:id/shipping', adminAuth, orderController.updateShipping);
router.patch('/:id/approve', adminAuth, orderController.approveOrder);
router.patch('/:id/reject', adminAuth, orderController.rejectOrder);

module.exports = router;