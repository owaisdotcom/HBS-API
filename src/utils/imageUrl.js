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
 * Also supports arrays of images/URLs (such as variant image arrays).
 *
 * @param {string|object|Array} urlOrObj
 * @returns {string|Array<string>|null} The clean relative object key, e.g. "hbs-products/003d3583.jpeg" or array of keys
 */
export function extractImageKey(urlOrObj) {
  if (!urlOrObj) return null;

  // Handle variant image arrays or lists of images
  if (Array.isArray(urlOrObj)) {
    return urlOrObj.flatMap(item => {
      const res = extractImageKey(item);
      return Array.isArray(res) ? res : (res ? [res] : []);
    });
  }

  // Handle image objects: { objectKey, key, r2Url, imageUrl, url, image, src }
  if (typeof urlOrObj === 'object') {
    const directKey = urlOrObj.objectKey || urlOrObj.key;
    if (directKey && typeof directKey === 'string' && directKey.trim()) {
      const cleaned = directKey.trim().replace(/^\/+/, '');
      // If the directKey happens to be a full URL, extract key from it
      if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
        return extractImageKey(cleaned);
      }
      return cleaned;
    }
    if (urlOrObj.r2Url) return extractImageKey(urlOrObj.r2Url);
    if (urlOrObj.imageUrl) return extractImageKey(urlOrObj.imageUrl);
    if (urlOrObj.url) return extractImageKey(urlOrObj.url);
    if (urlOrObj.image) return extractImageKey(urlOrObj.image);
    if (urlOrObj.src) return extractImageKey(urlOrObj.src);
    return null;
  }

  if (typeof urlOrObj !== 'string') return null;
  let str = urlOrObj.trim();
  if (!str) return null;

  // Skip data URLs and blob URLs
  if (str.startsWith('data:') || str.startsWith('blob:')) return null;

  // Strip query parameters and hash fragments for key extraction
  str = str.split('?')[0].split('#')[0];

  const r2Public = getR2PublicUrl();

  // 1. Matches R2 public URL / dev URL
  if (r2Public && str.startsWith(r2Public)) {
    return str.replace(`${r2Public}/`, '').replace(/^\/+/, '');
  }
  if (str.startsWith(R2_PUBLIC_BASE_URL)) {
    return str.replace(`${R2_PUBLIC_BASE_URL}/`, '').replace(/^\/+/, '');
  }
  if (/^https?:\/\/[a-z0-9_-]+\.r2\.dev\//i.test(str)) {
    return str.replace(/^https?:\/\/[a-z0-9_-]+\.r2\.dev\/?/i, '').replace(/^\/+/, '');
  }

  // 2. Matches legacy custom domain (for backwards compatibility with existing database records)
  if (/^https?:\/\/images\.hijabsbyshiza\.com/i.test(str)) {
    return str.replace(/^https?:\/\/images\.hijabsbyshiza\.com\/?/i, '').replace(/^\/+/, '');
  }

  // 3. Matches direct R2 cloudflarestorage endpoint
  if (str.includes('.r2.cloudflarestorage.com/')) {
    const parts = str.split('.r2.cloudflarestorage.com/');
    if (parts[1]) {
      const pathAfterEndpoint = parts[1];
      const slashIndex = pathAfterEndpoint.indexOf('/');
      return slashIndex !== -1 ? pathAfterEndpoint.substring(slashIndex + 1).replace(/^\/+/, '') : pathAfterEndpoint.replace(/^\/+/, '');
    }
  }

  // 4. Matches legacy Cloudinary URL
  if (str.includes('res.cloudinary.com')) {
    const match = str.match(/https?:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/(?:[a-z0-9_,]+\/)*(?:v\d+\/)?(.+)/i);
    if (match && match[1]) {
      return match[1].replace(/^\/+/, '');
    }
  }

  // 5. Matches raw storage key pattern starting with standard prefixes
  const keyMatch = str.match(/^\/?(hbs-[a-z0-9_-]+\/.+|products\/.+|categories\/.+|bundles\/.+|uploads\/.+|reviews\/.+|testimonials\/.+|settings\/.+|receipts\/.+|size-charts\/.+)/i);
  if (keyMatch && keyMatch[1]) {
    return keyMatch[1];
  }

  // 6. Generic pathname extraction if it contains a known folder prefix
  try {
    const parsed = new URL(str);
    const pathname = parsed.pathname.replace(/^\/+/, '');
    if (/^(hbs-[a-z0-9_-]+|products|categories|bundles|uploads|reviews|testimonials|settings|receipts|size-charts)\/.+/i.test(pathname)) {
      return pathname;
    }
  } catch (_) {
    // Not a full URL - if it's already a clean relative path with an image file extension, return as key
    if (!str.includes('://') && !str.startsWith('/') && !/\s/.test(str) && /\.(jpe?g|png|webp|gif|svg|avif)$/i.test(str)) {
      return str;
    }
  }

  return null;
}

/**
 * Resolves an image URL or image object to the Cloudflare R2 public development URL.
 * Transparently translates any legacy custom domain URLs while preserving paths and query params,
 * and leaving external URLs untouched.
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
    if (urlOrObj.imageUrl && typeof urlOrObj.imageUrl === 'string' && urlOrObj.imageUrl.trim()) {
      return resolveImageUrl(urlOrObj.imageUrl);
    }
    if (urlOrObj.url && typeof urlOrObj.url === 'string' && urlOrObj.url.trim()) {
      return resolveImageUrl(urlOrObj.url);
    }
    if (urlOrObj.objectKey && typeof urlOrObj.objectKey === 'string' && urlOrObj.objectKey.trim()) {
      return `${getR2PublicUrl()}/${urlOrObj.objectKey.trim().replace(/^\/+/, '')}`;
    }
    if (urlOrObj.key && typeof urlOrObj.key === 'string' && urlOrObj.key.trim()) {
      return `${getR2PublicUrl()}/${urlOrObj.key.trim().replace(/^\/+/, '')}`;
    }
    if (urlOrObj.image && typeof urlOrObj.image === 'string' && urlOrObj.image.trim()) {
      return resolveImageUrl(urlOrObj.image);
    }
    // Support numeric-key objects such as { "0": "url" }
    if (urlOrObj['0'] !== undefined) {
      return resolveImageUrl(urlOrObj['0']);
    }
    const firstStr = Object.values(urlOrObj).find(v => typeof v === 'string' && v.trim());
    if (firstStr) {
      return resolveImageUrl(firstStr);
    }
    return null;
  }

  if (typeof urlOrObj !== 'string') return null;
  const str = urlOrObj.trim();
  if (!str) return null;

  // Preserve data URLs and blob URLs
  if (str.startsWith('data:') || str.startsWith('blob:')) return str;

  // Already canonical R2 public URL
  if (str.startsWith(getR2PublicUrl()) || str.startsWith(R2_PUBLIC_BASE_URL)) {
    return str;
  }

  // Legacy custom domain compatibility: rewrite to R2 public URL while preserving query parameters
  if (/^https?:\/\/images\.hijabsbyshiza\.com/i.test(str)) {
    const pathAndQuery = str.replace(/^https?:\/\/images\.hijabsbyshiza\.com\/?/i, '');
    return `${getR2PublicUrl()}/${pathAndQuery.replace(/^\/+/, '')}`;
  }

  // Cloudinary legacy URL
  if (str.includes('res.cloudinary.com')) {
    const match = str.match(/https?:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/(?:[a-z0-9_,]+\/)*(?:v\d+\/)?(.+)/i);
    if (match && match[1]) {
      return `${getR2PublicUrl()}/${match[1].replace(/^\/+/, '')}`;
    }
  }

  // Cloudflare storage direct endpoint
  if (str.includes('.r2.cloudflarestorage.com/')) {
    const parts = str.split('.r2.cloudflarestorage.com/');
    if (parts[1]) {
      const pathAfterEndpoint = parts[1];
      const slashIndex = pathAfterEndpoint.indexOf('/');
      const key = slashIndex !== -1 ? pathAfterEndpoint.substring(slashIndex + 1).replace(/^\/+/, '') : pathAfterEndpoint;
      return `${getR2PublicUrl()}/${key}`;
    }
  }

  // Raw key with known storage prefix (e.g. "products/example.webp", "hbs-products/...", "/products/...")
  const keyMatch = str.match(/^\/?(hbs-[a-z0-9_-]+\/.+|products\/.+|categories\/.+|bundles\/.+|uploads\/.+|reviews\/.+|testimonials\/.+|settings\/.+|receipts\/.+|size-charts\/.+)/i);
  if (keyMatch && keyMatch[1]) {
    return `${getR2PublicUrl()}/${keyMatch[1]}`;
  }

  // Local static asset (e.g. "/brand1.jpg")
  if (str.startsWith('/')) {
    return str;
  }

  // External URLs (e.g., Google user avatar, unpkg placeholders) remain untouched
  return str;
}

/**
 * Normalizes all image URLs inside a product document or plain product object
 * so that all image properties (images, variants.images, thumbnail, sizeChartUrl)
 * point to canonical Cloudflare R2 development URLs.
 *
 * @param {object} product
 * @returns {object} Normalized product object
 */
export function normalizeProductImageUrls(product) {
  if (!product) return product;
  const isMongoose = typeof product.toObject === 'function';
  const p = isMongoose ? product.toObject() : { ...product };

  if (Array.isArray(p.images)) {
    p.images = p.images.map(img => {
      if (!img) return img;
      if (typeof img === 'string') {
        const resolved = resolveImageUrl(img) || img;
        const key = extractImageKey(resolved);
        return {
          provider: 'r2',
          key,
          objectKey: key,
          url: resolved,
          imageUrl: resolved,
          r2Url: resolved
        };
      }
      const canonical = resolveImageUrl(img.r2Url) || resolveImageUrl(img.url) || img.url;
      const key = img.objectKey || img.key || extractImageKey(canonical);
      return {
        ...img,
        provider: img.provider || 'r2',
        key,
        objectKey: key,
        url: canonical,
        imageUrl: canonical,
        r2Url: canonical
      };
    });
  }

  if (p.thumbnail) {
    p.thumbnail = resolveImageUrl(p.thumbnail) || p.thumbnail;
    p.thumbnailImageUrl = p.thumbnail;
    p.thumbnailR2Url = p.thumbnail;
    p.thumbnailObjectKey = extractImageKey(p.thumbnail);
  }
  if (p.image) {
    p.image = resolveImageUrl(p.image) || p.image;
    p.imageImageUrl = p.image;
    p.imageR2Url = p.image;
    p.imageObjectKey = extractImageKey(p.image);
  }

  if (Array.isArray(p.variants)) {
    p.variants = p.variants.map(v => {
      if (!v) return v;
      const variant = { ...v };
      if (Array.isArray(variant.images)) {
        variant.images = variant.images.map(img => {
          if (!img) return img;
          if (typeof img === 'string') {
            const resolved = resolveImageUrl(img) || img;
            const key = extractImageKey(resolved);
            return {
              provider: 'r2',
              key,
              objectKey: key,
              url: resolved,
              imageUrl: resolved,
              r2Url: resolved
            };
          }
          const canonical = resolveImageUrl(img.r2Url) || resolveImageUrl(img.url) || img.url;
          const key = img.objectKey || img.key || extractImageKey(canonical);
          return {
            ...img,
            provider: img.provider || 'r2',
            key,
            objectKey: key,
            url: canonical,
            imageUrl: canonical,
            r2Url: canonical
          };
        });
      }
      if (Array.isArray(variant.sizes)) {
        variant.sizes = variant.sizes.map(s => {
          if (!s) return s;
          const size = { ...s };
          if (size.sizeChartUrl || size.sizeChartR2Url) {
            const chartUrl = resolveImageUrl(size.sizeChartR2Url) || resolveImageUrl(size.sizeChartUrl) || size.sizeChartUrl;
            const chartKey = size.sizeChartObjectKey || extractImageKey(chartUrl);
            size.sizeChartUrl = chartUrl;
            size.sizeChartImageUrl = chartUrl;
            size.sizeChartR2Url = chartUrl;
            size.sizeChartObjectKey = chartKey;
          }
          return size;
        });
      }
      return variant;
    });
  }

  return p;
}

/**
 * Normalizes an array of products.
 *
 * @param {Array} products
 * @returns {Array}
 */
export function normalizeProductList(products) {
  if (!Array.isArray(products)) return [];
  return products.map(normalizeProductImageUrls);
}

/**
 * Normalizes all image URLs inside a category document or plain category object
 * so that thumbnail and coverImage point to canonical Cloudflare R2 development URLs,
 * and imageUrl/r2Url/objectKey fields are reliably populated.
 *
 * @param {object} category
 * @returns {object} Normalized category object
 */
export function normalizeCategoryImages(category) {
  if (!category) return category;
  const isMongoose = typeof category.toObject === 'function';
  const c = isMongoose ? category.toObject() : { ...category };

  if (c.thumbnail || c.thumbnailR2Url || c.thumbnailImageUrl) {
    const rawThumb = c.thumbnailR2Url || c.thumbnailImageUrl || c.thumbnail;
    const thumbUrl = resolveImageUrl(rawThumb) || rawThumb;
    const thumbKey = c.thumbnailObjectKey || extractImageKey(thumbUrl);
    c.thumbnail = thumbUrl;
    c.thumbnailImageUrl = thumbUrl;
    c.thumbnailR2Url = thumbUrl;
    c.thumbnailObjectKey = thumbKey;
  }

  if (c.coverImage || c.coverImageR2Url || c.coverImageUrl) {
    const rawCover = c.coverImageR2Url || c.coverImageUrl || c.coverImage;
    const coverUrl = resolveImageUrl(rawCover) || rawCover;
    const coverKey = c.coverImageObjectKey || extractImageKey(coverUrl);
    c.coverImage = coverUrl;
    c.coverImageUrl = coverUrl;
    c.coverImageR2Url = coverUrl;
    c.coverImageObjectKey = coverKey;
  }

  if (Array.isArray(c.children)) {
    c.children = c.children.map(normalizeCategoryImages);
  }

  return c;
}

/**
 * Normalizes an array of categories.
 *
 * @param {Array} categories
 * @returns {Array}
 */
export function normalizeCategoryList(categories) {
  if (!Array.isArray(categories)) return [];
  return categories.map(normalizeCategoryImages);
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

/**
 * Normalizes an image array input into a clean, deduplicated array of valid URL strings.
 * Handles:
 * - Pure string arrays
 * - Numeric-key objects (e.g. { "0": "url1", "1": "url2" })
 * - Stringified JSON arrays or objects (e.g. "[\"url1\"]" or "{\"0\":\"url1\"}")
 * - Single URL strings or comma-separated strings
 * - Arrays of objects containing url or r2Url
 * - Safe handling of legacy/malformed data without discarding valid URLs
 *
 * @param {any} input
 * @returns {string[]} Array of normalized URL strings
 */
export function normalizeImageStringArray(input) {
  if (input === undefined || input === null) return [];

  const collected = [];

  function extract(val) {
    if (val === undefined || val === null) return;

    if (Array.isArray(val)) {
      for (const item of val) {
        extract(item);
      }
      return;
    }

    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed) return;

      // Check if it's JSON-stringified array or object
      if ((trimmed.startsWith('[') && trimmed.endsWith(']')) ||
          (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
        try {
          const parsed = JSON.parse(trimmed);
          extract(parsed);
          return;
        } catch (_) {}
      }

      // Check if it's a comma-separated list of URLs (without data URIs)
      if (trimmed.includes(',') && !trimmed.startsWith('data:')) {
        const parts = trimmed.split(',').map(s => s.trim()).filter(Boolean);
        if (parts.length > 1 && parts.every(p => p.startsWith('http') || p.startsWith('/'))) {
          for (const p of parts) extract(p);
          return;
        }
      }

      if (/^https?:\/\/images\.hijabsbyshiza\.com/i.test(trimmed)) {
        const resolved = resolveImageUrl(trimmed) || trimmed;
        collected.push(resolved.trim());
      } else {
        collected.push(trimmed);
      }
      return;
    }

    if (typeof val === 'object') {
      // Direct image object with url/r2Url
      if (val.r2Url || val.url || val.imageUrl || val.image) {
        const u = val.r2Url || val.url || val.imageUrl || val.image;
        extract(u);
        return;
      }

      // Numeric-key object e.g. { "0": "url1", "1": "url2" }
      const keys = Object.keys(val);
      const isAllNumeric = keys.length > 0 && keys.every(k => !isNaN(Number(k)));
      if (isAllNumeric) {
        keys.sort((a, b) => Number(a) - Number(b));
      }

      for (const k of keys) {
        extract(val[k]);
      }
    }
  }

  extract(input);

  // Deduplicate while preserving order
  const seen = new Set();
  const result = [];
  for (const url of collected) {
    if (typeof url === 'string' && url.length > 0 && !seen.has(url)) {
      seen.add(url);
      result.push(url);
    }
  }

  return result;
}

/**
 * Normalizes a single image field into a valid URL string or null.
 * Handles objects, numeric-key objects, arrays, and JSON strings gracefully.
 *
 * @param {any} input
 * @returns {string|null}
 */
export function normalizeSingleImageUrl(input) {
  if (input === undefined || input === null) return undefined;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return undefined;
    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) ||
        (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      try {
        const parsed = JSON.parse(trimmed);
        return normalizeSingleImageUrl(parsed);
      } catch (_) {}
    }
    if (/^https?:\/\/images\.hijabsbyshiza\.com/i.test(trimmed)) {
      return resolveImageUrl(trimmed) || trimmed;
    }
    return trimmed;
  }
  if (Array.isArray(input)) {
    for (const item of input) {
      const res = normalizeSingleImageUrl(item);
      if (res) return res;
    }
    return undefined;
  }
  if (typeof input === 'object') {
    if (input.r2Url || input.url || input.imageUrl || input.image) {
      const u = input.r2Url || input.url || input.imageUrl || input.image;
      return normalizeSingleImageUrl(u);
    }
    if (input['0'] !== undefined) {
      return normalizeSingleImageUrl(input['0']);
    }
    const first = Object.values(input).find(v => v);
    if (first) return normalizeSingleImageUrl(first);
  }
  return undefined;
}

