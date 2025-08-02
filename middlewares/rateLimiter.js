const rateLimit = require('express-rate-limit');

/**
 * Create a rate limiter with smart development/production configuration
 * @param {Object} options - Rate limiter configuration
 * @returns {Function} Express rate limiter middleware
 */
const createRateLimit = (options = {}) => {
  const {
    windowMs = 10 * 60 * 1000, // 10 minutes default
    maxRequests = 1000,
    message = 'Too many requests from this IP, please try again later',
    skipSuccessfulRequests = false,
    endpoint = 'general',
    skipFailedRequests = false
  } = options;

  return rateLimit({
    windowMs,
    max: maxRequests,
    
    // Enhanced error message with helpful information
    message: {
      status: 'error',
      error: 'RATE_LIMIT_EXCEEDED',
      message,
      details: {
        limit: maxRequests,
        windowMs,
        retryAfter: Math.ceil(windowMs / 1000),
        endpoint
      },
      timestamp: new Date().toISOString()
    },
    
    // Use standard headers for rate limiting info
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    
    skipSuccessfulRequests,
    skipFailedRequests,
    
    // Skip rate limiting in development for localhost
    skip: (req) => {
      // Always skip health check endpoint
      if (req.path === '/api/health') {
        return true;
      }
      
      // Skip for development environment localhost
      if (process.env.NODE_ENV === 'development') {
        const isLocalhost = req.ip === '127.0.0.1' || 
                          req.ip === '::1' || 
                          req.ip === '::ffff:127.0.0.1' ||
                          req.hostname === 'localhost' ||
                          req.get('host')?.includes('localhost');
        
        if (isLocalhost) {
          console.log(`🚀 Rate limit skipped for localhost: ${req.method} ${req.path}`);
          return true;
        }
      }
      
      // Skip for trusted IPs (if configured)
      const trustedIPs = process.env.TRUSTED_IPS?.split(',') || [];
      if (trustedIPs.includes(req.ip)) {
        console.log(`✅ Rate limit skipped for trusted IP: ${req.ip}`);
        return true;
      }
      
      return false;
    },
    
    // Smart key generator based on user authentication
    keyGenerator: (req) => {
      // For authenticated users, use user ID + IP combination
      // This allows multiple devices for the same user while still preventing abuse
      if (req.user?.id) {
        return `user:${req.user.id}:${req.ip}`;
      }
      
      // For anonymous users, use IP address
      return `ip:${req.ip}`;
    },
    
    // Custom handler with detailed logging
    handler: (req, res, next) => {
      const clientInfo = {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
        userId: req.user?.id || 'anonymous'
      };
      
      console.warn(`⚠️  Rate limit exceeded:`, {
        ...clientInfo,
        endpoint,
        limit: maxRequests,
        window: `${windowMs / 1000}s`
      });
      
      // Set retry-after header
      res.set('Retry-After', Math.ceil(windowMs / 1000));
      
      // Send structured error response
      res.status(429).json({
        status: 'error',
        error: 'RATE_LIMIT_EXCEEDED',
        message,
        details: {
          limit: maxRequests,
          windowMs,
          retryAfter: Math.ceil(windowMs / 1000),
          endpoint,
          resetTime: new Date(Date.now() + windowMs).toISOString()
        },
        timestamp: new Date().toISOString()
      });
    },
    
    // Log when someone is approaching the limit (at 80%)
    onLimitReached: (req, res, options) => {
      console.warn(`🔥 Rate limit almost reached (80%): ${req.ip} on ${req.path}`);
    }
  });
};

// Define all rate limiters with your requested generous limits
const rateLimiters = {
  // General API rate limit - 1000 requests per 10 minutes as requested
  general: createRateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    maxRequests: 1000,
    message: 'Too many API requests, please try again later',
    endpoint: 'general'
  }),
  
  // Authentication endpoints - more restrictive to prevent brute force
  auth: createRateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    maxRequests: 50, // 50 login attempts per 10 minutes
    message: 'Too many authentication attempts, please try again later',
    skipSuccessfulRequests: true, // Don't count successful logins against the limit
    endpoint: 'auth'
  }),
  
  // Order creation - prevent spam orders
  orders: createRateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 100, // 100 orders per hour
    message: 'Too many orders created, please try again later',
    endpoint: 'orders'
  }),
  
  // Admin endpoints - moderate restriction
  admin: createRateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    maxRequests: 1000, // 200 admin actions per 10 minutes
    message: 'Too many admin requests, please try again later',
    endpoint: 'admin'
  }),
  
  // File upload endpoints
  upload: createRateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 200, // 50 uploads per hour
    message: 'Too many file uploads, please try again later',
    endpoint: 'upload'
  }),
  
  // Password reset - very restrictive to prevent abuse
  passwordReset: createRateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 5, // Only 5 password reset attempts per hour
    message: 'Too many password reset attempts, please try again later',
    endpoint: 'password-reset'
  }),
  
  // Products endpoint - very generous for browsing
  products: createRateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    maxRequests: 3000, // 2000 product requests per 10 minutes
    message: 'Too many product requests, please try again later',
    endpoint: 'products'
  }),
  
  // Cart operations - generous for good UX
  cart: createRateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    maxRequests: 1000, // 500 cart operations per 10 minutes
    message: 'Too many cart operations, please try again later',
    endpoint: 'cart'
  })
};

// Utility function to get rate limiter by name
const getRateLimiter = (name) => {
  const limiter = rateLimiters[name];
  if (!limiter) {
    console.warn(`⚠️  Unknown rate limiter: ${name}, using general limiter`);
    return rateLimiters.general;
  }
  return limiter;
};

// Export rate limiters and utility functions
module.exports = {
  createRateLimit,
  rateLimiters,
  getRateLimiter
};