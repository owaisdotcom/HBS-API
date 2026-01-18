import express from 'express';
import {
  getAllUsers,
  getUserById,
  toggleUserBlock,
  deleteUser
} from '../controllers/user.controller.js';
import { protectAdmin } from '../middleware/admin.middleware.js';

const router = express.Router();

// All routes are admin-protected
router.get('/', protectAdmin, getAllUsers);
router.get('/:id', protectAdmin, getUserById);
router.put('/:id/block', protectAdmin, toggleUserBlock);
router.delete('/:id', protectAdmin, deleteUser);

export default router;









