import express from 'express';
import {
  getAllCoupons,
  validateCoupon,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  getCoupon
} from '../controllers/coupon.controller.js';
import { protectAdmin } from '../middleware/admin.middleware.js';
import validate from '../middleware/validate.middleware.js';
import { createCouponValidator } from '../validators/coupon.validator.js';

const router = express.Router();

// Public routes
router.get('/:code/validate', validateCoupon);

// Admin routes
router.get('/', protectAdmin, getAllCoupons);
router.get('/:id', protectAdmin, getCoupon);
router.post('/', protectAdmin, createCouponValidator, validate, createCoupon);
router.put('/:id', protectAdmin, updateCoupon);
router.delete('/:id', protectAdmin, deleteCoupon);

export default router;

