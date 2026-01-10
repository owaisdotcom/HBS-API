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

// @route   POST /api/admin/setup
// @desc    Create first super admin (only works when no admins exist)
// @access  Public
export const setupSuperAdmin = asyncHandler(async (req, res, next) => {
  // Check if any admin already exists
  const adminCount = await Admin.countDocuments();
  
  if (adminCount > 0) {
    return next(new ApiError('Setup already completed. Admins already exist. Use /admin/register with authentication.', 403));
  }

  const { username, email, password, name } = req.body;

  // Create first super admin
  const admin = await Admin.create({
    username,
    email,
    password,
    name,
    role: 'super_admin',
    permissions: ['products', 'categories', 'orders', 'users', 'coupons', 'reviews', 'homepage', 'settings'],
    status: 'active'
  });

  // Generate token
  const token = generateAdminToken(admin._id);

  res.status(201).json(
    new ApiResponse(201, {
      token,
      admin: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        permissions: admin.permissions
      }
    }, 'Super admin created successfully')
  );
});

// @route   POST /api/admin/register
// @desc    Create new admin (requires super_admin)
// @access  Private (Super Admin only)
export const createAdmin = asyncHandler(async (req, res, next) => {
  const { username, email, password, name, role, permissions } = req.body;

  // Check if admin already exists
  const existingAdmin = await Admin.findOne({ 
    $or: [{ email }, { username }] 
  });

  if (existingAdmin) {
    return next(new ApiError('Admin with this email or username already exists', 400));
  }

  // Create new admin
  const admin = await Admin.create({
    username,
    email,
    password,
    name,
    role: role || 'admin',
    permissions: permissions || ['products', 'categories', 'orders', 'coupons'],
    status: 'active'
  });

  // Generate token
  const token = generateAdminToken(admin._id);

  res.status(201).json(
    new ApiResponse(201, {
      token,
      admin: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        permissions: admin.permissions
      }
    }, 'Admin created successfully')
  );
});

// @route   POST /api/admin/login
// @desc    Admin login
// @access  Public
export const adminLogin = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  // Validate credentials
  if (!email || !password) {
    return next(new ApiError('Please provide email and password', 400));
  }

  // Find admin by email and include password
  const admin = await Admin.findOne({ email }).select('+password');

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

