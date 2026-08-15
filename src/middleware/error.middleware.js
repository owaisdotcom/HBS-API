import ApiError from '../utils/ApiError.js';
import multer from 'multer';
import { logServerError } from '../services/errorLog.service.js';

const errorHandler = async (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode;

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors || {}).map(e => e.message).join(', ');
    error = new ApiError(message || 'Validation error', 400);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || 'Field';
    const message = `${field} already exists`;
    error = new ApiError(message, 400);
  }

  // Mongoose cast error
  if (err.name === 'CastError') {
    const message = 'Invalid ID format';
    error = new ApiError(message, 400);
  }

  // Multer errors
  if (err instanceof multer.MulterError) {
    let message = err.message;
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'File size is too large. Maximum allowed size is 50MB.';
    } else if (err.code === 'LIMIT_FIELD_SIZE') {
      message = 'Field size is too large. Maximum allowed size is 10MB.';
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = 'Too many files uploaded or unexpected field name.';
    }
    error = new ApiError(message, 400);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = new ApiError('Invalid token', 401);
  }

  if (err.name === 'TokenExpiredError') {
    error = new ApiError('Token expired', 401);
  }

  const statusCode = error.statusCode || 500;

  // Record server error log in MongoDB
  // We log all 5xx server errors, unhandled exceptions, and security/auth errors (401/403)
  if (statusCode >= 500 || statusCode === 401 || statusCode === 403 || !err.isOperational) {
    await logServerError({
      req,
      err,
      statusCode,
      message: error.message || err.message,
      stack: err.stack,
      severity: statusCode >= 500 ? 'critical' : (statusCode >= 400 ? 'warning' : 'error')
    });
  }

  res.status(statusCode).json({
    success: false,
    message: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

export default errorHandler;
