// routes/products.js
const express = require('express');
const { auth, adminAuth } = require('../middlewares/auth');
const productController = require('../controllers/productController');
const upload = require('../middlewares/upload');

const router = express.Router();

// Public routes
router.get('/', productController.getProducts);
router.get('/categories', productController.getCategories); // NEW: Get all categories
router.get('/new-arrivals', productController.getNewArrivals);
router.get('/sale', productController.getSaleProducts);
router.get('/search', productController.searchProducts);
router.get('/:id', productController.getProduct);

// Protected routes (Admin only)
router.post('/', adminAuth, upload.array('images', 5), productController.createProduct);
router.put('/:id', adminAuth, upload.array('images', 5), productController.updateProduct);
router.delete('/:id', adminAuth, productController.deleteProduct);

module.exports = router;