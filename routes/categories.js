// routes/categories.js
const express = require('express');
const productController = require('../controllers/productController');

const router = express.Router();

// Public routes
router.get('/:categoryId', productController.getProductsByCategory);

module.exports = router;