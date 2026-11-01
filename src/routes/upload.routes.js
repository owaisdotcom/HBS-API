import express from 'express';
import { uploadSingleImage, migrateCloudinaryToR2Admin, migrateImageUrlsToR2Admin, proxyImage } from '../controllers/upload.controller.js';
import { protectAdmin } from '../middleware/admin.middleware.js';
import { uploadSingle } from '../middleware/upload.middleware.js';

const router = express.Router();

// Proxy remote image with CORS headers for canvas cropping
router.get('/proxy-image', proxyImage);

// Admin only - Upload single image
router.post('/image', protectAdmin, uploadSingle, uploadSingleImage);

// Admin only - Trigger Cloudinary to R2 Database Migration
router.post('/migrate-r2', protectAdmin, migrateCloudinaryToR2Admin);

// Admin only - Trigger Dual R2 Image URLs Migration
router.post('/migrate-image-urls-to-r2', protectAdmin, migrateImageUrlsToR2Admin);

export default router;
