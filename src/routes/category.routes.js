import express from 'express';
import multer from 'multer';
import {
  getAllCategories,
  getFlatCategories,
  getCategory,
  getCategoryProducts,
  createCategory,
  updateCategory,
  deleteCategory,
  getSubcategories
} from '../controllers/category.controller.js';
import { protectAdmin } from '../middleware/admin.middleware.js';
import validate from '../middleware/validate.middleware.js';
import {
  createCategoryValidator,
  updateCategoryValidator
} from '../validators/category.validator.js';

const router = express.Router();

// Configure multer for category images
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

const categoryUpload = upload.fields([
  { name: 'thumbnail', maxCount: 1 },
  { name: 'coverImage', maxCount: 1 }
]);

// Public routes
router.get('/', getAllCategories);
router.get('/flat', getFlatCategories);
router.get('/:id', getCategory);
router.get('/:id/products', getCategoryProducts);
router.get('/:id/subcategories', getSubcategories);

// Admin routes
router.post('/', protectAdmin, categoryUpload, createCategoryValidator, validate, createCategory);
router.put('/:id', protectAdmin, categoryUpload, updateCategoryValidator, validate, updateCategory);
router.delete('/:id', protectAdmin, deleteCategory);

export default router;

