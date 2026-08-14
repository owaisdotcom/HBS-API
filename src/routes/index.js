import express from 'express';
import authRoutes from './auth.routes.js';
import adminRoutes from './admin.routes.js';
import productRoutes from './product.routes.js';
import categoryRoutes from './category.routes.js';
import orderRoutes from './order.routes.js';
import couponRoutes from './coupon.routes.js';
import wishlistRoutes from './wishlist.routes.js';
import cartRoutes from './cart.routes.js';
import reviewRoutes from './review.routes.js';
import homepageRoutes from './homepage.routes.js';
import contactRoutes from './contact.routes.js';
import uploadRoutes from './upload.routes.js';
import announcementRoutes from './announcement.routes.js';
import termsConditionsRoutes from './termsConditions.routes.js';
import testEmailRoutes from './test-email.routes.js';
import bundleCategoryRoutes from './bundleCategory.routes.js';
import preMadeBundleRoutes from './preMadeBundle.routes.js';

import { noCache, staticCache } from '../middleware/cache.middleware.js';

const router = express.Router();

// Stock-sensitive routes (Always get fresh data, no stale stock cache)
router.use('/products', noCache, productRoutes);
router.use('/cart', noCache, cartRoutes);
router.use('/orders', noCache, orderRoutes);
router.use('/admin', noCache, adminRoutes);
router.use('/admin/upload', noCache, uploadRoutes);
router.use('/wishlist', noCache, wishlistRoutes);
router.use('/pre-made-bundles', noCache, preMadeBundleRoutes);

// Auth, Coupons & Interactive routes
router.use('/auth', noCache, authRoutes);
router.use('/coupons', noCache, couponRoutes);
router.use('/reviews', noCache, reviewRoutes);
router.use('/contact', noCache, contactRoutes);

// Static / Low-change routes (Safe caching enabled for performance)
router.use('/categories', staticCache(120), categoryRoutes);
router.use('/homepage', staticCache(300), homepageRoutes);
router.use('/announcements', staticCache(300), announcementRoutes);
router.use('/terms-conditions', staticCache(600), termsConditionsRoutes);
router.use('/bundle-categories', staticCache(120), bundleCategoryRoutes);

// Test routes (only in development)
if (process.env.NODE_ENV === 'development') {
  router.use('/test-email', noCache, testEmailRoutes);
}

export default router;

