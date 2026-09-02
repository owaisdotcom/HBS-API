import crypto from 'crypto';
import GuestVerification from '../models/GuestVerification.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendGuestVerificationOTP } from '../services/email.service.js';

/**
 * @route   POST /api/auth/guest-send-otp
 * @desc    Send verification OTP to guest customer email before order placement
 * @access  Public
 */
export const sendGuestOTP = asyncHandler(async (req, res, next) => {
  const { email, name } = req.body;

  if (!email || !email.trim()) {
    return next(new ApiError('Email address is required', 400));
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Basic email regex validation
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
    return next(new ApiError('Please provide a valid email address', 400));
  }

  // Check cooldown period (60 seconds)
  const existingRecord = await GuestVerification.findOne({ email: normalizedEmail });
  if (existingRecord && existingRecord.lastSentAt) {
    const elapsedSeconds = Math.floor((Date.now() - new Date(existingRecord.lastSentAt).getTime()) / 1000);
    if (elapsedSeconds < 60) {
      const remainingSeconds = 60 - elapsedSeconds;
      return next(new ApiError(`Please wait ${remainingSeconds} seconds before requesting a new code`, 429));
    }
  }

  // Generate 6-digit OTP code
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Hash OTP using SHA-256
  const otpHash = crypto
    .createHash('sha256')
    .update(otp)
    .digest('hex');

  const otpExpire = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

  // Upsert guest verification record
  await GuestVerification.findOneAndUpdate(
    { email: normalizedEmail },
    {
      email: normalizedEmail,
      otpHash,
      otpExpire,
      isVerified: false,
      verificationToken: null,
      verificationTokenExpire: null,
      attempts: 0,
      lastSentAt: new Date(),
      isUsed: false
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Send OTP email
  try {
    await sendGuestVerificationOTP(normalizedEmail, otp, name || 'Valued Customer');
  } catch (error) {
    console.error('Error sending guest verification OTP:', error.message);
    // Return error if email sending fails completely
    return next(new ApiError('Failed to send verification email. Please verify your email address and try again.', 500));
  }

  res.status(200).json(
    new ApiResponse(200, {
      email: normalizedEmail,
      cooldownSeconds: 60,
      ...(process.env.NODE_ENV === 'development' && { otp })
    }, 'Verification code sent to your email address')
  );
});

/**
 * @route   POST /api/auth/guest-verify-otp
 * @desc    Verify guest customer OTP code and return single-use verification token
 * @access  Public
 */
export const verifyGuestOTP = asyncHandler(async (req, res, next) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return next(new ApiError('Email address and verification code are required', 400));
  }

  const normalizedEmail = email.toLowerCase().trim();
  const cleanOtp = String(otp).trim();

  const record = await GuestVerification.findOne({ email: normalizedEmail });

  if (!record || !record.otpExpire || new Date(record.otpExpire).getTime() < Date.now()) {
    return next(new ApiError('Verification code has expired or not found. Please request a new code.', 400));
  }

  if (record.attempts >= 5) {
    return next(new ApiError('Too many failed attempts. Please request a new verification code.', 429));
  }

  // Hash input OTP and compare
  const inputHash = crypto
    .createHash('sha256')
    .update(cleanOtp)
    .digest('hex');

  if (inputHash !== record.otpHash) {
    await GuestVerification.updateOne(
      { _id: record._id },
      { $inc: { attempts: 1 } }
    );
    return next(new ApiError('Invalid verification code. Please check and try again.', 400));
  }

  // OTP verified successfully - generate unique single-use verification token
  const verificationToken = crypto.randomBytes(32).toString('hex');
  const verificationTokenExpire = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes to complete checkout

  record.isVerified = true;
  record.verificationToken = verificationToken;
  record.verificationTokenExpire = verificationTokenExpire;
  record.isUsed = false;
  await record.save();

  res.status(200).json(
    new ApiResponse(200, {
      email: normalizedEmail,
      verificationToken,
      verified: true
    }, 'Email verified successfully')
  );
});
