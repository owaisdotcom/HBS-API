import express from 'express';
import {
  getErrorLogs,
  getErrorLogById,
  toggleResolveErrorLog,
  deleteErrorLog,
  clearErrorLogs
} from '../controllers/error-log.controller.js';
import { protectAdmin } from '../middleware/admin.middleware.js';

const router = express.Router();

// Apply protectAdmin to all error log routes
router.use(protectAdmin);

router.route('/')
  .get(getErrorLogs)
  .delete(clearErrorLogs);

router.route('/:id')
  .get(getErrorLogById)
  .delete(deleteErrorLog);

router.patch('/:id/resolve', toggleResolveErrorLog);

export default router;
