// routes/wishlist.js
const express = require('express');
const { auth } = require('../middlewares/auth');
const wishlistController = require('../controllers/wishlistController');

const router = express.Router();

router.use(auth);

router.get('/', wishlistController.getWishlist);
router.post('/add/:productId', wishlistController.addToWishlist);
router.delete('/remove/:productId', wishlistController.removeFromWishlist);
router.delete('/clear', wishlistController.clearWishlist);

module.exports = router;