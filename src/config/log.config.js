/**
 * Configuration for Server Error & 4xx/5xx Client Error Logging
 * Allows dynamic/env tuning to prevent high-volume routine 4xx requests (e.g. 404 assets)
 * from cluttering log database while ensuring all critical 5xx server failures are captured.
 */

export const logConfig = {
  // Whether to log 4xx Client Errors in addition to 5xx Server Failures
  log4xxErrors: process.env.LOG_4XX_ERRORS !== 'false', // Default: true

  // Exclude routine 404 Not Found requests (e.g. invalid URLs, missing assets)
  excludeRoutine404: process.env.LOG_EXCLUDE_ROUTINE_404 !== 'false', // Default: true

  // Specific 4xx status codes to exclude from logging
  excludedStatusCodes: (process.env.LOG_EXCLUDED_STATUS_CODES || '404')
    .split(',')
    .map(code => parseInt(code.trim(), 10))
    .filter(Boolean),

  // Endpoint path patterns to completely ignore from error logging
  excludedEndpoints: [
    '/favicon.ico',
    '/robots.txt',
    '/.well-known/'
  ]
};

/**
 * Determines whether a given status code & endpoint should be persisted to error log database.
 */
export const shouldLogStatus = (statusCode, endpoint = '') => {
  // Always log 5xx Server Failures
  if (statusCode >= 500) return true;

  // Check if 4xx logging is enabled
  if (statusCode >= 400 && statusCode < 500) {
    if (!logConfig.log4xxErrors) return false;

    // Check endpoint exclusion
    if (logConfig.excludedEndpoints.some(pattern => endpoint.includes(pattern))) {
      return false;
    }

    // Check routine 404 exclusion
    if (statusCode === 404 && logConfig.excludeRoutine404) {
      return false;
    }

    // Check specific status code exclusion
    if (logConfig.excludedStatusCodes.includes(statusCode)) {
      return false;
    }

    return true;
  }

  return false;
};
