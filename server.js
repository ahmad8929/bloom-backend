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

// Import custom middleware
const errorHandler = require('./middlewares/errorHandler');
const { rateLimiters } = require('./middlewares/rateLimiter');

const app = express();

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.error(err.name, err.message);
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

// Apply rate limiting before other middleware
console.log(`🛡️  Setting up rate limiting for ${process.env.NODE_ENV} environment`);

// Apply specific rate limits to specific endpoints
app.use('/api/auth/login', rateLimiters.auth);
app.use('/api/auth/register', rateLimiters.auth);
app.use('/api/auth/forgot-password', rateLimiters.passwordReset);
app.use('/api/auth/reset-password', rateLimiters.passwordReset);
app.use('/api/orders/create', rateLimiters.orders);
app.use('/api/admin', rateLimiters.admin);
app.use('/api/upload', rateLimiters.upload);

// General rate limit for all other API routes (should be last)
app.use('/api/', rateLimiters.general);

app.use(compression());

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Cookie parser
app.use(cookieParser());

// CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? [process.env.FRONTEND_URL || 'https://your-production-domain.com']
    : ['http://localhost:3001', 'http://localhost:3000', 'http://127.0.0.1:3000'],
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
  exposedHeaders: ['Content-Range', 'X-Content-Range', 'X-RateLimit-Limit', 'X-RateLimit-Remaining']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Enable pre-flight requests

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from uploads directory (fallback for local files)
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '1y',
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
  res.status(200).json({ 
    status: 'success',
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    rateLimit: {
      enabled: process.env.NODE_ENV === 'production' || process.env.RATE_LIMIT_ENABLED === 'true',
      limits: {
        general: '1000 requests per 10 minutes',
        auth: '50 requests per 10 minutes',
        orders: '100 requests per hour',
        admin: '200 requests per 10 minutes',
        passwordReset: '5 requests per hour'
      }
    }
  });
});

// Handle 404 for API routes
app.all('/api/*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: `API route ${req.originalUrl} not found`
  });
});

// Global error handler
app.use(errorHandler);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
.then(() => {
  console.log('✅ Connected to MongoDB');
  console.log(`📊 Database: ${mongoose.connection.name}`);
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// Start server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
  
  const rateLimitStatus = process.env.NODE_ENV === 'development' ? 
    'DISABLED for localhost (dev mode)' : 'ENABLED';
  console.log(`🛡️  Rate limiting: ${rateLimitStatus}`);
  
  if (process.env.NODE_ENV === 'development') {
    console.log('📝 Rate limits (will be skipped for localhost):');
    console.log('   • General API: 1000 requests/10min');
    console.log('   • Authentication: 50 requests/10min');
    console.log('   • Orders: 100 requests/hour');
    console.log('   • Admin: 200 requests/10min');
    console.log('   • Password Reset: 5 requests/hour');
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received. Shutting down gracefully');
  server.close(() => {
    console.log('💤 Process terminated');
  });
});