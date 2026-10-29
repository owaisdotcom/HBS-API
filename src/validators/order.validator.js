import { body } from 'express-validator';

export const createOrderValidator = [
  body('customer.name')
    .trim()
    .notEmpty()
    .withMessage('Customer name is required'),
  
  body('customer.email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email'),
  
  body('customer.phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required'),

  body('customer.alternatePhone')
    .optional()
    .trim()
    .custom((value, { req }) => {
      if (!value) return true;
      if (value === req.body.customer?.phone) {
        throw new Error('Alternate number must be different from primary phone');
      }
      return true;
    }),
  
  body('customer.completeAddress')
    .trim()
    .notEmpty()
    .withMessage('Complete address is required'),
  
  body('customer.city')
    .trim()
    .notEmpty()
    .withMessage('City is required'),
  
  body('items')
    .isArray({ min: 1 })
    .withMessage('Order must contain at least one item'),
  
  body('items.*.productId')
    .optional({ values: 'null' })
    .isMongoId()
    .withMessage('Invalid product ID'),
  
  body('items.*.preMadeBundleId')
    .optional({ values: 'null' })
    .isMongoId()
    .withMessage('Invalid pre-made bundle ID'),
  
  body('items.*')
    .custom((item) => {
      const hasProduct = item?.productId != null && String(item.productId).trim() !== '';
      const hasBundle = item?.preMadeBundleId != null && String(item.preMadeBundleId).trim() !== '';
      if (!hasProduct && !hasBundle) {
        throw new Error('Each item must have either productId or preMadeBundleId');
      }
      if (hasProduct && hasBundle) {
        throw new Error('Each item must have either productId or preMadeBundleId, not both');
      }
      return true;
    }),
  
  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1'),

  body('items.*.selectedTieElastic')
    .optional({ values: 'null' })
    .isIn(['tie', 'elastic'])
    .withMessage('Invalid Tie/Elastic selection'),

  body('items.*.selectedBridalLength')
    .optional({ values: 'null' })
    .isString(),

  body('items.*.bridalLengthPrice')
    .optional()
    .isNumeric(),

  body('paymentMethod')
    .optional()
    .isIn(['bank_transfer', 'cod', 'card'])
    .withMessage('Invalid payment method'),

  body('deliveryOption')
    .optional({ values: 'null' })
    .trim()
    .isIn(['tcs_express', 'other_couriers', 'standard', 'tcs', ''])
    .withMessage('Invalid delivery option')
];

export const updateOrderStatusValidator = [
  body('status')
    .notEmpty()
    .withMessage('Status is required')
    .isIn(['received', 'confirmed', 'processing', 'shipped', 'remain_undelivered', 'delivered', 'cancelled'])
    .withMessage('Invalid status'),
  
  body('note')
    .optional()
    .trim(),

  body('trackingNumber')
    .optional()
    .trim(),

  body('courier')
    .optional()
    .trim()
];

