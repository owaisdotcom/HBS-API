import express from 'express';
import {
  signup,
  login,
  getMe,
  updateProfile,
  changePassword,
  addAddress,
  updateAddress,
  deleteAddress
} from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import validate from '../middleware/validate.middleware.js';
import {
  signupValidator,
  loginValidator,
  updateProfileValidator,
  changePasswordValidator,
  addressValidator
} from '../validators/auth.validator.js';

const router = express.Router();

// Public routes
router.post('/signup', signupValidator, validate, signup);
router.post('/login', loginValidator, validate, login);

// Protected routes
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfileValidator, validate, updateProfile);
router.put('/password', protect, changePasswordValidator, validate, changePassword);

// Address management
router.post('/address', protect, addressValidator, validate, addAddress);
router.put('/address/:addressId', protect, addressValidator, validate, updateAddress);
router.delete('/address/:addressId', protect, deleteAddress);

export default router;

