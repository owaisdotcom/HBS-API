import express from 'express';
import { uploadSingleImage } from '../controllers/upload.controller.js';
import { protectAdmin } from '../middleware/admin.middleware.js';
import { uploadSingle } from '../middleware/upload.middleware.js';

const router = express.Router();

// Admin only - Upload single image
router.post('/image', protectAdmin, uploadSingle, uploadSingleImage);

export default router;

