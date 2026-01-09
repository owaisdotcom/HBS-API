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
  
  body('customer.address')
    .trim()
    .notEmpty()
    .withMessage('Address is required'),
  
  body('customer.city')
    .trim()
    .notEmpty()
    .withMessage('City is required'),
  
  body('items')
    .isArray({ min: 1 })
    .withMessage('Order must contain at least one item'),
  
  body('items.*.productId')
    .isMongoId()
    .withMessage('Invalid product ID'),
  
  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1'),
  
  body('paymentMethod')
    .optional()
    .isIn(['bank_transfer', 'cod', 'card'])
    .withMessage('Invalid payment method')
];

export const updateOrderStatusValidator = [
  body('status')
    .notEmpty()
    .withMessage('Status is required')
    .isIn(['received', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'])
    .withMessage('Invalid status'),
  
  body('note')
    .optional()
    .trim()
];

