/**
 * Client Identification Utility
 *
 * Reliably extracts client identity using platform-verified headers (Vercel x-real-ip),
 * distinguishes between authenticated users and guest visitors, and handles shared IPs
 * (e.g. corporate or mobile carrier NAT).
 */

const IPV4_OR_IPV6_REGEX = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$|^[a-fA-F0-9:]+$/;

/**
 * Normalizes an IP string (cleans whitespace, removes IPv6-mapped IPv4 prefix)
 * @param {string} rawIp
 * @returns {string|null}
 */
const sanitizeIp = (rawIp) => {
  if (!rawIp || typeof rawIp !== 'string') return null;
  let ip = rawIp.trim();

  // Handle ::ffff:127.0.0.1 (IPv6-mapped IPv4)
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }

  // Handle port appended to IP if any (e.g. 1.2.3.4:5678)
  if (ip.includes(':') && ip.includes('.')) {
    ip = ip.split(':')[0];
  }

  return IPV4_OR_IPV6_REGEX.test(ip) ? ip : null;
};

/**
 * Extracts the most trustworthy client IP address.
 * Prioritizes platform-verified headers on Vercel over arbitrary forwarding headers.
 *
 * @param {import('express').Request} req
 * @returns {string}
 */
export const getClientIp = (req) => {
  // 1. Vercel edge sets 'x-real-ip' and strips any incoming client spoofing
  const vercelRealIp = sanitizeIp(req.headers['x-real-ip']);
  if (vercelRealIp) {
    return vercelRealIp;
  }

  // 2. Express req.ip (configured with app.set('trust proxy', 1))
  if (req.ip) {
    const expressIp = sanitizeIp(req.ip);
    if (expressIp) return expressIp;
  }

  // 3. Platform header: x-vercel-ip or x-forwarded-for first hop
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded && typeof forwarded === 'string') {
    const firstHop = sanitizeIp(forwarded.split(',')[0]);
    if (firstHop) return firstHop;
  }

  // 4. Socket / Connection remote address fallback
  const socketIp = sanitizeIp(req.socket?.remoteAddress || req.connection?.remoteAddress);
  if (socketIp) {
    return socketIp;
  }

  return '127.0.0.1';
};

/**
 * Determines client identity key for rate limiting.
 *
 * Strategy:
 * - If user/admin is authenticated and userPreferred is true:
 *   Key by user/admin ID. This ensures users on the same corporate/mobile NAT
 *   share independent quotas and do not block one another.
 * - Otherwise:
 *   Key by client IP.
 * - For sensitive credential endpoints (login, forgot-password), returns target identifier as well.
 *
 * @param {import('express').Request} req
 * @param {object} options
 * @param {boolean} [options.userPreferred=true] - Prefer authenticated user/admin ID over IP
 * @param {boolean} [options.includeEmail=false] - Return composite email target key if email in body
 * @returns {{ primaryKey: string, targetKey: string|null, ip: string, isUser: boolean }}
 */
export const getClientIdentity = (req, options = {}) => {
  const { userPreferred = true, includeEmail = false } = options;
  const ip = getClientIp(req);

  // Authenticated User
  if (userPreferred) {
    const userId = req.user?.id || req.user?._id;
    if (userId) {
      return {
        primaryKey: `user:${userId.toString()}`,
        targetKey: null,
        ip,
        isUser: true
      };
    }

    const adminId = req.admin?.id || req.admin?._id;
    if (adminId) {
      return {
        primaryKey: `admin:${adminId.toString()}`,
        targetKey: null,
        ip,
        isUser: true
      };
    }
  }

  // Unauthenticated - Primary key is IP
  const primaryKey = `ip:${ip}`;

  // Optional target identifier (e.g. normalized target email for login/reset brute-force defense)
  let targetKey = null;
  if (includeEmail && req.body?.email && typeof req.body.email === 'string') {
    const normalizedEmail = req.body.email.trim().toLowerCase();
    if (normalizedEmail.length <= 120 && normalizedEmail.includes('@')) {
      targetKey = `target:${normalizedEmail}`;
    }
  }

  return {
    primaryKey,
    targetKey,
    ip,
    isUser: false
  };
};

export default {
  getClientIp,
  getClientIdentity
};
