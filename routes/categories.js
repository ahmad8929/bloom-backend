

// routes/categories.js
const express = require('express');
const { adminAuth } = require('../middlewares/auth');
const categoryController = require('../controllers/categoryController');
const upload = require('../middlewares/upload');

const router = express.Router();

// Public routes
router.get('/', categoryController.getCategories);
router.get('/:id', categoryController.getCategory);
router.get('/:id/products', categoryController.getCategoryProducts);

// Admin routes
router.post('/', adminAuth, upload.single('image'), categoryController.createCategory);
router.put('/:id', adminAuth, upload.single('image'), categoryController.updateCategory);
router.delete('/:id', adminAuth, categoryController.deleteCategory);

module.exports = router;