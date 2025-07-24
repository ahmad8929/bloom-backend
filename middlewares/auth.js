
// middlewares/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'error',
        message: 'Access denied. No token provided or invalid format.'
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId).select('_id role isActive');
    if (!user || !user.isActive) {
      return res.status(401).json({
        status: 'error',
        message: 'User not found or account is inactive'
      });
    }

    req.user = { id: user._id, role: user.role };
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

const checkRole = (allowedRoles) => async (req, res, next) => {
  try {
    await auth(req, res, () => {
      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({
          status: 'error',
          message: `Access denied. ${allowedRoles.join(' or ')} privileges required.`
        });
      }
      next();
    });
  } catch (error) {
    console.error(`Role check error (${allowedRoles.join(', ')}):`, error);
    res.status(403).json({
      status: 'error',
      message: 'Access denied'
    });
  }
};

const adminAuth = checkRole(['admin', 'super-admin']);
const superAdminAuth = checkRole(['super-admin']);

module.exports = { auth, adminAuth, superAdminAuth };