import express from 'express';
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
import { uploadSingle } from '../middleware/upload.middleware.js';
import validate from '../middleware/validate.middleware.js';
import {
  createCategoryValidator,
  updateCategoryValidator
} from '../validators/category.validator.js';

const router = express.Router();

// Public routes
router.get('/', getAllCategories);
router.get('/flat', getFlatCategories);
router.get('/:id', getCategory);
router.get('/:id/products', getCategoryProducts);
router.get('/:id/subcategories', getSubcategories);

// Admin routes
router.post('/', protectAdmin, uploadSingle, createCategoryValidator, validate, createCategory);
router.put('/:id', protectAdmin, uploadSingle, updateCategoryValidator, validate, updateCategory);
router.delete('/:id', protectAdmin, deleteCategory);

export default router;

