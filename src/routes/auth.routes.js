import express from 'express';
import {
  signup,
  login,
  getMe,
  updateProfile,
  changePassword,
  addAddress,
  updateAddress,
  deleteAddress,
  verifyEmail,
  verifyOTP,
  resendOTP,
  resendVerification,
  forgotPassword,
  resetPassword
} from '../controllers/auth.controller.js';
import { sendGuestOTP, verifyGuestOTP } from '../controllers/guestVerification.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import validate from '../middleware/validate.middleware.js';
import {
  signupValidator,
  loginValidator,
  updateProfileValidator,
  changePasswordValidator,
  addressValidator
} from '../validators/auth.validator.js';
import {
  loginLimiter,
  registerLimiter,
  passwordResetLimiter,
  otpLimiter
} from '../middleware/rateLimiter.middleware.js';

const router = express.Router();

// Public routes with rate limit protection
router.post('/signup', registerLimiter, signupValidator, validate, signup);
router.post('/login', loginLimiter, loginValidator, validate, login);
router.post('/verify-otp', otpLimiter, verifyOTP);
router.post('/resend-otp', otpLimiter, resendOTP);
router.post('/guest-send-otp', otpLimiter, sendGuestOTP);
router.post('/guest-verify-otp', otpLimiter, verifyGuestOTP);
router.get('/verify-email/:token', verifyEmail);
router.post('/forgot-password', passwordResetLimiter, forgotPassword);
router.post('/reset-password/:token', passwordResetLimiter, resetPassword);

// Protected routes
router.get('/me', protect, getMe);
router.post('/resend-verification', protect, resendVerification);
router.put('/profile', protect, updateProfileValidator, validate, updateProfile);
router.put('/password', protect, changePasswordValidator, validate, changePassword);

// Address management
router.post('/address', protect, addressValidator, validate, addAddress);
router.put('/address/:addressId', protect, addressValidator, validate, updateAddress);
router.delete('/address/:addressId', protect, deleteAddress);

export default router;
