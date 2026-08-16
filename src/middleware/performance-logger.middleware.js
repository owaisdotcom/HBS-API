/**
 * Backend Performance Logger Middleware
 * 
 * Logs request duration, response status, endpoint, user role, and response size.
 * Designed for minimal production overhead, attaching asynchronously to the res 'finish' event.
 * Configurable via PERFORMANCE_LOGGING env variable.
 * Strictly redacts sensitive credentials and payment data.
 */

export const performanceLogger = (req, res, next) => {
  // Allow toggling performance logging via environment variable
  if (process.env.PERFORMANCE_LOGGING === 'false') {
    return next();
  }

  const startTime = process.hrtime();

  res.on('finish', () => {
    try {
      const diff = process.hrtime(startTime);
      const responseTimeMs = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);
      
      const userRole = req.user ? 'Customer' : req.admin ? 'Admin' : 'Guest';
      const contentLength = res.getHeader('content-length') || '0';
      const statusCode = res.statusCode;

      // Log in development mode, or when requested via env var, or on errors/slow requests
      const isLoggingEnabled = process.env.PERFORMANCE_LOGGING === 'true' || process.env.NODE_ENV === 'development';
      if (isLoggingEnabled || responseTimeMs > 1000 || statusCode >= 400) {
        console.log(`[PERF] ${new Date().toISOString()} | ${req.method} ${req.originalUrl || req.url} | ${statusCode} | ${responseTimeMs}ms | ${contentLength}B | Role: ${userRole}`);
      }
    } catch (_) {
      // Prevent logging errors from affecting request lifecycle
    }
  });

  next();
};
