// controllers/paymentController.js
const axios = require('axios');
const crypto = require('crypto');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Coupon = require('../models/Coupon');

const CASHFREE_BASE =
  process.env.CASHFREE_ENVIRONMENT === 'PRODUCTION'
    ? 'https://api.cashfree.com'
    : 'https://sandbox.cashfree.com';

const CASHFREE_HEADERS = {
  'x-client-id': process.env.CASHFREE_APP_ID,
  'x-client-secret': process.env.CASHFREE_SECRET_KEY,
  'x-api-version': '2023-08-01',
  'Content-Type': 'application/json'
};

module.exports = {
  // ======================
  // CREATE PAYMENT SESSION
  // ======================
  async createPaymentSession(req, res) {
    try {
      const cart = await Cart.findOne({ userId: req.user.id }).populate('items.product');
      if (!cart || cart.items.length === 0) {
        return res.status(400).json({ message: 'Cart empty' });
      }

      const totalAmount = Math.max(1, cart.totalAmount);

      const order = await Order.create({
        user: req.user.id,
        items: cart.items,
        totalAmount,
        paymentMethod: 'cashfree',
        paymentStatus: 'pending',
        status: 'pending'
      });

      const response = await axios.post(
        `${CASHFREE_BASE}/pg/orders`,
        {
          order_id: order.orderNumber,
          order_amount: totalAmount,
          order_currency: 'INR',
          customer_details: {
            customer_id: req.user.id.toString(),
            customer_email: req.user.email,
            customer_phone: req.user.phone
          },
          order_meta: {
            return_url: `${process.env.FRONTEND_URL}/checkout/payment-status?order=${order.orderNumber}`
          }
        },
        { headers: CASHFREE_HEADERS }
      );

      order.paymentDetails = {
        cashfreeOrderId: response.data.order_id,
        cashfreeSessionId: response.data.payment_session_id
      };
      await order.save();

      res.json({
        paymentSessionId: response.data.payment_session_id,
        orderNumber: order.orderNumber
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Payment session failed' });
    }
  },

  // ======================
  // CASHFREE WEBHOOK
  // ======================
  async handleWebhook(req, res) {
    try {
      const signature = req.headers['x-webhook-signature'];
      const timestamp = req.headers['x-webhook-timestamp'];
      const secret = process.env.CASHFREE_WEBHOOK_SECRET;

      const rawBody = req.body.toString();
      const signedPayload = `${timestamp}.${rawBody}`;

      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(signedPayload)
        .digest('base64');

      if (signature !== expectedSignature) {
        return res.status(401).send('Invalid signature');
      }

      const payload = JSON.parse(rawBody);
      const { order, payment } = payload.data;

      const dbOrder = await Order.findOne({
        'paymentDetails.cashfreeOrderId': order.order_id
      });

      if (!dbOrder) return res.status(200).send('Order not found');

      // 🔁 Idempotency
      if (dbOrder.paymentDetails?.cashfreePaymentId === payment.cf_payment_id) {
        return res.status(200).send('Already processed');
      }

      if (payment.payment_status === 'SUCCESS') {
        dbOrder.paymentStatus = 'completed';
        dbOrder.status = 'awaiting_approval';
        dbOrder.paymentDetails.cashfreePaymentId = payment.cf_payment_id;

        await Cart.updateOne({ userId: dbOrder.user }, { items: [] });
      }

      if (payment.payment_status === 'FAILED') {
        dbOrder.paymentStatus = 'failed';
        dbOrder.status = 'cancelled';
      }

      await dbOrder.save();
      res.status(200).json({ received: true });
    } catch (err) {
      console.error(err);
      res.status(500).send('Webhook error');
    }
  },

  // ======================
  // REFUND
  // ======================
  async refundPayment(req, res) {
    try {
      const order = await Order.findById(req.params.orderId);
      if (!order || order.paymentStatus !== 'completed') {
        return res.status(400).json({ message: 'Refund not allowed' });
      }

      await axios.post(
        `${CASHFREE_BASE}/pg/refunds`,
        {
          refund_id: `refund_${Date.now()}`,
          refund_amount: order.totalAmount,
          refund_note: 'Order cancelled'
        },
        { headers: CASHFREE_HEADERS }
      );

      order.paymentStatus = 'refunded';
      order.status = 'refunded';
      await order.save();

      res.json({ message: 'Refund initiated' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Refund failed' });
    }
  }
};
