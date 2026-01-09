import express from 'express';
import {
  getProductReviews,
  createReview,
  updateReview,
  deleteReview,
  moderateReview,
  getPendingReviews
} from '../controllers/review.controller.js';
import { protect, optionalAuth } from '../middleware/auth.middleware.js';
import { protectAdmin } from '../middleware/admin.middleware.js';
import { uploadMultiple } from '../middleware/upload.middleware.js';
import { body } from 'express-validator';
import validate from '../middleware/validate.middleware.js';

const router = express.Router();

// Public routes
router.get('/product/:productId', optionalAuth, getProductReviews);

// User routes
router.post('/', protect, uploadMultiple, [
  body('productId').isMongoId().withMessage('Invalid product ID'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('comment').trim().notEmpty().withMessage('Comment is required')
], validate, createReview);

router.put('/:id', protect, updateReview);
router.delete('/:id', protect, deleteReview);

// Admin routes
router.get('/pending', protectAdmin, getPendingReviews);
router.put('/:id/moderate', protectAdmin, [
  body('status').isIn(['approved', 'rejected']).withMessage('Invalid status')
], validate, moderateReview);

export default router;

