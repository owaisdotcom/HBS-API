/**
 * Image URL Resolution and Transformation Utilities
 *
 * All newly uploaded images use the Cloudflare R2 public development URL as the single source of truth:
 * Base URL: https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev (process.env.R2_PUBLIC_URL)
 *
 * Legacy custom domain (https://images.hijabsbyshiza.com) is supported strictly for backward
 * compatibility to resolve existing stored database records to R2 without breaking them.
 */

export const R2_PUBLIC_BASE_URL = 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev';
export const LEGACY_CUSTOM_DOMAIN = 'https://images.hijabsbyshiza.com';

  // Aliases maintained for backwards compatibility
  export const R2_DEV_URL = R2_PUBLIC_BASE_URL;
  export const CUSTOM_DOMAIN = R2_PUBLIC_BASE_URL;

  /**
   * Returns the canonical R2 public URL base (single source of truth).
   * Defaults to R2_PUBLIC_BASE_URL (https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev).
   */
  export function getR2PublicUrl() {
    const rawUrl = process.env.R2_PUBLIC_URL || process.env.R2_DEV_URL || R2_PUBLIC_BASE_URL;
    return rawUrl.replace(/\/+$/, '');
  }

  /**
   * Backward compatibility aliases
   */
  export function getR2DevDomain() {
    return getR2PublicUrl();
  }

  export function getCustomDomain() {
    return getR2PublicUrl();
  }

  /**
   * Extracts the storage key/path from an R2 public URL, legacy custom domain, Cloudinary URL, or storage key.
   *
   * @param {string|object} urlOrObj
   * @returns {string|null} The clean relative object key, e.g. "hbs-products/003d3583.jpeg"
   */
  export function extractImageKey(urlOrObj) {
    if (!urlOrObj) return null;

    if (typeof urlOrObj === 'object') {
      if (urlOrObj.key && typeof urlOrObj.key === 'string' && urlOrObj.key.trim()) {
        return urlOrObj.key.trim().replace(/^\/+/, '');
      }
      if (urlOrObj.r2Url) return extractImageKey(urlOrObj.r2Url);
      if (urlOrObj.url) return extractImageKey(urlOrObj.url);
      return null;
    }

    if (typeof urlOrObj !== 'string') return null;
    let str = urlOrObj.trim();
    if (!str) return null;

    // Skip data URLs and blob URLs
    if (str.startsWith('data:') || str.startsWith('blob:')) return null;

    // Strip query parameters and hash fragments for key matching
    str = str.split('?')[0].split('#')[0];

      const r2Public = getR2PublicUrl();

      // 1. Matches R2 public URL / dev URL
      if (str.startsWith(r2Public)) {
        return str.replace(`${r2Public}/`, '').replace(/^\/+/, '');
      }
      if (str.startsWith(R2_PUBLIC_BASE_URL)) {
        return str.replace(`${R2_PUBLIC_BASE_URL}/`, '').replace(/^\/+/, '');
      }
      if (str.startsWith('https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/')) {
        return str.replace('https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/', '').replace(/^\/+/, '');
      }

        // 2. Matches legacy custom domain (for backwards compatibility with existing database records)
        if (str.startsWith(LEGACY_CUSTOM_DOMAIN)) {
          return str.replace(`${LEGACY_CUSTOM_DOMAIN}/`, '').replace(/^\/+/, '');
        }
        if (str.startsWith('https://images.hijabsbyshiza.com/')) {
          return str.replace('https://images.hijabsbyshiza.com/', '').replace(/^\/+/, '');
        }

        // 3. Matches direct R2 cloudflarestorage endpoint
        if (str.includes('.r2.cloudflarestorage.com/')) {
          const parts = str.split('.r2.cloudflarestorage.com/');
          if (parts[1]) {
            const pathAfterEndpoint = parts[1];
            const slashIndex = pathAfterEndpoint.indexOf('/');
            return slashIndex !== -1 ? pathAfterEndpoint.substring(slashIndex + 1).replace(/^\/+/, '') : pathAfterEndpoint;
          }
        }

        // 4. Matches legacy Cloudinary URL
        if (str.includes('res.cloudinary.com')) {
          const match = str.match(/https?:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/(?:[a-z0-9_,]+\/)*(?:v\d+\/)?(.+)/i);
          if (match && match[1]) {
            return match[1].replace(/^\/+/, '');
          }
        }

        // 5. Matches raw storage key pattern starting with standard prefixes (e.g. "hbs-products/...")
        if (/^hbs-[a-z0-9_-]+\/.+/i.test(str)) {
          return str.replace(/^\/+/, '');
        }

        // 6. Generic pathname extraction if it contains a known folder prefix
        try {
          const parsed = new URL(str);
          const pathname = parsed.pathname.replace(/^\/+/, '');
          if (/^hbs-[a-z0-9_-]+\/.+/i.test(pathname)) {
            return pathname;
          }
        } catch (_) {
          // Not a full URL
        }

        return null;
      }

      /**
       * Resolves an image URL or image object to the Cloudflare R2 public development URL.
       * Transparently translates any legacy custom domain URLs without modifying external URLs.
       *
       * @param {string|object} urlOrObj
       * @returns {string|null} Canonical R2 public URL
       */
        export function resolveImageUrl(urlOrObj) {
          if (!urlOrObj) return null;

              if (typeof urlOrObj === 'object') {
                if (urlOrObj.r2Url && typeof urlOrObj.r2Url === 'string' && urlOrObj.r2Url.trim()) {
                  return resolveImageUrl(urlOrObj.r2Url);
                }
                if (urlOrObj.url && typeof urlOrObj.url === 'string' && urlOrObj.url.trim()) {
                  return resolveImageUrl(urlOrObj.url);
                }
                if (urlOrObj.key && typeof urlOrObj.key === 'string' && urlOrObj.key.trim()) {
                  return `${getR2PublicUrl()}/${urlOrObj.key.trim().replace(/^\/+/, '')}`;
                }
                return null;
              }

                if (typeof urlOrObj !== 'string') return null;
                const str = urlOrObj.trim();
                if (!str) return null;

                // Preserve data URLs and blob URLs
                if (str.startsWith('data:') || str.startsWith('blob:')) return str;

                // Legacy custom domain compatibility: rewrite to R2 public URL using the exact object key
                if (str.startsWith(LEGACY_CUSTOM_DOMAIN) || str.startsWith('https://images.hijabsbyshiza.com/')) {
                  const key = extractImageKey(str);
                  return key ? `${getR2PublicUrl()}/${key}` : str;
                }

                // Already R2 public URL
                if (str.startsWith(getR2PublicUrl()) || str.startsWith(R2_PUBLIC_BASE_URL)) {
                  return str;
                }

                // Raw key with known storage prefix
                if (/^hbs-[a-z0-9_-]+\/.+/i.test(str)) {
                  return `${getR2PublicUrl()}/${str.replace(/^\/+/, '')}`;
                }

                // External URLs (e.g., Google user avatar, unpkg placeholders) remain untouched
                return str;
              }

              /**
               * Generates the R2 Public URL for an image.
               *
               * @param {string|object} urlOrKey
               * @returns {string|undefined}
               */
              export function generateR2Url(urlOrKey) {
                const resolved = resolveImageUrl(urlOrKey);
                return resolved || undefined;
              }

              /**
               * Generates the Public URL for an image (now pointing to R2 public development URL).
               *
               * @param {string|object} urlOrKey
               * @returns {string|undefined}
               */
              export function generateCustomDomainUrl(urlOrKey) {
                const resolved = resolveImageUrl(urlOrKey);
                return resolved || undefined;
              }
