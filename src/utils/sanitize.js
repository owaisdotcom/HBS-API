/**
 * Utility to recursively sanitize object data by redacting sensitive keys
 * before writing to log storage.
 */

const SENSITIVE_KEYS = new Set([
  'password',
  'confirmpassword',
  'oldpassword',
  'newpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'admintoken',
  'authorization',
  'auth',
  'cookie',
  'cookies',
  'secret',
  'jwt_secret',
  'admin_jwt_secret',
  'key',
  'apikey',
  'creditcard',
  'cardnumber',
  'cvv',
  'cvc',
  'ssn',
  'bearer',
  'paymentdetails'
]);

export const sanitizeData = (data, depth = 0) => {
  if (data === null || data === undefined) return data;
  if (depth > 5) return '[Max Depth Reached]'; // Prevent deep circular nesting

  if (typeof data === 'string') {
    // Check if string looks like Bearer token or raw JWT
    if (data.toLowerCase().startsWith('bearer ') || /^eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*$/.test(data)) {
      return '[REDACTED TOKEN]';
    }
    return data;
  }

  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item, depth + 1));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    const normalizedKey = key.toLowerCase().replace(/[-_]/g, '');
    if (SENSITIVE_KEYS.has(normalizedKey)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeData(value, depth + 1);
    } else if (typeof value === 'string' && (normalizedKey.includes('pass') || normalizedKey.includes('secret') || normalizedKey.includes('token'))) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
};
