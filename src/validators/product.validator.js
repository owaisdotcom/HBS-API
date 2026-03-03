import { body, query } from 'express-validator';

export const createProductValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Product name is required')
    .isLength({ min: 2, max: 200 })
    .withMessage('Product name must be between 2 and 200 characters'),
  
  body('slug')
    .trim()
    .notEmpty()
    .withMessage('Slug is required')
    .matches(/^[a-z0-9-]+$/)
    .withMessage('Slug can only contain lowercase letters, numbers, and hyphens'),
  
  body('categories')
    .notEmpty()
    .withMessage('Category is required')
    .bail()
    .custom((val, { req }) => {
      let arr = val;
      if (typeof val === 'string') {
        try {
          arr = JSON.parse(val);
          req.body.categories = arr;
        } catch (e) {
          throw new Error('Categories must be an array');
        }
      }
      if (!Array.isArray(arr)) {
        throw new Error('Categories must be an array');
      }
      if (!arr.every(id => typeof id === 'string' && id.match(/^[0-9a-fA-F]{24}$/))) {
        throw new Error('One or more category IDs are invalid');
      }
      return true;
    }),
  
  body('price')
    .notEmpty()
    .withMessage('Price is required')
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number'),
  
  body('stock')
    .notEmpty()
    .withMessage('Stock is required')
    .isInt({ min: 0 })
    .withMessage('Stock must be a non-negative integer'),
  
  body('description')
    .optional()
    .trim(),
  
  body('originalPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Original price must be a positive number'),
  
  body('sku')
    .optional()
    .trim()
];

export const updateProductValidator = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Product name must be between 2 and 200 characters'),
  
  body('slug')
    .optional()
    .trim()
    .matches(/^[a-z0-9-]+$/)
    .withMessage('Slug can only contain lowercase letters, numbers, and hyphens'),
  
  body('categories')
    .optional()
    .bail()
    .custom((val, { req }) => {
      if (val === undefined || val === null) return true;
      let arr = val;
      if (typeof val === 'string') {
        try {
          arr = JSON.parse(val);
          req.body.categories = arr;
        } catch (e) {
          throw new Error('Categories must be an array');
        }
      }
      if (!Array.isArray(arr)) {
        throw new Error('Categories must be an array');
      }
      if (!arr.every(id => typeof id === 'string' && id.match(/^[0-9a-fA-F]{24}$/))) {
        throw new Error('One or more category IDs are invalid');
      }
      return true;
    }),
  
  body('price')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number'),
  
  body('stock')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Stock must be a non-negative integer')
];

export const getProductsValidator = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .customSanitizer((val) => {
      const n = parseInt(val, 10);
      if (val === undefined || val === null || val === '' || Number.isNaN(n) || n < 1 || n > 100) return 20;
      return n;
    }),
  
  query('minPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum price must be a positive number'),
  
  query('maxPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum price must be a positive number')
];

