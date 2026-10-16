import express from 'express';
import {
  submitContactQuery,
  getAllContactQueries,
  getContactQuery,
  updateContactQuery,
  deleteContactQuery
} from '../controllers/contact.controller.js';
import { protectAdmin } from '../middleware/admin.middleware.js';
import { body } from 'express-validator';
import validate from '../middleware/validate.middleware.js';

import { contactLimiter } from '../middleware/rateLimiter.middleware.js';

const router = express.Router();

// Public route
router.post('/', contactLimiter, [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').trim().isEmail().withMessage('Valid email is required'),
  body('message').trim().notEmpty().withMessage('Message is required')
], validate, submitContactQuery);

// Admin routes
router.get('/', protectAdmin, getAllContactQueries);
router.get('/:id', protectAdmin, getContactQuery);
router.put('/:id', protectAdmin, updateContactQuery);
router.delete('/:id', protectAdmin, deleteContactQuery);

export default router;

