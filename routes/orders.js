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

// POST /api/orders/:id/cancel - Cancel order
router.post('/:id/cancel', orderController.cancelOrder);

// GET /api/orders/:id/track - Track order
router.get('/:id/track', orderController.trackOrder);

// POST /api/orders/:id/payment-proof - Upload payment proof
router.post('/:id/payment-proof', 
  orderController.uploadPaymentProofMiddleware,
  orderController.uploadPaymentProof
);

// PATCH /api/orders/:id/payment-details - Update payment details
router.patch('/:id/payment-details', orderController.updatePaymentDetails);

// Admin routes - Require admin authentication
// These routes are now moved to admin routes but kept here for backward compatibility
router.get('/admin/all', adminAuth, orderController.getAllOrders);
router.patch('/:id/status', adminAuth, orderController.updateOrderStatus);
router.patch('/:id/shipping', adminAuth, orderController.updateShipping);
router.patch('/:id/approve', adminAuth, orderController.approveOrder);
router.patch('/:id/reject', adminAuth, orderController.rejectOrder);

module.exports = router;