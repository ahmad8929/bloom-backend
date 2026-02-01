// routes/payments.js
const express = require('express');
const { auth } = require('../middlewares/auth');
const paymentController = require('../controllers/paymentController');

const router = express.Router();

// Create payment
router.post('/cashfree/create-session', auth, paymentController.createPaymentSession);

// Refund
router.post('/cashfree/refund/:orderId', auth, paymentController.refundPayment);

// Verify payment by Cashfree order number (used after redirect)
router.get(
  '/cashfree/verify-by-number/:orderNumber',
  paymentController.verifyPaymentByOrderNumber
);


module.exports = router;
