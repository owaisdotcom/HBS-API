import express from 'express';
import multer from 'multer';
import {
  listBundleCategories,
  getBundleCategory,
  getBundleRuleForVariant,
  createBundleCategory,
  updateBundleCategory,
  deleteBundleCategory,
  listBundleCategoryVariants,
  addBundleCategoryVariant,
  updateBundleCategoryVariant,
  removeBundleCategoryVariant
} from '../controllers/bundleCategory.controller.js';
import { protectAdmin } from '../middleware/admin.middleware.js';

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  }
});
const categoryUpload = upload.fields([
  { name: 'thumbnail', maxCount: 1 },
  { name: 'coverImage', maxCount: 1 }
]);

// Public
router.get('/', listBundleCategories);
router.get('/rule', getBundleRuleForVariant);
router.get('/:id', getBundleCategory);
router.get('/:id/variants', listBundleCategoryVariants);

// Admin
router.post('/', protectAdmin, categoryUpload, createBundleCategory);
router.put('/:id', protectAdmin, categoryUpload, updateBundleCategory);
router.delete('/:id', protectAdmin, deleteBundleCategory);
router.post('/:id/variants', protectAdmin, addBundleCategoryVariant);
router.put('/:id/variants/:bvId', protectAdmin, updateBundleCategoryVariant);
router.delete('/:id/variants/:bvId', protectAdmin, removeBundleCategoryVariant);

export default router;
