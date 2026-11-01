import express from 'express';
import {
  adminLogin,
  getAdminProfile,
  createAdmin,
  setupSuperAdmin,
  changeAdminPassword,
  forceResetAdminPassword
} from '../controllers/admin.controller.js';
import { getDashboardOverview } from '../controllers/admin-dashboard.controller.js';
import { protectAdmin } from '../middleware/admin.middleware.js';
import validate from '../middleware/validate.middleware.js';
import { adminLoginValidator, setupSuperAdminValidator, createAdminValidator, changePasswordValidator } from '../validators/auth.validator.js';
import userRoutes from './user.routes.js';
import adminOrderRoutes from './admin-order.routes.js';
import homepageRoutes from './homepage.routes.js';
import testimonialRoutes from './testimonial.routes.js';
import errorLogRoutes from './error-log.routes.js';

import {
  authLimiter,
  signupLimiter,
  passwordResetLimiter,
  adminLimiter
} from '../middleware/rateLimiter.middleware.js';

const router = express.Router();

// Public routes
router.post('/setup', signupLimiter, setupSuperAdminValidator, validate, setupSuperAdmin);
router.post('/login', authLimiter, adminLoginValidator, validate, adminLogin);
router.post('/force-reset-password', passwordResetLimiter, forceResetAdminPassword);

import { migrateCloudinaryToR2Admin, migrateImageUrlsToR2Admin } from '../controllers/upload.controller.js';

// Protected routes (requires authentication)
router.get('/profile', protectAdmin, getAdminProfile);
router.put('/password', protectAdmin, changePasswordValidator, validate, changeAdminPassword);
router.get('/dashboard/overview', protectAdmin, adminLimiter, getDashboardOverview);
router.post('/migrate-image-urls-to-r2', protectAdmin, migrateImageUrlsToR2Admin);
router.post('/migrate-r2', protectAdmin, migrateCloudinaryToR2Admin);

// Admin management (requires super_admin role - add middleware check if needed)
router.post('/register', protectAdmin, signupLimiter, createAdminValidator, validate, createAdmin);

// User management routes
router.use('/users', userRoutes);

// Order management routes (admin-specific)
router.use('/orders', adminOrderRoutes);

// Homepage management routes
router.use('/homepage', homepageRoutes);

// Testimonials (homepage reviews) management
router.use('/testimonials', testimonialRoutes);

// Error log management routes (admin-only)
router.use('/error-logs', errorLogRoutes);

export default router;
