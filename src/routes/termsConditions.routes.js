import express from 'express';
import { protectAdmin } from '../middleware/admin.middleware.js';
import {
  getTermsConditions,
  getTermsConditionsAdmin,
  updateTermsConditions
} from '../controllers/termsConditions.controller.js';

const router = express.Router();

// Public route
router.get('/', getTermsConditions);

// Admin routes
router.get('/admin', protectAdmin, getTermsConditionsAdmin);
router.put('/admin', protectAdmin, updateTermsConditions);

export default router;
