// routes/profile.js
const express = require('express');
const { body } = require('express-validator');
const profileController = require('../controllers/profileController');
const { auth } = require('../middlewares/auth');

const router = express.Router();

// All routes require authentication
router.use(auth);

// Validation rules
const updateProfileValidation = [
  body('firstName').optional().trim().isLength({ min: 2 }).withMessage('First name must be at least 2 characters'),
  body('lastName').optional().trim().isLength({ min: 2 }).withMessage('Last name must be at least 2 characters'),
  body('phone').optional().trim().matches(/^[6-9]\d{9}$/).withMessage('Please enter a valid 10-digit Indian phone number'),
  body('age').optional().isInt({ min: 13, max: 120 }).withMessage('Age must be between 13 and 120'),
  body('gender').optional().isIn(['male', 'female', 'other', 'prefer-not-to-say']).withMessage('Invalid gender value')
];

const addressValidation = [
  body('fullName').trim().isLength({ min: 2 }).withMessage('Full name must be at least 2 characters'),
  body('phone').trim().matches(/^[6-9]\d{9}$/).withMessage('Please enter a valid 10-digit Indian phone number'),
  body('street').trim().isLength({ min: 5 }).withMessage('Street address must be at least 5 characters'),
  body('city').trim().isLength({ min: 2 }).withMessage('City must be at least 2 characters'),
  body('state').trim().isLength({ min: 2 }).withMessage('State must be at least 2 characters'),
  body('zipCode').trim().matches(/^[1-9][0-9]{5}$/).withMessage('Please enter a valid 6-digit pincode'),
  body('country').optional().trim(),
  body('nearbyPlaces').optional().trim(),
  body('isDefault').optional().isBoolean(),
  body('addressType').optional().isIn(['home', 'work', 'other'])
];

const updateAddressValidation = [
  body('fullName').optional().trim().isLength({ min: 2 }).withMessage('Full name must be at least 2 characters'),
  body('phone').optional().trim().matches(/^[6-9]\d{9}$/).withMessage('Please enter a valid 10-digit Indian phone number'),
  body('street').optional().trim().isLength({ min: 5 }).withMessage('Street address must be at least 5 characters'),
  body('city').optional().trim().isLength({ min: 2 }).withMessage('City must be at least 2 characters'),
  body('state').optional().trim().isLength({ min: 2 }).withMessage('State must be at least 2 characters'),
  body('zipCode').optional().trim().matches(/^[1-9][0-9]{5}$/).withMessage('Please enter a valid 6-digit pincode'),
  body('country').optional().trim(),
  body('nearbyPlaces').optional().trim(),
  body('isDefault').optional().isBoolean(),
  body('addressType').optional().isIn(['home', 'work', 'other'])
];

// Profile routes
router.get('/', profileController.getProfile);
router.put('/', updateProfileValidation, profileController.updateProfile);

// Address routes
router.get('/addresses', profileController.getAddresses);
router.post('/addresses', addressValidation, profileController.addAddress);
router.put('/addresses/:addressId', updateAddressValidation, profileController.updateAddress);
router.delete('/addresses/:addressId', profileController.deleteAddress);

module.exports = router;






