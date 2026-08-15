import ServerErrorLog from '../models/ServerErrorLog.js';
import { sanitizeData } from '../utils/sanitize.js';
import { shouldLogStatus } from '../config/log.config.js';

/**
 * Service to record backend server & client errors safely into MongoDB storage.
 * Captures 5xx Server Failures & 4xx Client Errors according to logging config.
 * Ensures logging NEVER causes an API request to fail.
 */
export const logServerError = async ({
  req = null,
  err = null,
  statusCode = 500,
  message = '',
  stack = '',
  severity = null
}) => {
  try {
    const finalStatusCode = Number(statusCode) || 500;
    const endpoint = req?.originalUrl || req?.url || 'Internal/Background';

    // Check configurable logging filters
    if (!shouldLogStatus(finalStatusCode, endpoint)) {
      return;
    }

    const errorMessage = message || err?.message || (finalStatusCode >= 500 ? 'Internal Server Error' : 'Client Error');

    // Categorize error: 5xx Server Error vs 4xx Client Error
    const errorCategory = finalStatusCode >= 500 ? '5xx Server Error' : '4xx Client Error';

    // Stack trace is captured for 5xx server errors or explicit exceptions
    const stackTrace = (finalStatusCode >= 500 || err?.stack) ? (stack || err?.stack || '') : '';

    // Determine severity
    let calculatedSeverity = severity;
    if (!calculatedSeverity) {
      if (finalStatusCode >= 500) {
        calculatedSeverity = 'critical';
      } else if (finalStatusCode === 401 || finalStatusCode === 403 || finalStatusCode === 429) {
        calculatedSeverity = 'warning';
      } else {
        calculatedSeverity = 'error';
      }
    }

    const method = req?.method || 'SYSTEM';
    const requestId = req?.requestId || req?.headers?.['x-request-id'] || null;
    const userId = req?.user?._id || req?.user?.id || null;
    const adminId = req?.admin?._id || req?.admin?.id || null;
    const ipAddress = req?.ip || req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '';
    const userAgent = req?.headers?.['user-agent'] || '';

    // Sanitize parameters & body to strictly omit passwords, tokens, cookies, payment details
    const queryParams = req?.query ? sanitizeData(req.query) : {};
    const requestBody = req?.body ? sanitizeData(req.body) : {};

    // Save error log to MongoDB
    await ServerErrorLog.create({
      timestamp: new Date(),
      method,
      endpoint,
      statusCode: finalStatusCode,
      errorCategory,
      errorMessage,
      stackTrace,
      requestId,
      userId,
      adminId,
      severity: calculatedSeverity,
      queryParams,
      requestBody,
      ipAddress,
      userAgent,
      environment: process.env.NODE_ENV || 'production',
      isResolved: false
    });
  } catch (logError) {
    // Fail-safe fallback: log to console so failure to write to DB never breaks the application response
    console.error('[ErrorLogService] Failed to record error log in DB:', logError.message);
  }
};
