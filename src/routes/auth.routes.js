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
  getSavedCheckoutDetails,
  saveSavedCheckoutDetails,
  deleteSavedCheckoutDetails,
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
  addressValidator,
  savedCheckoutDetailsValidator
} from '../validators/auth.validator.js';

const router = express.Router();

// Public routes
router.post('/signup', signupValidator, validate, signup);
router.post('/login', loginValidator, validate, login);
router.post('/verify-otp', verifyOTP);
router.post('/resend-otp', resendOTP);
router.post('/guest-send-otp', sendGuestOTP);
router.post('/guest-verify-otp', verifyGuestOTP);
router.get('/verify-email/:token', verifyEmail);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);

// Protected routes
router.get('/me', protect, getMe);
router.post('/resend-verification', protect, resendVerification);
router.put('/profile', protect, updateProfileValidator, validate, updateProfile);
router.put('/password', protect, changePasswordValidator, validate, changePassword);

// Address management
router.post('/address', protect, addressValidator, validate, addAddress);
router.put('/address/:addressId', protect, addressValidator, validate, updateAddress);
router.delete('/address/:addressId', protect, deleteAddress);

// Saved checkout details management
router.get('/checkout-details', protect, getSavedCheckoutDetails);
router.put('/checkout-details', protect, savedCheckoutDetailsValidator, validate, saveSavedCheckoutDetails);
router.delete('/checkout-details', protect, deleteSavedCheckoutDetails);

export default router;
