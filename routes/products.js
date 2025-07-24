
// routes/products.js
const express = require('express');
const { auth, adminAuth } = require('../middlewares/auth');
const productController = require('../controllers/productController');
const upload = require('../middlewares/upload');

const router = express.Router();

// Public routes
router.get('/', productController.getProducts);
router.get('/featured', productController.getFeaturedProducts);
router.get('/search', productController.searchProducts);
router.get('/categories/:categoryId', productController.getProductsByCategory);
router.get('/:id', productController.getProduct);

// Protected routes (Admin only)
router.post('/', adminAuth, upload.array('images', 10), productController.createProduct);
router.put('/:id', adminAuth, upload.array('images', 10), productController.updateProduct);
router.delete('/:id', adminAuth, productController.deleteProduct);
router.patch('/:id/status', adminAuth, productController.updateProductStatus);
router.patch('/:id/featured', adminAuth, productController.toggleFeatured);

// Inventory management
router.patch('/:id/inventory', adminAuth, productController.updateInventory);
router.get('/:id/inventory', adminAuth, productController.getInventory);

module.exports = router;