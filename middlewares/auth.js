// middlewares/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    let token;
    
    // Check for token in cookies first
    if (req.cookies && req.cookies['auth-token']) {
      token = req.cookies['auth-token'];
    } 
    // Then check Authorization header
    else {
      const authHeader = req.header('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          status: 'error',
          message: 'Access denied. No token provided.'
        });
      }
      token = authHeader.replace('Bearer ', '');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId).select('_id role isActive isEmailVerified firstName lastName email');
    if (!user || !user.isActive) {
      return res.status(401).json({
        status: 'error',
        message: 'User not found or account is inactive'
      });
    }

    // *** CRITICAL FIX: Check email verification ***
    if (!user.isEmailVerified) {
      return res.status(401).json({
        status: 'error',
        message: 'Email verification required. Please verify your email address.',
        code: 'EMAIL_NOT_VERIFIED'
      });
    }

    // Add user info to request
    req.user = {
      id: user._id,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email
    };
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'error',
        message: 'Token has expired. Please log in again.'
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token. Please log in again.'
      });
    }
    console.error('Auth middleware error:', error);
    res.status(401).json({
      status: 'error',
      message: 'Authentication failed'
    });
  }
};

// Optional: Create a separate middleware that allows unverified users (for specific routes)
const authWithoutEmailVerification = async (req, res, next) => {
  try {
    let token;
    
    // Check for token in cookies first
    if (req.cookies && req.cookies['auth-token']) {
      token = req.cookies['auth-token'];
    } 
    // Then check Authorization header
    else {
      const authHeader = req.header('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          status: 'error',
          message: 'Access denied. No token provided.'
        });
      }
      token = authHeader.replace('Bearer ', '');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId).select('_id role isActive isEmailVerified firstName lastName email');
    if (!user || !user.isActive) {
      return res.status(401).json({
        status: 'error',
        message: 'User not found or account is inactive'
      });
    }

    // Add user info to request (without email verification check)
    req.user = {
      id: user._id,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email
    };
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'error',
        message: 'Token has expired. Please log in again.'
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token. Please log in again.'
      });
    }
    console.error('Auth middleware error:', error);
    res.status(401).json({
      status: 'error',
      message: 'Authentication failed'
    });
  }
};

const adminAuth = async (req, res, next) => {
  try {
    await auth(req, res, () => {
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          status: 'error',
          message: 'Access denied. Admin privileges required.'
        });
      }
      next();
    });
  } catch (error) {
    console.error('Admin auth error:', error);
    res.status(403).json({
      status: 'error',
      message: 'Access denied'
    });
  }
};

module.exports = { auth, adminAuth, authWithoutEmailVerification };