import express from 'express';
import {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  syncCart
} from '../controllers/cart.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { body } from 'express-validator';
import validate from '../middleware/validate.middleware.js';

import { cartLimiter } from '../middleware/rateLimiter.middleware.js';

const router = express.Router();

// All cart routes require authentication and cart rate limiting
router.use(protect);
router.use(cartLimiter);

router.get('/', getCart);
router.post('/add', [
  body('productId').optional().isMongoId().withMessage('Invalid product ID'),
  body('preMadeBundleId').optional().isMongoId().withMessage('Invalid pre-made bundle ID'),
  body('quantity').optional().isInt({ min: 1 }).withMessage('Quantity must be at least 1')
], validate, addToCart);
router.put('/update/:itemId', [
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1')
], validate, updateCartItem);
router.delete('/remove/:itemId', removeFromCart);
router.delete('/clear', clearCart);
router.post('/sync', syncCart);

export default router;

