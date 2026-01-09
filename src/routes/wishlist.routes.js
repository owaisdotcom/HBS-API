import express from 'express';
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  clearWishlist,
  checkWishlist
} from '../controllers/wishlist.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { body } from 'express-validator';
import validate from '../middleware/validate.middleware.js';

const router = express.Router();

// All wishlist routes require authentication
router.use(protect);

router.get('/', getWishlist);
router.post('/add', [
  body('productId').isMongoId().withMessage('Invalid product ID')
], validate, addToWishlist);
router.delete('/remove/:productId', removeFromWishlist);
router.delete('/clear', clearWishlist);
router.get('/check/:productId', checkWishlist);

export default router;

