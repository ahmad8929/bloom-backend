// routes/payments.js
const express = require('express');
const { auth } = require('../middlewares/auth');
const paymentController = require('../controllers/paymentController');

const router = express.Router();

// Create payment
router.post('/cashfree/create-session', auth, paymentController.createPaymentSession);

// Refund
router.post('/cashfree/refund/:orderId', auth, paymentController.refundPayment);

// ❌ Webhook NOT here (handled in server.js with RAW body)

module.exports = router;
