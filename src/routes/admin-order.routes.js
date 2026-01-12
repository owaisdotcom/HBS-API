import express from 'express';
import {
  getOrders,
  getOrder,
  updateOrderStatus,
  verifyPayment,
  getOrderStats
} from '../controllers/order.controller.js';
import { protectAdmin } from '../middleware/admin.middleware.js';
import validate from '../middleware/validate.middleware.js';
import { updateOrderStatusValidator } from '../validators/order.validator.js';

const router = express.Router();

// All routes are admin-protected
router.get('/stats/summary', protectAdmin, getOrderStats);
router.get('/', protectAdmin, getOrders);
router.get('/:id', protectAdmin, getOrder);
router.put('/:id/status', protectAdmin, updateOrderStatusValidator, validate, updateOrderStatus);
router.put('/:id/verify-payment', protectAdmin, verifyPayment);

export default router;


