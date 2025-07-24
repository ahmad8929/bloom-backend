// routes/orders.js
const express = require('express');
const { auth, adminAuth } = require('../middlewares/auth');
const orderController = require('../controllers/orderController');

const router = express.Router();

// User routes
router.use(auth);
router.get('/', orderController.getUserOrders);
router.get('/:id', orderController.getOrder);
router.post('/create', orderController.createOrder);
router.post('/:id/cancel', orderController.cancelOrder);
router.get('/:id/track', orderController.trackOrder);

// Admin routes
router.get('/admin/all', adminAuth, orderController.getAllOrders);
router.patch('/:id/status', adminAuth, orderController.updateOrderStatus);
router.patch('/:id/shipping', adminAuth, orderController.updateShipping);

module.exports = router;