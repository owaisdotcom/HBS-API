import express from 'express';
import { protectAdmin } from '../middleware/admin.middleware.js';
import {
  getAnnouncements,
  getAllAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  reorderAnnouncements
} from '../controllers/announcement.controller.js';

const router = express.Router();

// Public routes
router.get('/', getAnnouncements);

// Admin routes
router.get('/admin', protectAdmin, getAllAnnouncements);
router.post('/admin', protectAdmin, createAnnouncement);
router.put('/admin/reorder', protectAdmin, reorderAnnouncements);
router.put('/admin/:id', protectAdmin, updateAnnouncement);
router.delete('/admin/:id', protectAdmin, deleteAnnouncement);

export default router;

