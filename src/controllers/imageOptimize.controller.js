import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

// Disk cache folder for optimized image variants
const CACHE_DIR = path.resolve(process.cwd(), 'cache', 'images');
if (!fs.existsSync(CACHE_DIR)) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  } catch (err) {
    console.warn('[ImageOptimizer] Could not pre-create cache directory:', err.message);
  }
}

// Preset mapping for standard storefront dimensions
export const PRESETS = {
  thumbnail: { width: 300, height: 375, fit: 'cover' },
  listing: { width: 500, height: 625, fit: 'cover' },
  detail: { width: 900, height: 1125, fit: 'cover' },
};

/**
 * Controller to dynamically optimize, resize, and format images into WebP/AVIF.
 * Supported query params:
 *   - url: Remote image URL (Cloudflare R2 or legacy Cloudinary)
 *   - preset: 'thumbnail' | 'listing' | 'detail'
 *   - w / width: target width (px)
 *   - h / height: target height (px)
 *   - format: 'webp' | 'avif' | 'jpeg' (default: 'webp')
 *   - q / quality: 1-100 (default: 82)
 */
export const optimizeImage = asyncHandler(async (req, res, next) => {
  const { url, preset, format = 'webp' } = req.query;

  if (!url || typeof url !== 'string' || !url.trim()) {
    return next(new ApiError('URL parameter is required', 400));
  }

  const cleanUrl = url.trim();

  let parsedUrl;
  try {
    parsedUrl = new URL(cleanUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return next(new ApiError('Invalid URL protocol', 400));
    }
  } catch {
    return next(new ApiError('Invalid URL format', 400));
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  // Block private and internal network SSRF attempts
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('172.16.') ||
    hostname.startsWith('169.254.')
  ) {
    return next(new ApiError('Access to private network addresses is forbidden', 403));
  }

  // Restrict to trusted media hostnames (Cloudflare R2, HBS domain, Cloudinary)
  const isAllowedHost =
    hostname.endsWith('r2.dev') ||
    hostname.endsWith('r2.cloudflarestorage.com') ||
    hostname.endsWith('hijabsbyshiza.com') ||
    hostname.endsWith('cloudinary.com') ||
    (process.env.R2_PUBLIC_URL && hostname === new URL(process.env.R2_PUBLIC_URL).hostname.toLowerCase());

  if (!isAllowedHost) {
    return next(new ApiError('Remote domain is not authorized for optimization', 403));
  }

  // Determine target dimensions
  let targetWidth;
  let targetHeight;
  let targetFit = 'cover';

  if (preset && PRESETS[preset]) {
    targetWidth = PRESETS[preset].width;
    targetHeight = PRESETS[preset].height;
    targetFit = PRESETS[preset].fit;
  } else {
    const rawW = parseInt(req.query.w || req.query.width, 10);
    const rawH = parseInt(req.query.h || req.query.height, 10);
    targetWidth = Number.isFinite(rawW) && rawW > 0 ? Math.min(rawW, 2400) : undefined;
    targetHeight = Number.isFinite(rawH) && rawH > 0 ? Math.min(rawH, 2400) : undefined;
  }

  const quality = Math.max(10, Math.min(100, parseInt(req.query.q || req.query.quality, 10) || 82));
  const outputFormat = ['webp', 'avif', 'jpeg', 'png'].includes(format.toLowerCase())
    ? format.toLowerCase()
    : 'webp';

  // If no resizing or format change requested, redirect to original URL
  if (!targetWidth && !targetHeight && outputFormat === 'webp' && cleanUrl.endsWith('.webp')) {
    return res.redirect(301, cleanUrl);
  }

  // Cache key based on URL, dimensions, and compression params
  const cacheKey = crypto
    .createHash('sha256')
    .update(`${cleanUrl}_${targetWidth || 'auto'}x${targetHeight || 'auto'}_${targetFit}_q${quality}.${outputFormat}`)
    .digest('hex');

  const cacheFilePath = path.join(CACHE_DIR, `${cacheKey}.${outputFormat}`);

  // 1. Check disk cache
  if (fs.existsSync(cacheFilePath)) {
    const mimeTypes = {
      webp: 'image/webp',
      avif: 'image/avif',
      jpeg: 'image/jpeg',
      png: 'image/png'
    };
    res.setHeader('Content-Type', mimeTypes[outputFormat] || 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Image-Cache', 'HIT');
    return fs.createReadStream(cacheFilePath).pipe(res);
  }

  // 2. Fetch original image
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

    const fetchRes = await fetch(cleanUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!fetchRes.ok) {
      console.warn(`[ImageOptimizer] Source fetch failed: ${fetchRes.status} for ${cleanUrl}`);
      // Fallback: Redirect to source if fetch fails
      return res.redirect(302, cleanUrl);
    }

    const contentType = fetchRes.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return next(new ApiError('Target URL is not a valid image', 400));
    }

    const sourceBuffer = Buffer.from(await fetchRes.arrayBuffer());

    // 3. Process with sharp
    let pipeline = sharp(sourceBuffer, { failOnError: false });

    if (targetWidth || targetHeight) {
      pipeline = pipeline.resize({
        width: targetWidth || null,
        height: targetHeight || null,
        fit: targetFit,
        withoutEnlargement: true
      });
    }

    if (outputFormat === 'webp') {
      pipeline = pipeline.webp({ quality, effort: 4 });
    } else if (outputFormat === 'avif') {
      pipeline = pipeline.avif({ quality, effort: 4 });
    } else if (outputFormat === 'jpeg') {
      pipeline = pipeline.jpeg({ quality, mozjpeg: true });
    }

    const outputBuffer = await pipeline.toBuffer();

    // 4. Save to disk cache asynchronously
    fs.writeFile(cacheFilePath, outputBuffer, (err) => {
      if (err) console.warn('[ImageOptimizer] Failed to write cache:', err.message);
    });

    // 5. Send optimized image response
    const mimeTypes = {
      webp: 'image/webp',
      avif: 'image/avif',
      jpeg: 'image/jpeg',
      png: 'image/png'
    };
    res.setHeader('Content-Type', mimeTypes[outputFormat] || 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Image-Cache', 'MISS');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.send(outputBuffer);
  } catch (err) {
    console.error(`[ImageOptimizer] Processing error for ${cleanUrl}:`, err.message);
    // Graceful fallback: Redirect to original master image rather than showing a broken icon
    return res.redirect(302, cleanUrl);
  }
});
