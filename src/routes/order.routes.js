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
import { uploadSingle, uploadReceiptSingle } from '../middleware/upload.middleware.js';
import validate from '../middleware/validate.middleware.js';
import {
  createOrderValidator,
  updateOrderStatusValidator
} from '../validators/order.validator.js';

const router = express.Router();

// Normalize multipart fields (customer/items) before validation
const parseOrderBody = (req, _res, next) => {
  try {
    if (typeof req.body.customer === 'string') {
      req.body.customer = JSON.parse(req.body.customer);
    }
    if (typeof req.body.items === 'string') {
      req.body.items = JSON.parse(req.body.items);
    }
    if (!req.body.guestVerificationToken && req.headers['x-guest-verification-token']) {
      req.body.guestVerificationToken = req.headers['x-guest-verification-token'];
    }
  } catch (error) {
    // Let validator handle invalid payload
  }
  next();
};

// Public/User routes
router.post('/', optionalAuth, uploadReceiptSingle, parseOrderBody, createOrderValidator, validate, createOrder);
router.get('/', protect, getOrders);
router.get('/:id', optionalAuth, getOrder);
router.post('/:id/receipt', uploadReceiptSingle, uploadReceipt);
router.put('/:id/cancel', protect, cancelOrder);

export default router;

