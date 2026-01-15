// routes/payments.js
const express = require('express');
const { auth } = require('../middlewares/auth');
const paymentController = require('../controllers/paymentController');

const router = express.Router();

// Create payment session (requires authentication)
router.post('/cashfree/create-session', auth, paymentController.createPaymentSession);

// Verify payment status (requires authentication)
router.get('/cashfree/verify/:orderId', auth, paymentController.verifyPayment);

// Webhook endpoint (no authentication - Cashfree will call this)
router.post('/cashfree/webhook', paymentController.handleWebhook);

module.exports = router;

