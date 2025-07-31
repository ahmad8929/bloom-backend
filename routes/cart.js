const express = require('express');
const { auth } = require('../middlewares/auth');
const cartController = require('../controllers/cartController');

const router = express.Router();

// All cart routes require authentication
router.use(auth);

// GET /api/cart - Get user's cart
router.get('/', cartController.getCart);

// POST /api/cart/add - Add item to cart
router.post('/add', cartController.addToCart);

// PUT /api/cart/update/:itemId - Update cart item quantity
router.put('/update/:itemId', cartController.updateCartItem);

// DELETE /api/cart/remove/:itemId - Remove item from cart
router.delete('/remove/:itemId', cartController.removeFromCart);

// DELETE /api/cart/clear - Clear entire cart
router.delete('/clear', cartController.clearCart);

// GET /api/cart/summary - Get cart summary (totals only)
router.get('/summary', cartController.getCartSummary);

module.exports = router;