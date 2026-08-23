import { body } from 'express-validator';

export const createCouponValidator = [
  body('code')
    .trim()
    .notEmpty()
    .withMessage('Coupon code is required')
    .isLength({ min: 3, max: 20 })
    .withMessage('Coupon code must be between 3 and 20 characters')
    .matches(/^[A-Z0-9]+$/)
    .withMessage('Coupon code can only contain uppercase letters and numbers'),

  body('type')
    .notEmpty()
    .withMessage('Discount type is required')
    .isIn(['percentage', 'fixed'])
    .withMessage('Type must be either percentage or fixed'),

  body('value')
    .notEmpty()
    .withMessage('Discount value is required')
    .isFloat({ min: 0 })
    .withMessage('Value must be a positive number'),

  body('usageLimit')
    .notEmpty()
    .withMessage('Usage limit is required')
    .isInt({ min: 1 })
    .withMessage('Usage limit must be at least 1'),

  body('validFrom')
    .notEmpty()
    .withMessage('Valid from date is required')
    .isISO8601()
    .withMessage('Invalid date format'),

  body('validUntil')
    .notEmpty()
    .withMessage('Valid until date is required')
    .isISO8601()
    .withMessage('Invalid date format')
    .custom((value, { req }) => {
      if (new Date(value) <= new Date(req.body.validFrom)) {
        throw new Error('Valid until date must be after valid from date');
      }
      return true;
    })
];

