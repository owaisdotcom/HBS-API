/**
 * Middleware to force no-cache / no-store headers on stock-sensitive routes.
 * Ensures browsers, proxies, CDNs, and edge caches never serve stale stock data.
 */
export const noCache = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
};

/**
 * Middleware for static / low-change endpoints where caching is safe and improves performance.
 */
export const staticCache = (maxAgeSeconds = 60) => (req, res, next) => {
  res.setHeader('Cache-Control', `public, max-age=${maxAgeSeconds}, s-maxage=${maxAgeSeconds * 5}, stale-while-revalidate=600`);
  next();
};
