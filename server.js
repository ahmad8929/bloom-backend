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
const profileRoutes = require('./routes/profile');
const couponRoutes = require('./routes/coupons');

// Import custom middleware
const errorHandler = require('./middlewares/errorHandler');
const { rateLimiters, logRateLimitInfo } = require('./middlewares/rateLimiter');

const app = express();

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.error(err);
  process.exit(1);
});

// Trust proxy
app.set('trust proxy', 1);

// ======================
// 🔴 CORS FIRST (CRITICAL)
// ======================
// ======================
// 🔴 CORS FIRST (CRITICAL)
// ======================
const allowedOrigins = [
  'http://localhost:3000',
  'https://bloom-tales-frontend.vercel.app',
  'https://www.bloomtales.shop',
  'https://bloomtales.shop',
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow server-to-server / Postman / mobile apps
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn(`🚫 CORS blocked origin: ${origin}`);
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
  ]
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ======================
// HEALTH CHECK (Lightweight - no DB, no auth, no computation)
// Placed early to avoid unnecessary middleware processing
// ======================
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// ======================
// BODY PARSERS
// ======================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ======================
// SECURITY
// ======================
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(mongoSanitize());
app.use(xss());
app.use(cookieParser());
app.use(compression());

// ======================
// LOGGING
// ======================
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', { skip: (req, res) => res.statusCode < 400 }));
}

// ======================
// RATE LIMITERS (AFTER CORS)
// ======================
app.use('/api/auth/login', rateLimiters.auth);
app.use('/api/auth/register', rateLimiters.auth);
app.use('/api/auth/forgot-password', rateLimiters.passwordReset);
app.use('/api/auth/reset-password', rateLimiters.passwordReset);
app.use('/api/orders/create', rateLimiters.orders);
app.use('/api/admin', rateLimiters.admin);
app.use('/api/upload', rateLimiters.upload);
app.use('/api/products', rateLimiters.products);
app.use('/api/cart', rateLimiters.cart);
app.use('/api/', rateLimiters.general);

// ======================
// STATIC FILES
// ======================
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ======================
// ROUTES
// ======================
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/coupons', couponRoutes);

// ======================
// 404
// ======================
app.all('/api/*', (req, res) => {
  res.status(404).json({ status: 'error', message: 'API route not found' });
});

// ======================
// ERROR HANDLER
// ======================
app.use(errorHandler);

// ======================
// DB
// ======================
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => {
    console.error('❌ Mongo error:', err);
    process.exit(1);
  });

// ======================
// SERVER
// ======================
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on ${PORT}`);
  logRateLimitInfo();
});

process.on('unhandledRejection', (err) => {
  console.error(err);
  server.close(() => process.exit(1));
});
