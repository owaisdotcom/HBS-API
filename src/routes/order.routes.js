import express from 'express';
import {
  createOrder,
  getOrders,
  getOrder,
  updateOrderStatus,
  uploadReceipt,
  verifyPayment,
  cancelOrder,
  getOrderStats
} from '../controllers/order.controller.js';
import { protect, optionalAuth } from '../middleware/auth.middleware.js';
import { protectAdmin } from '../middleware/admin.middleware.js';
import { uploadSingle } from '../middleware/upload.middleware.js';
import validate from '../middleware/validate.middleware.js';
import {
  createOrderValidator,
  updateOrderStatusValidator
} from '../validators/order.validator.js';

const router = express.Router();

// Public/User routes
router.post('/', optionalAuth, createOrderValidator, validate, createOrder);
router.get('/', protect, getOrders);
router.get('/:id', protect, getOrder);
router.post('/:id/receipt', uploadSingle, uploadReceipt);
router.put('/:id/cancel', protect, cancelOrder);

// Admin routes
router.get('/stats/summary', protectAdmin, getOrderStats);
router.put('/:id/status', protectAdmin, updateOrderStatusValidator, validate, updateOrderStatus);
router.put('/:id/verify-payment', protectAdmin, verifyPayment);

export default router;

