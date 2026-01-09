import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE
  });
};

// @route   POST /api/auth/signup
// @desc    Register a new user
// @access  Public
export const signup = asyncHandler(async (req, res, next) => {
  const { fullName, email, phone, password } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new ApiError('Email already registered', 400));
  }

  // Create user
  const user = await User.create({
    fullName,
    email,
    phone,
    password
  });

  // Generate token
  const token = generateToken(user._id);

  res.status(201).json(
    new ApiResponse(201, {
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        status: user.status
      },
      token
    }, 'Account created successfully')
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

  // Find user and include password
  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    return next(new ApiError('Invalid email or password', 401));
  }

  // Check if account is blocked
  if (user.status === 'blocked') {
    return next(new ApiError('Your account has been blocked. Please contact support.', 403));
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
        status: user.status
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

