import express from 'express';
import authRoutes from './auth.routes.js';
import adminRoutes from './admin.routes.js';
import productRoutes from './product.routes.js';
import categoryRoutes from './category.routes.js';
import orderRoutes from './order.routes.js';
import couponRoutes from './coupon.routes.js';
import wishlistRoutes from './wishlist.routes.js';
import reviewRoutes from './review.routes.js';
import homepageRoutes from './homepage.routes.js';
import contactRoutes from './contact.routes.js';

const router = express.Router();

// Mount routes
router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/products', productRoutes);
router.use('/categories', categoryRoutes);
router.use('/orders', orderRoutes);
router.use('/coupons', couponRoutes);
router.use('/wishlist', wishlistRoutes);
router.use('/reviews', reviewRoutes);
router.use('/homepage', homepageRoutes);
router.use('/contact', contactRoutes);

export default router;

