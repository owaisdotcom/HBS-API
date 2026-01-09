import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';

// Generate JWT token for admin
const generateAdminToken = (id) => {
  return jwt.sign({ id }, process.env.ADMIN_JWT_SECRET, {
    expiresIn: process.env.ADMIN_JWT_EXPIRE
  });
};

// @route   POST /api/admin/login
// @desc    Admin login
// @access  Public
export const adminLogin = asyncHandler(async (req, res, next) => {
  const { username, password } = req.body;

  // Validate credentials
  if (!username || !password) {
    return next(new ApiError('Please provide username and password', 400));
  }

  // Find admin and include password
  const admin = await Admin.findOne({ username }).select('+password');

  if (!admin || !(await admin.comparePassword(password))) {
    return next(new ApiError('Invalid credentials', 401));
  }

  // Check if admin is active
  if (admin.status !== 'active') {
    return next(new ApiError('Admin account is inactive', 403));
  }

  // Update last login
  admin.lastLoginAt = new Date();
  await admin.save({ validateBeforeSave: false });

  // Generate token
  const token = generateAdminToken(admin._id);

  res.json(
    new ApiResponse(200, {
      admin: {
        id: admin._id,
        username: admin.username,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions
      },
      token
    }, 'Login successful')
  );
});

// @route   GET /api/admin/me
// @desc    Get current admin
// @access  Private (Admin)
export const getAdminProfile = asyncHandler(async (req, res) => {
  const admin = await Admin.findById(req.admin.id);

  res.json(
    new ApiResponse(200, {
      admin: {
        id: admin._id,
        username: admin.username,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions,
        status: admin.status,
        lastLoginAt: admin.lastLoginAt
      }
    }, 'Admin profile retrieved')
  );
});

// @route   POST /api/admin/create
// @desc    Create new admin (Super Admin only)
// @access  Private (Super Admin)
export const createAdmin = asyncHandler(async (req, res, next) => {
  const { username, password, name, email, role, permissions } = req.body;

  // Check if requester is super admin
  if (req.admin.role !== 'super_admin') {
    return next(new ApiError('Only super admins can create admin accounts', 403));
  }

  // Check if username exists
  const existingAdmin = await Admin.findOne({ username });
  if (existingAdmin) {
    return next(new ApiError('Username already exists', 400));
  }

  // Create admin
  const admin = await Admin.create({
    username,
    password,
    name,
    email,
    role: role || 'admin',
    permissions: permissions || []
  });

  res.status(201).json(
    new ApiResponse(201, {
      admin: {
        id: admin._id,
        username: admin.username,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions
      }
    }, 'Admin account created successfully')
  );
});

// @route   PUT /api/admin/password
// @desc    Change admin password
// @access  Private (Admin)
export const changeAdminPassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return next(new ApiError('Please provide current and new password', 400));
  }

  const admin = await Admin.findById(req.admin.id).select('+password');

  if (!(await admin.comparePassword(currentPassword))) {
    return next(new ApiError('Current password is incorrect', 401));
  }

  admin.password = newPassword;
  await admin.save();

  res.json(
    new ApiResponse(200, null, 'Password changed successfully')
  );
});

