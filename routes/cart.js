
// routes/cart.js
const express = require('express');
const { auth } = require('../middlewares/auth');
const cartController = require('../controllers/cartController');

const router = express.Router();

// All cart routes require authentication
router.use(auth);

router.get('/', cartController.getCart);
router.post('/add', cartController.addToCart);
router.put('/update/:itemId', cartController.updateCartItem);
router.delete('/remove/:itemId', cartController.removeFromCart);
router.delete('/clear', cartController.clearCart);
router.post('/apply-coupon', cartController.applyCoupon);
router.delete('/remove-coupon', cartController.removeCoupon);

module.exports = router;
