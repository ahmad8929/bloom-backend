// routes/products.js
const express = require('express');
const { auth, adminAuth } = require('../middlewares/auth');
const productController = require('../controllers/productController');
const upload = require('../middlewares/upload');
const uploadVideo = require('../middlewares/uploadVideo');
const multer = require('multer');

const router = express.Router();

// Public routes
router.get('/', productController.getProducts);
router.get('/categories', productController.getCategories); // NEW: Get all categories
router.get('/new-arrivals', productController.getNewArrivals);
router.get('/sale', productController.getSaleProducts);
router.get('/search', productController.searchProducts);
router.get('/:id', productController.getProduct);

// Helper middleware to handle both images and video
const handleUploads = (req, res, next) => {
  // Create storage
  const storage = multer.memoryStorage();
  
  // File filter that accepts both images and videos
  const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'), false);
    }
  };
  
  // Create multer instance with fields
  const uploadFields = multer({
    storage,
    fileFilter,
    limits: {
      fileSize: 50 * 1024 * 1024 // 50MB limit (for videos)
    }
  }).fields([
    { name: 'images', maxCount: 5 },
    { name: 'video', maxCount: 1 }
  ]);
  
  uploadFields(req, res, next);
};

// Protected routes (Admin only)
router.post('/', adminAuth, handleUploads, productController.createProduct);
router.put('/:id', adminAuth, handleUploads, productController.updateProduct);
router.delete('/:id', adminAuth, productController.deleteProduct);

module.exports = router;