/**
 * Rate limiters (Disabled - all endpoints pass through without rate limiting)
 */
const noopLimiter = (req, res, next) => next();

export const loginLimiter = noopLimiter;
export const registerLimiter = noopLimiter;
export const passwordResetLimiter = noopLimiter;
export const otpLimiter = noopLimiter;

export default noopLimiter;

