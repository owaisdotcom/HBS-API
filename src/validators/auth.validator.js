import { body } from 'express-validator';

const emailNormalizationOptions = {
  gmail_remove_dots: false,
  gmail_remove_subaddress: false,
  gmail_convert_googlemaildotcom: false,
  outlookdotcom_remove_subaddress: false,
  yahoo_remove_subaddress: false,
  icloud_remove_subaddress: false
};

export const signupValidator = [
  body('fullName')
    .trim()
    .notEmpty()
    .withMessage('Full name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Full name must be between 2 and 50 characters'),
  
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(emailNormalizationOptions),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  
  body('phone')
    .optional()
    .trim()
    .isMobilePhone()
    .withMessage('Please provide a valid phone number')
];

export const loginValidator = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(emailNormalizationOptions),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

export const updateProfileValidator = [
  body('fullName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Full name must be between 2 and 50 characters'),
  
  body('phone')
    .optional()
    .trim()
    .isMobilePhone()
    .withMessage('Please provide a valid phone number')
];

export const changePasswordValidator = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  
  body('newPassword')
    .notEmpty()
    .withMessage('New password is required')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters')
];

export const addressValidator = [
  body('label')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Label must be less than 20 characters'),
  
  body('fullAddress')
    .trim()
    .notEmpty()
    .withMessage('Address is required'),
  
  body('city')
    .trim()
    .notEmpty()
    .withMessage('City is required'),
  
  body('postalCode')
    .optional()
    .trim()
];

export const adminLoginValidator = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(emailNormalizationOptions),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

export const setupSuperAdminValidator = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(emailNormalizationOptions),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters')
];

export const createAdminValidator = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(emailNormalizationOptions),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  
  body('role')
    .optional()
    .isIn(['admin', 'super_admin'])
    .withMessage('Role must be either admin or super_admin'),
  
  body('permissions')
    .optional()
    .isArray()
    .withMessage('Permissions must be an array')
];

