import rateLimiterService from '../services/rateLimiter.service.js';
import { getClientIdentity } from '../utils/clientIdentifier.js';

/**
 * Creates a configurable rate limiter middleware backed by distributed storage.
 *
 * @param {object} config
 * @param {string} config.name - Endpoint policy name
 * @param {number} config.defaultMax - Default maximum requests allowed in window
 * @param {number} config.defaultWindowSec - Default window size in seconds
 * @param {string} [config.envMaxKey] - Environment variable for max requests override
 * @param {string} [config.envWindowSecKey] - Environment variable for window seconds override
 * @param {'fail-closed'|'fail-open'} [config.failPolicy='fail-closed'] - Strategy on storage failure
 * @param {boolean} [config.includeEmail=false] - Check target email for sensitive credential endpoints
 * @param {boolean} [config.userPreferred=true] - Prefer authenticated user ID over IP
 * @param {string} [config.message] - Custom error message
 * @param {(req: import('express').Request) => boolean} [config.skip] - Optional bypass predicate
 * @returns {import('express').RequestHandler}
 */
export const createRateLimiter = (config) => {
  const {
    name,
    defaultMax,
    defaultWindowSec,
    envMaxKey,
    envWindowSecKey,
    failPolicy = 'fail-closed',
    includeEmail = false,
    userPreferred = true,
    message,
    skip
  } = config;

  return async (req, res, next) => {
    // 1. Bypass preflight OPTIONS requests, health checks, or custom skip logic
    if (req.method === 'OPTIONS' || req.path === '/health' || (skip && skip(req))) {
      return next();
    }

    // 2. Resolve limits from environment variables with safe defaults
    const maxRequests = envMaxKey && process.env[envMaxKey]
      ? Math.max(1, parseInt(process.env[envMaxKey], 10) || defaultMax)
      : defaultMax;

    const windowSec = envWindowSecKey && process.env[envWindowSecKey]
      ? Math.max(1, parseInt(process.env[envWindowSecKey], 10) || defaultWindowSec)
      : defaultWindowSec;

    const windowMs = windowSec * 1000;

    // 3. Extract verified client identity (IP, user/admin ID, or composite email key)
    const identity = getClientIdentity(req, { userPreferred, includeEmail });
    const primaryKey = `rl:${name}:${identity.primaryKey}`;

    try {
      // 4. Consume quota on primary key
      const result = await rateLimiterService.consume({
        key: primaryKey,
        maxRequests,
        windowMs,
        failPolicy
      });

      // 5. If endpoint checks email (e.g. login brute force defense) and primary allowed, check target
      let targetResult = null;
      if (result.allowed && identity.targetKey) {
        const targetFullKey = `rl:${name}:${identity.targetKey}`;
        targetResult = await rateLimiterService.consume({
          key: targetFullKey,
          maxRequests,
          windowMs,
          failPolicy
        });
      }

      const activeResult = (targetResult && !targetResult.allowed) ? targetResult : result;

      // 6. Set standard and legacy RateLimit headers
      res.setHeader('RateLimit-Limit', maxRequests);
      res.setHeader('RateLimit-Remaining', activeResult.remaining);
      res.setHeader('RateLimit-Reset', activeResult.retryAfter || Math.max(1, Math.ceil((activeResult.resetTime - Date.now()) / 1000)));

      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', activeResult.remaining);
      res.setHeader('X-RateLimit-Reset', activeResult.retryAfter || Math.max(1, Math.ceil((activeResult.resetTime - Date.now()) / 1000)));

      // 7. If within limits, continue to next middleware
      if (activeResult.allowed) {
        return next();
      }

      // 8. Client exceeded limit -> Return HTTP 429 Too Many Requests
      const retryAfter = Math.max(1, activeResult.retryAfter || 60);
      res.setHeader('Retry-After', retryAfter);

      const errorMessage = message ||
        `Too many requests. Please slow down and try again in ${retryAfter} second${retryAfter === 1 ? '' : 's'}.`;

      return res.status(429).json({
        success: false,
        message: errorMessage,
        retryAfter
      });
    } catch (unexpectedError) {
      console.error(`❌ [RateLimiter] Unexpected error in ${name}:`, unexpectedError);
      if (failPolicy === 'fail-closed') {
        return res.status(429).json({
          success: false,
          message: 'Rate limit protection error. Please retry in a few moments.',
          retryAfter: 30
        });
      }
      return next();
    }
  };
};

// -------------------------------------------------------------
// Configured Endpoint-Specific Rate Limiters
// -------------------------------------------------------------

/**
 * 1. General API Limiter:
 * Generous baseline limit applied across all API routes to protect Vercel serverless from excessive traffic.
 * Default: 120 req / 60 seconds
 */
export const generalLimiter = createRateLimiter({
  name: 'general',
  defaultMax: 120,
  defaultWindowSec: 60,
  envMaxKey: 'RATE_LIMIT_GENERAL_MAX',
  envWindowSecKey: 'RATE_LIMIT_GENERAL_WINDOW_SEC',
  failPolicy: 'fail-open'
});

/**
 * 2. Authentication Limiter:
 * Stricter limit for login endpoints to protect against credential stuffing and brute-force attacks.
 * Default: 10 requests / 15 minutes (900s)
 */
export const authLimiter = createRateLimiter({
  name: 'auth',
  defaultMax: 10,
  defaultWindowSec: 900,
  envMaxKey: 'RATE_LIMIT_AUTH_MAX',
  envWindowSecKey: 'RATE_LIMIT_AUTH_WINDOW_SEC',
  failPolicy: 'fail-closed',
  includeEmail: true,
  userPreferred: false,
  message: 'Too many login attempts. Please wait 15 minutes before trying again.'
});

/**
 * 3. Signup / Registration Limiter:
 * Protects against bot account creation and registration abuse.
 * Default: 5 accounts / 1 hour (3600s)
 */
export const signupLimiter = createRateLimiter({
  name: 'signup',
  defaultMax: 5,
  defaultWindowSec: 3600,
  envMaxKey: 'RATE_LIMIT_SIGNUP_MAX',
  envWindowSecKey: 'RATE_LIMIT_SIGNUP_WINDOW_SEC',
  failPolicy: 'fail-closed',
  includeEmail: true,
  userPreferred: false,
  message: 'Too many accounts created from this IP. Please try again in an hour.'
});

/**
 * 4. Password Reset Limiter:
 * Protects against email spamming, token enumeration, and automated reset attacks.
 * Default: 5 requests / 15 minutes (900s)
 */
export const passwordResetLimiter = createRateLimiter({
  name: 'password_reset',
  defaultMax: 5,
  defaultWindowSec: 900,
  envMaxKey: 'RATE_LIMIT_PASSWORD_RESET_MAX',
  envWindowSecKey: 'RATE_LIMIT_PASSWORD_RESET_WINDOW_SEC',
  failPolicy: 'fail-closed',
  includeEmail: true,
  userPreferred: false,
  message: 'Too many password reset requests. Please wait 15 minutes before trying again.'
});

/**
 * 5. OTP & Verification Limiter:
 * Protects against OTP bombing and 6-digit OTP brute forcing.
 * Default: 5 requests / 10 minutes (600s)
 */
export const otpLimiter = createRateLimiter({
  name: 'otp',
  defaultMax: 5,
  defaultWindowSec: 600,
  envMaxKey: 'RATE_LIMIT_OTP_MAX',
  envWindowSecKey: 'RATE_LIMIT_OTP_WINDOW_SEC',
  failPolicy: 'fail-closed',
  includeEmail: true,
  userPreferred: false,
  message: 'Too many OTP verification attempts. Please wait 10 minutes before requesting another code.'
});

/**
 * 6. Checkout & Order Placement Limiter:
 * Prevents rapid repeated order placement, receipt upload floods, and double charges.
 * Default: 10 requests / 10 minutes (600s)
 */
export const checkoutLimiter = createRateLimiter({
  name: 'checkout',
  defaultMax: 10,
  defaultWindowSec: 600,
  envMaxKey: 'RATE_LIMIT_CHECKOUT_MAX',
  envWindowSecKey: 'RATE_LIMIT_CHECKOUT_WINDOW_SEC',
  failPolicy: 'fail-closed',
  userPreferred: true,
  message: 'You have placed multiple orders recently. Please wait a few moments before placing another order.'
});

/**
 * 7. Cart Operations Limiter:
 * Moderates cart additions, updates, and sync calls.
 * Default: 30 requests / 60 seconds
 */
export const cartLimiter = createRateLimiter({
  name: 'cart',
  defaultMax: 30,
  defaultWindowSec: 60,
  envMaxKey: 'RATE_LIMIT_CART_MAX',
  envWindowSecKey: 'RATE_LIMIT_CART_WINDOW_SEC',
  failPolicy: 'fail-open',
  userPreferred: true,
  message: 'Cart action limit exceeded. Please wait a moment before modifying your cart.'
});

/**
 * 8. Product Listing & Search Limiter:
 * Protects MongoDB text search, variant projections, and image proxies from scraping bots.
 * Default: 60 requests / 60 seconds
 */
export const productSearchLimiter = createRateLimiter({
  name: 'products',
  defaultMax: 60,
  defaultWindowSec: 60,
  envMaxKey: 'RATE_LIMIT_PRODUCTS_MAX',
  envWindowSecKey: 'RATE_LIMIT_PRODUCTS_WINDOW_SEC',
  failPolicy: 'fail-open',
  message: 'Product browsing request limit exceeded. Please slow down and try again shortly.'
});

/**
 * 9. Contact Query Limiter:
 * Protects contact form and query submissions from spam.
 * Default: 5 queries / 15 minutes (900s)
 */
export const contactLimiter = createRateLimiter({
  name: 'contact',
  defaultMax: 5,
  defaultWindowSec: 900,
  envMaxKey: 'RATE_LIMIT_CONTACT_MAX',
  envWindowSecKey: 'RATE_LIMIT_CONTACT_WINDOW_SEC',
  failPolicy: 'fail-closed',
  userPreferred: false,
  message: 'Too many messages sent. Please wait 15 minutes before sending another inquiry.'
});

/**
 * 10. Admin Limiter:
 * Limits resource-intensive administrative aggregations and dashboard queries.
 * Default: 60 requests / 60 seconds
 */
export const adminLimiter = createRateLimiter({
  name: 'admin',
  defaultMax: 60,
  defaultWindowSec: 60,
  envMaxKey: 'RATE_LIMIT_ADMIN_MAX',
  envWindowSecKey: 'RATE_LIMIT_ADMIN_WINDOW_SEC',
  failPolicy: 'fail-closed',
  userPreferred: true
});

// Backward-compatibility aliases
export const loginLimiter = authLimiter;
export const registerLimiter = signupLimiter;

export default generalLimiter;
