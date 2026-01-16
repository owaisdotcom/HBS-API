import express from 'express';
import {
  getAllProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  deleteProductImage,
  getFeaturedProducts,
  getNewArrivals,
  getRelatedProducts
} from '../controllers/product.controller.js';
import { protectAdmin } from '../middleware/admin.middleware.js';
import { optionalAuth } from '../middleware/auth.middleware.js';
import { uploadMultiple } from '../middleware/upload.middleware.js';
import validate from '../middleware/validate.middleware.js';
import {
  createProductValidator,
  updateProductValidator,
  getProductsValidator
} from '../validators/product.validator.js';

const router = express.Router();

// Public routes
router.get('/', getProductsValidator, validate, getAllProducts);
router.get('/search', (req, _res, next) => {
  if (req.query.q && !req.query.search) {
    req.query.search = req.query.q;
  }
  next();
}, getProductsValidator, validate, getAllProducts);
router.get('/featured', getFeaturedProducts);
router.get('/new-arrivals', getNewArrivals);
router.get('/:id', optionalAuth, getProduct);
router.get('/:id/related', getRelatedProducts);

// Admin routes
router.post('/', protectAdmin, uploadMultiple, createProductValidator, validate, createProduct);
router.put('/:id', protectAdmin, uploadMultiple, updateProductValidator, validate, updateProduct);
router.delete('/:id', protectAdmin, deleteProduct);
router.delete('/:id/images/:imageId', protectAdmin, deleteProductImage);

export default router;

