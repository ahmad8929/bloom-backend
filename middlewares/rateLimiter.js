const rateLimit = require('express-rate-limit');

const createRateLimit = ({
  windowMs = 10 * 60 * 1000,
  maxRequests = 1000,
  message = 'Too many requests',
  endpoint = 'general'
} = {}) => {
  return rateLimit({
    windowMs,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,

    // 🔴 CRITICAL FIX
    skip: (req) => {
      if (req.method === 'OPTIONS') return true;
      if (req.path === '/health' || req.path === '/api/health') return true;
      return false;
    },

    handler: (req, res) => {
      res.status(429).json({
        status: 'error',
        error: 'RATE_LIMIT_EXCEEDED',
        message,
        endpoint,
        timestamp: new Date().toISOString()
      });
    }
  });
};

const rateLimiters = {
  general: createRateLimit({ endpoint: 'general' }),
  auth: createRateLimit({ maxRequests: 50, endpoint: 'auth' }),
  orders: createRateLimit({ maxRequests: 100, windowMs: 60 * 60 * 1000, endpoint: 'orders' }),
  admin: createRateLimit({ maxRequests: 200, endpoint: 'admin' }),
  upload: createRateLimit({ maxRequests: 50, windowMs: 60 * 60 * 1000, endpoint: 'upload' }),
  passwordReset: createRateLimit({ maxRequests: 5, windowMs: 60 * 60 * 1000, endpoint: 'password-reset' }),
  products: createRateLimit({ maxRequests: 2000, endpoint: 'products' }),
  cart: createRateLimit({ maxRequests: 500, endpoint: 'cart' })
};

const logRateLimitInfo = () => {
  if (process.env.NODE_ENV === 'production') {
    console.log('🛡️ Rate limiting enabled');
  }
};

module.exports = {
  rateLimiters,
  createRateLimit,
  logRateLimitInfo
};
