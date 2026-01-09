import express from 'express';
import {
  adminLogin,
  getAdminProfile,
  createAdmin,
  changeAdminPassword
} from '../controllers/admin.controller.js';
import { protectAdmin } from '../middleware/admin.middleware.js';
import validate from '../middleware/validate.middleware.js';
import { adminLoginValidator, changePasswordValidator } from '../validators/auth.validator.js';

const router = express.Router();

// Public routes
router.post('/login', adminLoginValidator, validate, adminLogin);

// Protected routes
router.get('/me', protectAdmin, getAdminProfile);
router.post('/create', protectAdmin, createAdmin);
router.put('/password', protectAdmin, changePasswordValidator, validate, changeAdminPassword);

export default router;

