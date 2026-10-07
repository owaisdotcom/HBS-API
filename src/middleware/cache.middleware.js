/**
 * Middleware to force no-cache / no-store headers on all storefront routes.
 * Ensures browsers, proxies, CDNs, and edge caches never serve stale data or return 304 Not Modified.
 */
export const noCache = (req, res, next) => {
  // Strip conditional headers to prevent 304 Not Modified responses
  delete req.headers['if-none-match'];
  delete req.headers['if-modified-since'];

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
};

/**
 * staticCache now aliases noCache so all storefront endpoints
 * (categories, homepage, announcements, bundles, etc.) always return fresh 200 OK data.
 */
export const staticCache = () => noCache;
