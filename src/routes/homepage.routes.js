import express from 'express';
import {
  getHomepageSettings,
  getNavigation,
  updateNavigation,
  updateOrCreateNavigation,
  getHero,
  updateOrCreateHero,
  getHomepageSections,
  updateHomepageSections,
  getSiteSettings,
  updateSiteSettings
} from '../controllers/homepage.controller.js';
import { protectAdmin } from '../middleware/admin.middleware.js';
import { uploadFields } from '../middleware/upload.middleware.js';

const router = express.Router();

// Public routes
router.get('/settings', getHomepageSettings);
router.get('/navigation', getNavigation);
router.get('/hero', getHero);
router.get('/sections', getHomepageSections);
router.get('/site-settings', getSiteSettings);

// Admin routes - Navigation
router.put('/navigation/:id', protectAdmin, updateNavigation);
router.put('/navigation', protectAdmin, updateOrCreateNavigation);

// Admin routes - Hero
router.put('/hero', protectAdmin, updateOrCreateHero);

// Admin routes - Homepage Sections
router.put('/sections', protectAdmin, updateHomepageSections);

// Admin routes - Site Settings
router.put('/site-settings', protectAdmin, uploadFields, updateSiteSettings);

export default router;

