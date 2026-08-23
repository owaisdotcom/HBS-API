import rateLimit from 'express-rate-limit';
import { logServerError } from '../services/errorLog.service.js';

/**
 * Skip rate limiting for local development or when explicitly disabled
 */
const skipIfLocal = (req) => {
  if (process.env.DISABLE_RATE_LIMIT === 'true' || process.env.NODE_ENV === 'development') {
    return true;
  }
  const ip = req.ip || req.connection?.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.includes('localhost');
};

/**
 * Custom handler for rate-limit violations that records a security warning log in MongoDB
 */
const createRateLimitHandler = (message) => async (req, res, next, options) => {
  // Log rate limit violation as a warning in ServerErrorLog
  await logServerError({
    req,
    statusCode: 429,
    message: `Rate Limit Exceeded: ${message}`,
    severity: 'warning'
  });

  res.status(options.statusCode || 429).json({
    success: false,
    message: message || options.message?.message || 'Too many requests, please try again later.'
  });
};

/**
 * Strict Rate Limiter for Login Attempts (Customer & Admin)
 * Max 10 attempts per 15 minutes per IP address
 */
export const loginLimiter = rateLimit({
  windowMs: parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX, 10) || 10, // 10 attempts
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipIfLocal,
  handler: createRateLimitHandler('Too many login attempts from this IP. Please try again after 15 minutes.')
});

/**
 * Rate Limiter for Account Registration / Signup
 * Max 5 registration attempts per hour per IP address
 */
export const registerLimiter = rateLimit({
  windowMs: parseInt(process.env.REGISTER_RATE_LIMIT_WINDOW_MS, 10) || 60 * 60 * 1000, // 1 hour
  max: parseInt(process.env.REGISTER_RATE_LIMIT_MAX, 10) || 5, // 5 signups
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipIfLocal,
  handler: createRateLimitHandler('Too many account creation attempts from this IP. Please try again after an hour.')
});

/**
 * Strict Rate Limiter for Password Reset & Forgot Password
 * Max 5 requests per hour per IP address
 */
export const passwordResetLimiter = rateLimit({
  windowMs: parseInt(process.env.PASSWORD_RESET_WINDOW_MS, 10) || 60 * 60 * 1000, // 1 hour
  max: parseInt(process.env.PASSWORD_RESET_MAX, 10) || 5, // 5 reset requests
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipIfLocal,
  handler: createRateLimitHandler('Too many password reset requests from this IP. Please try again after an hour.')
});

/**
 * Rate Limiter for OTP verification and resend
 * Max 5 requests per 15 minutes per IP address
 */
export const otpLimiter = rateLimit({
  windowMs: parseInt(process.env.OTP_RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.OTP_RATE_LIMIT_MAX, 10) || 5, // 5 attempts
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipIfLocal,
  handler: createRateLimitHandler('Too many OTP verification requests. Please try again after 15 minutes.')
});
