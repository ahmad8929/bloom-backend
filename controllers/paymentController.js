// controllers/paymentController.js
const axios = require('axios');
const crypto = require('crypto');
const Order = require('../models/Order');
const Cart = require('../models/Cart');

const CASHFREE_ENV = process.env.CASHFREE_ENVIRONMENT || 'SANDBOX';

const CASHFREE_BASE =
  CASHFREE_ENV === 'PRODUCTION'
    ? 'https://api.cashfree.com'
    : 'https://sandbox.cashfree.com';

const CASHFREE_HEADERS = {
  'x-client-id': process.env.CASHFREE_APP_ID,
  'x-client-secret': process.env.CASHFREE_SECRET_KEY,
  'x-api-version': '2023-08-01',
  'Content-Type': 'application/json'
};

/**
 * Helper: validate env vars early
 */
function validateCashfreeEnv() {
  if (!process.env.CASHFREE_APP_ID) return 'CASHFREE_APP_ID missing';
  if (!process.env.CASHFREE_SECRET_KEY) return 'CASHFREE_SECRET_KEY missing';
  if (!process.env.CASHFREE_ENVIRONMENT) return 'CASHFREE_ENVIRONMENT missing';
  return null;
}

module.exports = {
  // ======================
  // CREATE PAYMENT SESSION
  // ======================
// ======================
// CREATE PAYMENT SESSION
// ======================
async createPaymentSession(req, res) {
  console.log('🟡 [Cashfree] Create session called');

  // 🔍 ENV DEBUG (visible in Render logs)
  console.log('🧪 Cashfree ENV CHECK', {
    env: CASHFREE_ENV,
    hasAppId: !!process.env.CASHFREE_APP_ID,
    hasSecret: !!process.env.CASHFREE_SECRET_KEY,
    frontendURL: process.env.FRONTEND_URL
  });

  try {
    // ❌ ENV VALIDATION
    const envError = validateCashfreeEnv();
    if (envError) {
      console.error('❌ Cashfree ENV error:', envError);
      return res.status(500).json({
        message: 'Payment config error',
        error: envError
      });
    }

    // 🛒 CART
    const cart = await Cart.findOne({ userId: req.user.id }).populate(
      'items.product'
    );

    if (!cart || cart.items.length === 0) {
      console.warn('⚠️ Cart empty for user:', req.user.id);
      return res.status(400).json({ message: 'Cart empty' });
    }

    // 📦 ORDER NUMBER
    const orderNumber = `BT-${Date.now()}-${Math.floor(
      Math.random() * 1000
    )}`;

    // 📍 SHIPPING ADDRESS (REQUIRED BY SCHEMA)
    const { shippingAddress } = req.body;

    if (!shippingAddress) {
      console.error('❌ Shipping address missing');
      return res.status(400).json({
        message: 'Shipping address missing'
      });
    }

    // 🧾 BUILD ORDER ITEMS (price REQUIRED)
    const orderItems = cart.items.map(item => {
      if (!item.product || typeof item.product.price !== 'number') {
        throw new Error(`Invalid product price for item ${item._id}`);
      }

      return {
        product: item.product._id,
        quantity: item.quantity,
        size: item.size,
        price: item.product.price // 🔴 REQUIRED by schema
      };
    });

    // 💰 SUBTOTAL (REQUIRED BY SCHEMA)
    const subtotal = orderItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    if (!subtotal || subtotal < 1) {
      console.error('❌ Invalid subtotal:', subtotal);
      return res.status(400).json({
        message: 'Invalid order subtotal'
      });
    }

    // 👤 CUSTOMER DETAILS (Cashfree strict)
    const customerEmail = shippingAddress.email || req.user.email;
    const customerPhone =
      shippingAddress.phone && /^[0-9]{10}$/.test(shippingAddress.phone)
        ? shippingAddress.phone
        : '9999999999';

    if (!customerEmail) {
      console.error('❌ Customer email missing');
      return res.status(400).json({
        message: 'Customer email missing'
      });
    }

    // 🧾 CREATE ORDER (SCHEMA-SAFE)
    const order = await Order.create({
      orderNumber,
      user: req.user.id,

      items: orderItems,
      subtotal,
      totalAmount: subtotal,

      shippingAddress: {
        fullName: shippingAddress.fullName,
        email: customerEmail,
        phone: customerPhone,
        address: shippingAddress.address,
        city: shippingAddress.city,
        state: shippingAddress.state,
        pincode: shippingAddress.pincode,
        nearbyPlaces: shippingAddress.nearbyPlaces || ''
      },

      paymentMethod: 'cashfree',
      paymentStatus: 'pending',
      status: 'pending'
    });

    console.log('✅ Order created', {
      orderNumber,
      subtotal,
      user: req.user.id
    });

    // 💳 CASHFREE API CALL
    let cfResponse;
    try {
      cfResponse = await axios.post(
        `${CASHFREE_BASE}/pg/orders`,
        {
          order_id: orderNumber,
          order_amount: subtotal,
          order_currency: 'INR',
          customer_details: {
            customer_id: req.user.id.toString(),
            customer_email: customerEmail,
            customer_phone: customerPhone
          },
          order_meta: {
            return_url: `${process.env.FRONTEND_URL}/checkout/payment-success?order_id=${orderNumber}`
          }
        },
        { headers: CASHFREE_HEADERS }
      );
    } catch (cfError) {
      console.error('❌ Cashfree API FAILED', {
        status: cfError.response?.status,
        data: cfError.response?.data,
        message: cfError.message
      });

      return res.status(500).json({
        message: 'Cashfree order creation failed',
        error: cfError.response?.data || cfError.message
      });
    }

    // 💾 SAVE CASHFREE DETAILS
    order.paymentDetails = {
      cashfreeOrderId: cfResponse.data.order_id,
      cashfreeSessionId: cfResponse.data.payment_session_id
    };

    await order.save();

    console.log('✅ Cashfree session created', {
      orderNumber,
      cashfreeOrderId: cfResponse.data.order_id
    });

    // ✅ FINAL RESPONSE
    return res.json({
      status: 'success',
      data: {
        paymentSessionId: cfResponse.data.payment_session_id,
        orderNumber,
        amount: subtotal
      }
    });
  } catch (err) {
    console.error('🔥 createPaymentSession crash', err);
    return res.status(500).json({
      message: 'Payment session failed',
      error: err.message
    });
  }
},


  // ======================
  // CASHFREE WEBHOOK
  // ======================
  async handleWebhook(req, res) {
    console.log('🔔 Cashfree webhook received');

    try {
      const signature = req.headers['x-webhook-signature'];
      const timestamp = req.headers['x-webhook-timestamp'];
      const secret = process.env.CASHFREE_WEBHOOK_SECRET;

      if (!signature || !timestamp || !secret) {
        console.error('❌ Webhook header/secret missing');
        return res.status(400).send('Invalid webhook');
      }

      const rawBody = req.body.toString();
      const signedPayload = `${timestamp}.${rawBody}`;

      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(signedPayload)
        .digest('base64');

      if (signature !== expectedSignature) {
        console.error('❌ Webhook signature mismatch');
        return res.status(401).send('Invalid signature');
      }

      const payload = JSON.parse(rawBody);
      const { order, payment } = payload.data;

      console.log('📦 Webhook payload', {
        orderId: order.order_id,
        status: payment.payment_status
      });

      const dbOrder = await Order.findOne({
        'paymentDetails.cashfreeOrderId': order.order_id
      });

      if (!dbOrder) {
        console.warn('⚠️ Order not found for webhook');
        return res.status(200).send('Order not found');
      }

      // 🔁 IDEMPOTENCY
      if (
        dbOrder.paymentDetails?.cashfreePaymentId === payment.cf_payment_id
      ) {
        console.log('🔁 Webhook already processed');
        return res.status(200).send('Already processed');
      }

      if (payment.payment_status === 'SUCCESS') {
        dbOrder.paymentStatus = 'completed';
        dbOrder.status = 'awaiting_approval';
        dbOrder.paymentDetails.cashfreePaymentId =
          payment.cf_payment_id;

        await Cart.updateOne(
          { userId: dbOrder.user },
          { items: [] }
        );
      }

      if (payment.payment_status === 'FAILED') {
        dbOrder.paymentStatus = 'failed';
        dbOrder.status = 'cancelled';
      }

      await dbOrder.save();
      console.log('✅ Webhook processed successfully');

      res.status(200).json({ received: true });
    } catch (err) {
      console.error('🔥 Webhook crash', err);
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
  },

  // Verify payment by order number (used after Cashfree redirect)
async verifyPaymentByOrderNumber(req, res) {
  try {
    const { orderNumber } = req.params;

    if (!orderNumber) {
      return res.status(400).json({
        status: 'error',
        message: 'Order number is required'
      });
    }

    const order = await Order.findOne({ orderNumber });

    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found'
      });
    }

    /**
     * IMPORTANT LOGIC:
     * - If webhook already marked completed → return immediately
     * - Else fallback to Cashfree verification API
     */

    if (order.paymentStatus === 'completed') {
      return res.json({
        status: 'success',
        data: {
          order,
          paymentStatus: 'completed'
        }
      });
    }

    if (order.paymentStatus === 'failed') {
      return res.json({
        status: 'success',
        data: {
          order,
          paymentStatus: 'failed'
        }
      });
    }

    // If still pending → ask Cashfree directly
    if (order.paymentDetails?.cashfreeOrderId) {
      try {
        const baseURL = getCashfreeBaseURL();
        const headers = getCashfreeHeaders();

        const cfRes = await axios.get(
          `${baseURL}/pg/orders/${order.paymentDetails.cashfreeOrderId}`,
          { headers }
        );

        const cfOrder = cfRes.data;

        if (cfOrder?.payment_status === 'SUCCESS') {
          order.paymentStatus = 'completed';
          order.status = 'awaiting_approval';

          order.timeline.push({
            status: 'awaiting_approval',
            note: 'Payment confirmed via Cashfree verify API',
            timestamp: new Date(),
            updatedBy: order.user
          });

          await order.save();

          return res.json({
            status: 'success',
            data: {
              order,
              paymentStatus: 'completed'
            }
          });
        }

        if (cfOrder?.payment_status === 'FAILED') {
          order.paymentStatus = 'failed';
          order.status = 'cancelled';

          order.timeline.push({
            status: 'cancelled',
            note: 'Payment failed via Cashfree verify API',
            timestamp: new Date(),
            updatedBy: order.user
          });

          await order.save();

          return res.json({
            status: 'success',
            data: {
              order,
              paymentStatus: 'failed'
            }
          });
        }
      } catch (cfError) {
        console.error('Cashfree verify API error:', cfError.message);
        // DO NOT FAIL — webhook may still arrive
      }
    }

    // Default: still pending
    return res.json({
      status: 'success',
      data: {
        order,
        paymentStatus: 'pending'
      }
    });

  } catch (error) {
    console.error('verifyPaymentByOrderNumber error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to verify payment'
    });
  }
}
};
