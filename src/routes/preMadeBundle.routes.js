import express from 'express';
import {
  listPreMadeBundles,
  getPreMadeBundle,
  createPreMadeBundle,
  updatePreMadeBundle,
  deletePreMadeBundle
} from '../controllers/preMadeBundle.controller.js';
import { protectAdmin } from '../middleware/admin.middleware.js';
import { uploadMultiple } from '../middleware/upload.middleware.js';

const router = express.Router();

router.get('/', listPreMadeBundles);
router.get('/:id', getPreMadeBundle);

router.post('/', protectAdmin, uploadMultiple, createPreMadeBundle);
router.put('/:id', protectAdmin, uploadMultiple, updatePreMadeBundle);
router.delete('/:id', protectAdmin, deletePreMadeBundle);

export default router;
