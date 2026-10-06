import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendVerificationEmail, sendVerificationOTP, sendPasswordResetEmail, sendWelcomeEmail } from '../services/email.service.js';

// Generate JWT token (requires JWT_SECRET in .env)
const generateToken = (id) => {
  const secret = process.env.JWT_SECRET;
  if (!secret || String(secret).trim() === '') {
    throw new ApiError('Server configuration error: JWT_SECRET is not set. Add JWT_SECRET to your .env file.', 500);
  }
  return jwt.sign({ id }, secret, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

// @route   POST /api/auth/signup
// @desc    Register a new user
// @access  Public
export const signup = asyncHandler(async (req, res, next) => {
  const { fullName, email, phone, password } = req.body;

  // Normalize email (lowercase and trim)
  const normalizedEmail = email.toLowerCase().trim();



  // Check if user already exists (case-insensitive)
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    return next(new ApiError('Email already registered', 400));
  }

  // Create user
  const user = await User.create({
    fullName,
    email: normalizedEmail,
    phone,
    password
  });



  // Generate email verification OTP
  const otp = user.generateEmailVerificationOTP();
  await user.save({ validateBeforeSave: false });



  // Send verification OTP email
  try {
    await sendVerificationOTP(normalizedEmail, otp, fullName);

  } catch (error) {
    console.error('Error sending verification OTP:', error);
    console.error('Error details:', error.message);
    // Still continue - user can resend OTP
  }

  // Don't generate JWT token yet - user needs to verify email first
  res.status(201).json(
    new ApiResponse(201, {
      user: {
        id: user._id,
        email: user.email,
        isEmailVerified: user.isEmailVerified
      },
      requiresVerification: true,
      // Include OTP in development for testing
      ...(process.env.NODE_ENV === 'development' && { otp })
    }, 'Account created successfully. Please check your email for the verification code. Please check your inbox or spam folder.')
  );
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
export const login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  // Validate email and password
  if (!email || !password) {
    return next(new ApiError('Please provide email and password', 400));
  }

  // Normalize email
  const normalizedEmail = email.toLowerCase().trim();

  // Find user and include password
  const user = await User.findOne({ email: normalizedEmail }).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    return next(new ApiError('Invalid email or password', 401));
  }

  // Check if account is blocked
  if (user.status === 'blocked') {
    return next(new ApiError('Your account has been blocked. Please contact support.', 403));
  }

  // Check if email is verified
  if (!user.isEmailVerified) {
    // Generate new OTP
    const otp = user.generateEmailVerificationOTP();
    await user.save({ validateBeforeSave: false });



    // Send verification OTP
    try {
      await sendVerificationOTP(normalizedEmail, otp, user.fullName);

    } catch (error) {
      console.error('Error sending OTP during login:', error);
      // Continue anyway - user can resend
    }

    // Return response indicating verification needed
    return res.status(403).json(
      new ApiResponse(403, {
        user: {
          id: user._id,
          email: user.email,
          isEmailVerified: false
        },
        requiresVerification: true,
        // Include OTP in development for testing
        ...(process.env.NODE_ENV === 'development' && { otp })
      }, 'Please verify your email first. A verification code has been sent to your email. Please check your inbox or spam folder.')
    );
  }

  // Update last login
  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  // Generate token
  const token = generateToken(user._id);

  res.json(
    new ApiResponse(200, {
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        status: user.status,
        isEmailVerified: user.isEmailVerified,
        savedCheckoutDetails: user.savedCheckoutDetails || null,
        addresses: user.addresses || [],
        createdAt: user.createdAt
      },
      token
    }, 'Login successful')
  );
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
export const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  res.json(
    new ApiResponse(200, {
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        addresses: user.addresses,
        savedCheckoutDetails: user.savedCheckoutDetails || null,
        status: user.status,
        createdAt: user.createdAt
      }
    }, 'User retrieved successfully')
  );
});

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
export const updateProfile = asyncHandler(async (req, res, next) => {
  const { fullName, phone } = req.body;

  const user = await User.findById(req.user.id);

  if (!user) {
    return next(new ApiError('User not found', 404));
  }

  if (fullName) user.fullName = fullName;
  if (phone) user.phone = phone;

  await user.save();

  res.json(
    new ApiResponse(200, {
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone
      }
    }, 'Profile updated successfully')
  );
});

// @route   PUT /api/auth/password
// @desc    Change password
// @access  Private
export const changePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return next(new ApiError('Please provide current and new password', 400));
  }

  const user = await User.findById(req.user.id).select('+password');

  if (!(await user.comparePassword(currentPassword))) {
    return next(new ApiError('Current password is incorrect', 401));
  }

  user.password = newPassword;
  await user.save();

  res.json(
    new ApiResponse(200, null, 'Password changed successfully')
  );
});

// @route   POST /api/auth/address
// @desc    Add new address
// @access  Private
export const addAddress = asyncHandler(async (req, res, next) => {
  const { label, fullAddress, city, postalCode, isDefault } = req.body;

  const user = await User.findById(req.user.id);

  if (!user) {
    return next(new ApiError('User not found', 404));
  }

  // If this is the first address or set as default, update others
  if (isDefault || user.addresses.length === 0) {
    user.addresses.forEach(addr => addr.isDefault = false);
  }

  user.addresses.push({
    label,
    fullAddress,
    city,
    postalCode,
    isDefault: isDefault || user.addresses.length === 0
  });

  await user.save();

  res.status(201).json(
    new ApiResponse(201, { addresses: user.addresses }, 'Address added successfully')
  );
});

// @route   PUT /api/auth/address/:addressId
// @desc    Update address
// @access  Private
export const updateAddress = asyncHandler(async (req, res, next) => {
  const { addressId } = req.params;
  const { label, fullAddress, city, postalCode, isDefault } = req.body;

  const user = await User.findById(req.user.id);

  if (!user) {
    return next(new ApiError('User not found', 404));
  }

  const address = user.addresses.id(addressId);

  if (!address) {
    return next(new ApiError('Address not found', 404));
  }

  if (label) address.label = label;
  if (fullAddress) address.fullAddress = fullAddress;
  if (city) address.city = city;
  if (postalCode) address.postalCode = postalCode;

  // If setting as default, unset others
  if (isDefault) {
    user.addresses.forEach(addr => {
      if (addr._id.toString() !== addressId) {
        addr.isDefault = false;
      }
    });
    address.isDefault = true;
  }

  await user.save();

  res.json(
    new ApiResponse(200, { addresses: user.addresses }, 'Address updated successfully')
  );
});

// @route   DELETE /api/auth/address/:addressId
// @desc    Delete address
// @access  Private
export const deleteAddress = asyncHandler(async (req, res, next) => {
  const { addressId } = req.params;

  const user = await User.findById(req.user.id);

  if (!user) {
    return next(new ApiError('User not found', 404));
  }

  user.addresses.pull(addressId);
  await user.save();

  res.json(
    new ApiResponse(200, { addresses: user.addresses }, 'Address deleted successfully')
  );
});

/**
 * Synchronize checkout details with user document and default address
 */
export const syncCheckoutDetailsWithUser = (user, details = {}) => {
  const completeAddress = details.completeAddress || details.fullAddress || details.address || '';
  const city = details.city || '';
  const postalCode = details.postalCode || '';
  const province = details.province || '';
  const houseNumber = details.houseNumber || '';
  const streetNumber = details.streetNumber || '';
  const nearestLandmark = details.nearestLandmark || '';
  const tehsil = details.tehsil || '';
  const district = details.district || '';
  const phone = details.phone || '';
  const alternatePhone = details.alternatePhone || '';
  const country = details.country || 'Pakistan';
  const name = details.name || user.fullName || '';

  user.savedCheckoutDetails = {
    name,
    phone,
    alternatePhone,
    houseNumber,
    streetNumber,
    nearestLandmark,
    completeAddress,
    tehsil,
    district,
    city,
    province,
    country,
    postalCode,
    hasSavedDetails: true,
    updatedAt: new Date()
  };

  // Keep primary phone updated if user doesn't have one set yet
  if (phone && !user.phone) {
    user.phone = phone;
  }

  // Also synchronize default address in addresses array without duplicating
  if (completeAddress && city) {
    if (!user.addresses) user.addresses = [];
    let defaultAddr = user.addresses.find(a => a.isDefault);
    if (!defaultAddr && user.addresses.length > 0) {
      defaultAddr = user.addresses[0];
    }

    if (defaultAddr) {
      defaultAddr.label = defaultAddr.label || 'Home';
      defaultAddr.fullName = name || defaultAddr.fullName;
      defaultAddr.phone = phone || defaultAddr.phone;
      defaultAddr.alternatePhone = alternatePhone || defaultAddr.alternatePhone;
      defaultAddr.houseNumber = houseNumber || defaultAddr.houseNumber;
      defaultAddr.streetNumber = streetNumber || defaultAddr.streetNumber;
      defaultAddr.nearestLandmark = nearestLandmark || defaultAddr.nearestLandmark;
      defaultAddr.completeAddress = completeAddress;
      defaultAddr.fullAddress = completeAddress;
      defaultAddr.tehsil = tehsil || defaultAddr.tehsil;
      defaultAddr.district = district || defaultAddr.district;
      defaultAddr.city = city;
      defaultAddr.province = province || defaultAddr.province;
      defaultAddr.country = country;
      defaultAddr.postalCode = postalCode || defaultAddr.postalCode;
      defaultAddr.isDefault = true;
    } else {
      user.addresses.push({
        label: 'Home',
        fullName: name,
        phone,
        alternatePhone,
        houseNumber,
        streetNumber,
        nearestLandmark,
        completeAddress,
        fullAddress: completeAddress,
        tehsil,
        district,
        city,
        province,
        country,
        postalCode,
        isDefault: true
      });
    }
  }
};

// @route   GET /api/auth/checkout-details
// @desc    Get saved checkout details
// @access  Private
export const getSavedCheckoutDetails = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);

  if (!user) {
    return next(new ApiError('User not found', 404));
  }

  res.json(
    new ApiResponse(200, {
      savedCheckoutDetails: user.savedCheckoutDetails || { hasSavedDetails: false }
    }, 'Saved checkout details retrieved successfully')
  );
});

// @route   PUT /api/auth/checkout-details
// @desc    Save or update checkout details
// @access  Private
export const saveSavedCheckoutDetails = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);

  if (!user) {
    return next(new ApiError('User not found', 404));
  }

  syncCheckoutDetailsWithUser(user, req.body);
  await user.save();

  res.json(
    new ApiResponse(200, {
      savedCheckoutDetails: user.savedCheckoutDetails,
      addresses: user.addresses
    }, 'Checkout details saved successfully')
  );
});

// @route   DELETE /api/auth/checkout-details
// @desc    Delete/clear saved checkout details
// @access  Private
export const deleteSavedCheckoutDetails = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);

  if (!user) {
    return next(new ApiError('User not found', 404));
  }

  user.savedCheckoutDetails = {
    name: '',
    phone: '',
    alternatePhone: '',
    houseNumber: '',
    streetNumber: '',
    nearestLandmark: '',
    completeAddress: '',
    tehsil: '',
    district: '',
    city: '',
    province: '',
    country: 'Pakistan',
    postalCode: '',
    hasSavedDetails: false,
    updatedAt: new Date()
  };

  await user.save();

  res.json(
    new ApiResponse(200, {
      savedCheckoutDetails: user.savedCheckoutDetails
    }, 'Saved checkout details cleared successfully')
  );
});

// @route   POST /api/auth/verify-otp
// @desc    Verify email with OTP
// @access  Public
export const verifyOTP = asyncHandler(async (req, res, next) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return next(new ApiError('Please provide email and OTP', 400));
  }



  // Hash the OTP to compare with database
  const hashedOTP = crypto
    .createHash('sha256')
    .update(otp.trim())
    .digest('hex');

  // Normalize email
  const normalizedEmail = email.toLowerCase().trim();




  // First, check if user exists with this email
  const userExists = await User.findOne({ email: normalizedEmail });


  if (userExists) {




  }

  const user = await User.findOne({
    email: normalizedEmail,
    emailVerificationOTP: hashedOTP,
    emailVerificationOTPExpire: { $gt: Date.now() }
  });



  if (!user) {
    if (!userExists) {
      return next(new ApiError('No account found with this email', 400));
    }
    if (!userExists.emailVerificationOTP) {
      return next(new ApiError('No verification code found. Please request a new code.', 400));
    }
    if (userExists.emailVerificationOTPExpire < Date.now()) {
      return next(new ApiError('Verification code has expired. Please request a new code.', 400));
    }
    return next(new ApiError('Invalid verification code. Please check and try again.', 400));
  }

  // Verify email
  user.isEmailVerified = true;
  user.emailVerificationOTP = undefined;
  user.emailVerificationOTPExpire = undefined;
  await user.save();

  // Generate JWT token now
  const token = generateToken(user._id);

  // Send welcome email
  try {
    await sendWelcomeEmail(user.email, user.fullName);
  } catch (error) {
    console.error('Error sending welcome email:', error);
  }

  res.json(
    new ApiResponse(200, {
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        status: user.status,
        isEmailVerified: user.isEmailVerified,
        savedCheckoutDetails: user.savedCheckoutDetails || null,
        addresses: user.addresses || []
      },
      token
    }, 'Email verified successfully')
  );
});

// @route   POST /api/auth/resend-otp
// @desc    Resend verification OTP
// @access  Public
export const resendOTP = asyncHandler(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return next(new ApiError('Please provide email', 400));
  }



  // Convert email to lowercase for case-insensitive search
  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });



  if (!user) {
    return next(new ApiError('No account found with this email address. Please sign up first.', 404));
  }

  if (user.isEmailVerified) {
    return next(new ApiError('Email already verified', 400));
  }

  // 60-second cooldown protection to prevent duplicate email triggers and protect Gmail reputation
  if (user.emailVerificationOTPExpire) {
    const timeUntilExpiry = new Date(user.emailVerificationOTPExpire).getTime() - Date.now();
    if (timeUntilExpiry > 9 * 60 * 1000) {
      const remainingSeconds = Math.ceil((timeUntilExpiry - 9 * 60 * 1000) / 1000);
      return next(new ApiError(`Please wait ${remainingSeconds} seconds before requesting a new verification code`, 429));
    }
  }

  // Generate new OTP
  const otp = user.generateEmailVerificationOTP();
  await user.save({ validateBeforeSave: false });



  // Send OTP email
  try {
    await sendVerificationOTP(user.email, otp, user.fullName);

    res.json(
      new ApiResponse(200, {
        // Include OTP in development for testing
        ...(process.env.NODE_ENV === 'development' && { otp })
      }, 'Verification code sent to your email. Please check your inbox or spam folder.')
    );
  } catch (error) {
    console.error('Error sending OTP email:', error);
    console.error('Error details:', error.message);
    user.emailVerificationOTP = undefined;
    user.emailVerificationOTPExpire = undefined;
    await user.save({ validateBeforeSave: false });
    return next(new ApiError('Error sending email. Please try again later.', 500));
  }
});

// @route   GET /api/auth/verify-email/:token
// @desc    Verify email address
// @access  Public
export const verifyEmail = asyncHandler(async (req, res, next) => {
  const { token } = req.params;

  // Hash the token to compare with database
  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpire: { $gt: Date.now() }
  });

  if (!user) {
    return next(new ApiError('Invalid or expired verification token', 400));
  }

  // Verify email
  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpire = undefined;
  await user.save();

  // Send welcome email
  try {
    await sendWelcomeEmail(user.email, user.fullName);
  } catch (error) {
    console.error('Error sending welcome email:', error);
  }

  res.json(
    new ApiResponse(200, null, 'Email verified successfully')
  );
});

// @route   POST /api/auth/resend-verification
// @desc    Resend verification email
// @access  Private
export const resendVerification = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);

  if (!user) {
    return next(new ApiError('User not found', 404));
  }

  if (user.isEmailVerified) {
    return next(new ApiError('Email already verified', 400));
  }

  // Generate new verification token
  const verificationToken = user.generateEmailVerificationToken();
  await user.save({ validateBeforeSave: false });

  // Send verification email
  try {
    await sendVerificationEmail(user.email, verificationToken);
    res.json(
      new ApiResponse(200, null, 'Verification email sent successfully. Please check your inbox or spam folder.')
    );
  } catch (error) {
    user.emailVerificationToken = undefined;
    user.emailVerificationExpire = undefined;
    await user.save({ validateBeforeSave: false });
    return next(new ApiError('Error sending email. Please try again later.', 500));
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Request password reset
// @access  Public
export const forgotPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return next(new ApiError('Please provide an email', 400));
  }

  const user = await User.findOne({ email });

  if (!user) {
    // Don't reveal if user exists for security
    return res.json(
      new ApiResponse(200, null, 'If an account with that email exists, a password reset link has been sent. Please check your inbox or spam folder.')
    );
  }

  // 60-second cooldown protection to prevent duplicate email triggers
  if (user.resetPasswordExpire) {
    const timeUntilExpiry = new Date(user.resetPasswordExpire).getTime() - Date.now();
    if (timeUntilExpiry > 59 * 60 * 1000) {
      return res.json(
        new ApiResponse(200, null, 'If an account with that email exists, a password reset link has been sent. Please check your inbox or spam folder.')
      );
    }
  }

  // Generate reset token
  const resetToken = user.generatePasswordResetToken();
  await user.save({ validateBeforeSave: false });

  // Send reset email
  try {
    await sendPasswordResetEmail(user.email, resetToken);
    res.json(
      new ApiResponse(200, null, 'Password reset link sent to your email. Please check your inbox or spam folder.')
    );
  } catch (error) {
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save({ validateBeforeSave: false });
    return next(new ApiError('Error sending email. Please try again later.', 500));
  }
});

// @route   POST /api/auth/reset-password/:token
// @desc    Reset password
// @access  Public
export const resetPassword = asyncHandler(async (req, res, next) => {
  const { token } = req.params;
  const { password } = req.body;

  if (!password) {
    return next(new ApiError('Please provide a new password', 400));
  }

  if (password.length < 6) {
    return next(new ApiError('Password must be at least 6 characters', 400));
  }

  // Hash the token to compare with database
  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpire: { $gt: Date.now() }
  });

  if (!user) {
    return next(new ApiError('Invalid or expired reset token', 400));
  }

  // Set new password
  user.password = password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  // Generate new JWT token
  const jwtToken = generateToken(user._id);

  res.json(
    new ApiResponse(200, {
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        status: user.status
      },
      token: jwtToken
    }, 'Password reset successfully')
  );
});

