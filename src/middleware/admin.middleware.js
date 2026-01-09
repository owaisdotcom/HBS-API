import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

export const protectAdmin = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new ApiError('Admin authentication required', 401));
  }

  try {
    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    req.admin = await Admin.findById(decoded.id).select('-password');

    if (!req.admin || req.admin.status !== 'active') {
      return next(new ApiError('Admin access denied', 403));
    }

    next();
  } catch (error) {
    return next(new ApiError('Admin authentication failed', 401));
  }
});

export const checkPermission = (permission) => {
  return (req, res, next) => {
    if (!req.admin.permissions.includes(permission) && req.admin.role !== 'super_admin') {
      return next(new ApiError('Insufficient permissions', 403));
    }
    next();
  };
};

