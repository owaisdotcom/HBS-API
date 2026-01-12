import express from 'express';
import {
  getHomepageSettings,
  getNavigation,
  updateNavigation,
  updateOrCreateNavigation,
  getHeroSlider,
  updateHeroSlider,
  updateOrCreateHeroSlider,
  addSlide,
  deleteSlide,
  getHomepageSections,
  updateHomepageSections,
  getSiteSettings,
  updateSiteSettings
} from '../controllers/homepage.controller.js';
import { protectAdmin } from '../middleware/admin.middleware.js';
import { uploadSingle, uploadFields } from '../middleware/upload.middleware.js';

const router = express.Router();

// Public routes
router.get('/settings', getHomepageSettings);
router.get('/navigation', getNavigation);
router.get('/hero-slider', getHeroSlider);
router.get('/sections', getHomepageSections);
router.get('/site-settings', getSiteSettings);

// Admin routes - Navigation
router.put('/navigation/:id', protectAdmin, updateNavigation);
router.put('/navigation', protectAdmin, updateOrCreateNavigation);

// Admin routes - Hero Slider
router.put('/hero-slider/:id', protectAdmin, updateHeroSlider);
router.put('/hero-slider', protectAdmin, updateOrCreateHeroSlider);
router.post('/hero-slider/slides', protectAdmin, uploadSingle, addSlide);
router.delete('/hero-slider/slides/:slideId', protectAdmin, deleteSlide);

// Admin routes - Homepage Sections
router.put('/sections', protectAdmin, updateHomepageSections);

// Admin routes - Site Settings
router.put('/site-settings', protectAdmin, uploadFields, updateSiteSettings);

export default router;

