// controllers/paymentController.js
const axios = require('axios');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const User = require('../models/User');
const Coupon = require('../models/Coupon');
const crypto = require('crypto');

// Get Cashfree API base URL
const getCashfreeBaseURL = () => {
  const environment = process.env.CASHFREE_ENVIRONMENT || 'TEST';
  return environment === 'PRODUCTION' 
    ? 'https://api.cashfree.com' 
    : 'https://sandbox.cashfree.com';
};

// Get Cashfree API headers
const getCashfreeHeaders = () => {
  const appId = process.env.CASHFREE_APP_ID;
  const secretKey = process.env.CASHFREE_SECRET_KEY;
  
  if (!appId || !secretKey) {
    throw new Error('Cashfree credentials not configured. Please set CASHFREE_APP_ID and CASHFREE_SECRET_KEY in your .env file');
  }
  
  return {
    'x-client-id': appId,
    'x-client-secret': secretKey,
    'x-api-version': '2023-08-01',
    'Content-Type': 'application/json'
  };
};

const paymentController = {
  // Create payment session for Cashfree
  async createPaymentSession(req, res) {
    try {
      const { shippingAddress, couponCode } = req.body;

      // Get user's cart
      const cart = await Cart.findOne({ userId: req.user.id }).populate({
        path: 'items.product',
        select: 'name price comparePrice images size material slug'
      });

      if (!cart || cart.items.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Cart is empty'
        });
      }

      // Validate stock for all items
      for (const item of cart.items) {
        const product = await Product.findById(item.productId);
        if (!product) {
          return res.status(404).json({
            status: 'error',
            message: `Product not found for item ${item.productId}`
          });
        }

        if (product.variants && product.variants.length > 0) {
          if (item.size) {
            const variantStock = product.getVariantStock(item.size);
            if (variantStock === null || variantStock < item.quantity) {
              return res.status(400).json({
                status: 'error',
                message: `Insufficient stock for ${product.name} (Size: ${item.size})`
              });
            }
          }
        } else if (product.trackQuantity && product.quantity < item.quantity) {
          return res.status(400).json({
            status: 'error',
            message: `Insufficient stock for ${product.name}`
          });
        }
      }

      // Calculate totals
      const originalSubtotal = cart.totalAmount;
      let automaticDiscount = 0;
      let couponDiscount = 0;
      let coupon = null;

      // Apply automatic discount
      if (originalSubtotal > 20000) {
        automaticDiscount = Math.round(originalSubtotal * 0.10);
      } else if (originalSubtotal > 10000) {
        automaticDiscount = Math.round(originalSubtotal * 0.04);
      }

      // Validate and apply coupon if provided
      if (couponCode) {
        coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
        
        if (!coupon) {
          return res.status(400).json({
            status: 'error',
            message: 'Invalid coupon code'
          });
        }

        const validityCheck = coupon.isValid(req.user.id);
        if (!validityCheck.valid) {
          return res.status(400).json({
            status: 'error',
            message: validityCheck.message
          });
        }

        const subtotalAfterAutoDiscount = originalSubtotal - automaticDiscount;
        const discountCalculation = coupon.calculateDiscount(subtotalAfterAutoDiscount);
        if (!discountCalculation.valid) {
          return res.status(400).json({
            status: 'error',
            message: discountCalculation.message
          });
        }

        couponDiscount = discountCalculation.discountAmount;
      }

      // Total discount
      const totalDiscount = automaticDiscount + couponDiscount;
      const subtotalAfterDiscount = originalSubtotal - totalDiscount;

      // Online payment: Free shipping
      const shipping = 0;
      const totalAmount = subtotalAfterDiscount + shipping;

      // Get user details
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }

      // Create order first (in pending state)
      const order = new Order({
        user: req.user.id,
        items: cart.items.map(item => ({
          product: item.product?._id || item.productId,
          productId: item.product?._id || item.productId,
          name: item.product?.name || 'Product',
          price: item.product?.price || 0,
          quantity: item.quantity,
          size: item.size || item.product?.size,
          color: item.color || item.product?.color || null,
          image: item.product?.images?.[0]?.url
        })),
        shippingAddress,
        paymentMethod: 'cashfree',
        subtotal: originalSubtotal,
        discount: totalDiscount,
        shipping,
        advancePayment: 0,
        tax: 0,
        totalAmount,
        couponCode: couponCode ? couponCode.toUpperCase() : undefined,
        status: 'pending',
        paymentStatus: 'pending',
        adminApproval: {
          status: 'pending'
        },
        timeline: [{
          status: 'pending',
          note: 'Order created with Cashfree payment. Awaiting payment confirmation.',
          timestamp: new Date(),
          updatedBy: req.user.id
        }]
      });

      await order.save();

      // Create payment session using Cashfree REST API
      const baseURL = getCashfreeBaseURL();
      const headers = getCashfreeHeaders();
      
      // Ensure order amount is a number and at least 1
      const orderAmount = Math.max(1, Math.round(totalAmount * 100) / 100); // Round to 2 decimal places
      
      const sessionRequest = {
        order_id: order.orderNumber,
        order_amount: orderAmount, // Must be a number, not string
        order_currency: 'INR',
        order_meta: {
          return_url: `${process.env.FRONTEND_URL}/checkout/payment-success?order_id={order_id}`,
          notify_url: `${process.env.BACKEND_URL || process.env.FRONTEND_URL}/api/payments/cashfree/webhook`,
          payment_methods: 'cc,dc,upi,nb,wallet,paylater'
        },
        customer_details: {
          customer_id: req.user.id.toString(),
          customer_name: (shippingAddress.fullName || `${user.firstName} ${user.lastName}`).substring(0, 100), // Max 100 chars
          customer_email: shippingAddress.email || user.email,
          customer_phone: (shippingAddress.phone || user.phone || '9999999999').replace(/\D/g, '').substring(0, 10) // Only digits, max 10
        },
        order_note: `Order from Bloom Tales - ${order.orderNumber}`.substring(0, 200) // Max 200 chars
      };
      
      // Validate required fields
      if (!sessionRequest.order_id || !sessionRequest.order_amount || !sessionRequest.customer_details.customer_email) {
        await Order.findByIdAndDelete(order._id);
        return res.status(400).json({
          status: 'error',
          message: 'Missing required fields for payment session',
          error: {
            order_id: !!sessionRequest.order_id,
            order_amount: !!sessionRequest.order_amount,
            customer_email: !!sessionRequest.customer_details.customer_email
          }
        });
      }

      try {
        console.log('Creating Cashfree payment session:', {
          url: `${baseURL}/pg/orders`,
          orderId: order.orderNumber,
          amount: totalAmount
        });

        const response = await axios.post(
          `${baseURL}/pg/orders`,
          sessionRequest,
          { headers }
        );

        const sessionResponse = response.data;
        console.log('Cashfree API response:', sessionResponse);

        if (!sessionResponse || !sessionResponse.payment_session_id) {
          // Delete the order if session creation fails
          await Order.findByIdAndDelete(order._id);
          return res.status(500).json({
            status: 'error',
            message: 'Failed to create payment session',
            error: sessionResponse
          });
        }

        // Store payment session ID in order
        order.paymentDetails = {
          ...order.paymentDetails,
          cashfreeSessionId: sessionResponse.payment_session_id,
          cashfreeOrderId: sessionResponse.order_id
        };
        await order.save();

        res.json({
          status: 'success',
          data: {
            paymentSessionId: sessionResponse.payment_session_id,
            orderId: order._id,
            orderNumber: order.orderNumber,
            amount: totalAmount
          }
        });
      } catch (apiError) {
        // Delete the order if API call fails
        await Order.findByIdAndDelete(order._id);
        
        console.error('Cashfree API error details:');
        console.error('Status:', apiError.response?.status);
        console.error('Status Text:', apiError.response?.statusText);
        console.error('Response Data:', JSON.stringify(apiError.response?.data, null, 2));
        console.error('Request URL:', apiError.config?.url);
        console.error('Request Headers:', apiError.config?.headers);
        console.error('Request Data:', JSON.stringify(apiError.config?.data, null, 2));
        console.error('Error Message:', apiError.message);
        
        return res.status(apiError.response?.status || 500).json({
          status: 'error',
          message: 'Failed to create payment session',
          error: process.env.NODE_ENV === 'development' 
            ? {
                status: apiError.response?.status,
                statusText: apiError.response?.statusText,
                data: apiError.response?.data,
                message: apiError.message,
                requestUrl: apiError.config?.url
              }
            : 'Please check your Cashfree credentials and try again'
        });
      }
    } catch (error) {
      console.error('Create payment session error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // Handle Cashfree webhook
  async handleWebhook(req, res) {
    try {
      const webhookSecret = process.env.CASHFREE_WEBHOOK_SECRET;
      const signature = req.headers['x-cashfree-signature'];

      // Verify webhook signature
      if (webhookSecret && signature) {
        const payload = JSON.stringify(req.body);
        const expectedSignature = crypto
          .createHmac('sha256', webhookSecret)
          .update(payload)
          .digest('hex');

        if (signature !== expectedSignature) {
          console.error('Invalid webhook signature');
          return res.status(401).json({ status: 'error', message: 'Invalid signature' });
        }
      }

      const { data } = req.body;
      const { order, payment } = data || {};

      if (!order || !payment) {
        console.error('Invalid webhook data:', JSON.stringify(req.body, null, 2));
        return res.status(400).json({ status: 'error', message: 'Invalid webhook data' });
      }

      // Find order by order number (order.orderId is the Cashfree order ID, which matches our orderNumber)
      const dbOrder = await Order.findOne({ orderNumber: order.orderId });
      if (!dbOrder) {
        console.error('Order not found for Cashfree order ID:', order.orderId);
        // Return 200 to prevent Cashfree from retrying
        return res.status(200).json({ 
          status: 'error', 
          message: 'Order not found',
          note: 'Order may have been deleted or order number mismatch'
        });
      }

      // Prevent duplicate processing - check if payment already processed
      if (dbOrder.paymentStatus === 'completed' && payment.paymentStatus === 'SUCCESS') {
        console.log('Payment already processed for order:', order.orderId);
        return res.json({ status: 'success', message: 'Payment already processed' });
      }

      // Update payment details with Cashfree payment information
      const paymentTime = payment.paymentTime ? new Date(payment.paymentTime) : new Date();
      dbOrder.paymentDetails = {
        ...dbOrder.paymentDetails,
        cashfreePaymentId: payment.paymentId,
        cashfreeTransactionId: payment.txId,
        cashfreePaymentMethod: payment.paymentMethod,
        cashfreePaymentStatus: payment.paymentStatus,
        cashfreeAmount: payment.paymentAmount?.value || payment.paymentAmount,
        cashfreeCurrency: payment.paymentAmount?.currency || 'INR',
        // Store payment date/time for consistency with other payment methods
        paymentDate: paymentTime.toISOString().split('T')[0], // Format: YYYY-MM-DD
        paymentTime: paymentTime.toTimeString().split(' ')[0].slice(0, 5), // Format: HH:MM
        transactionId: payment.txId // Also store in main transactionId field for consistency
      };

      // Update order status based on payment status
      if (payment.paymentStatus === 'SUCCESS') {
        dbOrder.paymentStatus = 'completed';
        dbOrder.status = 'awaiting_approval';
        dbOrder.timeline.push({
          status: 'awaiting_approval',
          note: `Payment successful via Cashfree. Transaction ID: ${payment.txId}`,
          timestamp: new Date(),
          updatedBy: dbOrder.user
        });

        // Update coupon usage if coupon was applied
        if (dbOrder.couponCode) {
          const coupon = await Coupon.findOne({ code: dbOrder.couponCode });
          if (coupon) {
            coupon.usageCount += 1;
            coupon.usageHistory.push({
              userId: dbOrder.user,
              orderId: dbOrder._id,
              discountAmount: dbOrder.discount,
              orderAmount: dbOrder.subtotal,
              usedAt: new Date()
            });
            await coupon.save();
          }
        }

        // Clear cart
        const cart = await Cart.findOne({ userId: dbOrder.user });
        if (cart) {
          cart.items = [];
          await cart.save();
        }
      } else if (payment.paymentStatus === 'FAILED') {
        dbOrder.paymentStatus = 'failed';
        dbOrder.status = 'cancelled';
        dbOrder.timeline.push({
          status: 'cancelled',
          note: `Payment failed via Cashfree. Reason: ${payment.paymentMessage || 'Unknown'}`,
          timestamp: new Date(),
          updatedBy: dbOrder.user
        });
      }

      await dbOrder.save();

      res.json({ status: 'success' });
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Webhook processing failed'
      });
    }
  },

  // Verify payment status
  async verifyPayment(req, res) {
    try {
      const { orderId } = req.params;

      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({
          status: 'error',
          message: 'Order not found'
        });
      }

      // Check if user owns the order
      if (order.user.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({
          status: 'error',
          message: 'Access denied'
        });
      }

      // If payment is already completed, return order status
      if (order.paymentStatus === 'completed') {
        return res.json({
          status: 'success',
          data: {
            order,
            paymentStatus: 'completed'
          }
        });
      }

      // Verify payment with Cashfree
      if (order.paymentDetails?.cashfreeOrderId) {
        try {
          const baseURL = getCashfreeBaseURL();
          const headers = getCashfreeHeaders();
          
          const orderResponse = await axios.get(
            `${baseURL}/pg/orders/${order.paymentDetails.cashfreeOrderId}`,
            { headers }
          );

          const orderData = orderResponse.data;
          if (orderData) {
            if (orderData.payment_status === 'SUCCESS') {
              // Update order status only if not already completed
              if (order.paymentStatus !== 'completed') {
                const paymentTime = new Date();
                order.paymentStatus = 'completed';
                order.status = 'awaiting_approval';
                order.paymentDetails = {
                  ...order.paymentDetails,
                  cashfreePaymentStatus: 'SUCCESS',
                  paymentDate: paymentTime.toISOString().split('T')[0], // Format: YYYY-MM-DD
                  paymentTime: paymentTime.toTimeString().split(' ')[0].slice(0, 5) // Format: HH:MM
                };
                
                // Clear cart if payment successful
                const cart = await Cart.findOne({ userId: order.user });
                if (cart) {
                  cart.items = [];
                  await cart.save();
                }
                
                await order.save();
              }

              return res.json({
                status: 'success',
                data: {
                  order,
                  paymentStatus: 'completed'
                }
              });
            } else if (orderData.payment_status === 'FAILED') {
              // Update order status if payment failed
              if (order.paymentStatus !== 'failed') {
                order.paymentStatus = 'failed';
                order.status = 'cancelled';
                order.paymentDetails = {
                  ...order.paymentDetails,
                  cashfreePaymentStatus: 'FAILED'
                };
                await order.save();
              }

              return res.json({
                status: 'success',
                data: {
                  order,
                  paymentStatus: 'failed'
                }
              });
            }
          }
        } catch (verifyError) {
          console.error('Payment verification error:', verifyError);
          // Don't fail the request if verification fails - return current status
        }
      }

      res.json({
        status: 'success',
        data: {
          order,
          paymentStatus: order.paymentStatus
        }
      });
    } catch (error) {
      console.error('Verify payment error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }
};

module.exports = paymentController;

