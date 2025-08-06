const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const adminRoutes = require('./routes/admin');
const categoryRoutes = require('./routes/categories');

// Import custom middleware
const errorHandler = require('./middlewares/errorHandler');
const { rateLimiters, logRateLimitInfo } = require('./middlewares/rateLimiter');

const app = express();

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  if (process.env.NODE_ENV === 'development') {
    console.error(err.stack);
  }
  process.exit(1);
});

// Trust proxy - important for rate limiting with reverse proxies
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(mongoSanitize());
app.use(xss());

// Setup rate limiting
console.log(`🛡️  Setting up rate limiting for ${process.env.NODE_ENV || 'development'} environment`);

// Apply specific rate limits to specific endpoints
app.use('/api/auth/login', rateLimiters.auth);
app.use('/api/auth/register', rateLimiters.auth);
app.use('/api/auth/forgot-password', rateLimiters.passwordReset);
app.use('/api/auth/reset-password', rateLimiters.passwordReset);
app.use('/api/orders/create', rateLimiters.orders);
app.use('/api/admin', rateLimiters.admin);
app.use('/api/upload', rateLimiters.upload);
app.use('/api/products', rateLimiters.products);
app.use('/api/cart', rateLimiters.cart);
app.use('/api/categories', categoryRoutes);

// General rate limit for all other API routes (should be last)
app.use('/api/', rateLimiters.general);

app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  // Production logging with more details
  app.use(morgan('combined', {
    skip: (req, res) => res.statusCode < 400 // Only log errors in production
  }));
}

// Cookie parser
app.use(cookieParser());

// CORS configuration - Flexible for API usage
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, curl)
    if (!origin) return callback(null, true);
    
    // If FRONTEND_URL is specified, use those domains
    if (process.env.FRONTEND_URL) {
      const allowedOrigins = process.env.FRONTEND_URL.split(',').map(url => url.trim());
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
    }
    
    // For development: allow localhost and common development domains
    if (process.env.NODE_ENV === 'development') {
      const devPatterns = [
        /^http:\/\/localhost:\d+$/,
        /^http:\/\/127\.0\.0\.1:\d+$/,
        /^http:\/\/192\.168\.\d+\.\d+:\d+$/,
        /^https:\/\/.*\.vercel\.app$/,
        /^https:\/\/.*\.netlify\.app$/,
        /^https:\/\/.*\.herokuapp\.com$/,
        /^https:\/\/.*\.railway\.app$/,
        /^https:\/\/.*\.render\.com$/
      ];
      
      if (devPatterns.some(pattern => pattern.test(origin))) {
        return callback(null, true);
      }
    }
    
    // For production: allow all HTTPS origins if no specific FRONTEND_URL is set
    if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) {
      if (origin.startsWith('https://')) {
        return callback(null, true);
      }
    }
    
    // Log rejected origins for debugging
    console.warn(`🚫 CORS: Origin ${origin} not allowed`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers'
  ],
  exposedHeaders: [
    'Content-Range', 
    'X-Content-Range', 
    'RateLimit-Limit', 
    'RateLimit-Remaining',
    'RateLimit-Reset'
  ]
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Enable pre-flight requests

// Body parsing middleware
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    // Log large payloads in production for monitoring
    if (process.env.NODE_ENV === 'production' && buf.length > 1024 * 1024) { // 1MB
      console.warn(`⚠️  Large payload detected: ${buf.length} bytes from ${req.ip}`);
    }
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from uploads directory (fallback for local files)
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1y' : '1h',
  etag: true,
  lastModified: true
}));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint (no rate limiting)
app.get('/api/health', (req, res) => {
  const healthData = {
    status: 'success',
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    uptime: Math.floor(process.uptime()),
    memory: process.memoryUsage(),
    rateLimit: {
      enabled: process.env.NODE_ENV === 'production' || process.env.RATE_LIMIT_ENABLED === 'true'
    }
  };

  // Only include detailed rate limit info in development
  if (process.env.NODE_ENV === 'development') {
    healthData.rateLimit.limits = {
      general: '1000 requests per 10 minutes',
      auth: '50 requests per 15 minutes',
      orders: '100 requests per hour',
      admin: '200 requests per 10 minutes',
      passwordReset: '5 requests per hour',
      products: '2000 requests per 10 minutes',
      cart: '500 requests per 10 minutes'
    };
  }

  res.status(200).json(healthData);
});

// Handle 404 for API routes
app.all('/api/*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: `API route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use(errorHandler);

// Connect to MongoDB with production-ready options
const mongoOptions = {
  maxPoolSize: 10, // Maintain up to 10 socket connections
  serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
  socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
};

mongoose.connect(process.env.MONGODB_URI, mongoOptions)
.then(() => {
  console.log('✅ Connected to MongoDB');
  if (process.env.NODE_ENV === 'development') {
    console.log(`📊 Database: ${mongoose.connection.name}`);
  }
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err.message);
  process.exit(1);
});

// Start server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
  }
  
  // Log rate limiting info
  logRateLimitInfo();
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  if (process.env.NODE_ENV === 'development') {
    console.error(err.stack);
  }
  server.close(() => {
    process.exit(1);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received. Shutting down gracefully');
  server.close(() => {
    console.log('💤 Process terminated');
    mongoose.connection.close();
  });
});

process.on('SIGINT', () => {
  console.log('👋 SIGINT received. Shutting down gracefully');
  server.close(() => {
    console.log('💤 Process terminated');
    mongoose.connection.close();
  });
});