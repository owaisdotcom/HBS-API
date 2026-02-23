import express from 'express';
import {
  getAllTestimonials,
  getTestimonialById,
  createTestimonial,
  updateTestimonial,
  deleteTestimonial
} from '../controllers/testimonial.controller.js';
import { protectAdmin } from '../middleware/admin.middleware.js';
import { uploadTestimonialImage } from '../middleware/upload.middleware.js';

const router = express.Router();

router.get('/', protectAdmin, getAllTestimonials);
router.get('/:id', protectAdmin, getTestimonialById);
router.post('/', protectAdmin, uploadTestimonialImage, createTestimonial);
router.put('/:id', protectAdmin, uploadTestimonialImage, updateTestimonial);
router.delete('/:id', protectAdmin, deleteTestimonial);

export default router;
