import express from 'express';
import {
  adminLogin,
  getAdminProfile,
  createAdmin,
  setupSuperAdmin,
  changeAdminPassword
} from '../controllers/admin.controller.js';
import { protectAdmin } from '../middleware/admin.middleware.js';
import validate from '../middleware/validate.middleware.js';
import { adminLoginValidator, setupSuperAdminValidator, createAdminValidator, changePasswordValidator } from '../validators/auth.validator.js';

const router = express.Router();

// Public routes
router.post('/setup', setupSuperAdminValidator, validate, setupSuperAdmin);
router.post('/login', adminLoginValidator, validate, adminLogin);

// Protected routes (requires authentication)
router.get('/profile', protectAdmin, getAdminProfile);
router.put('/password', protectAdmin, changePasswordValidator, validate, changeAdminPassword);

// Admin management (requires super_admin role - add middleware check if needed)
router.post('/register', protectAdmin, createAdminValidator, validate, createAdmin);

export default router;

