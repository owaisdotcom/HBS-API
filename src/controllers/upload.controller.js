import uploadService from '../services/upload.service.js';
import { runCloudinaryToR2Migration, runDualR2UrlMigration } from '../services/migration.service.js';
import { generateR2Url, resolveImageUrl } from '../utils/imageUrl.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

// @route   POST /api/admin/upload/image
// @desc    Upload single image
// @access  Private (Admin)
export const uploadSingleImage = asyncHandler(async (req, res, next) => {
  if (!req.file) {
    return next(new ApiError('No image file provided', 400));
  }

  const folder = req.body.folder || 'hbs-uploads';

  const uploadResult = await uploadService.uploadSingle(req.file, folder);
  const { url, key, publicId, provider } = uploadResult;
  const resolvedUrl = resolveImageUrl(url) || url;
  const r2Url = uploadResult.r2Url ? (resolveImageUrl(uploadResult.r2Url) || uploadResult.r2Url) : resolvedUrl;

  res.status(200).json(
    new ApiResponse(200, { provider, url: resolvedUrl, r2Url, key, publicId }, 'Image uploaded successfully')
  );
});

// @route   POST /api/admin/migrate-image-urls-to-r2
// @desc    Migrate image URLs to dual R2 public dev URLs across the entire database
// @access  Private (Admin)
export const migrateImageUrlsToR2Admin = asyncHandler(async (req, res) => {
  const dryRun = req.body?.dryRun === true || req.query?.dryRun === 'true';
  const result = await runDualR2UrlMigration({ dryRun });

  res.status(200).json(
    new ApiResponse(200, result, 'Dual R2 image URL migration completed successfully')
  );
});

// @route   POST /api/admin/upload/migrate-r2 (or /api/admin/migrate-r2)
// @desc    Trigger Cloudinary to Cloudflare R2 database migration
// @access  Private (Admin)
export const migrateCloudinaryToR2Admin = asyncHandler(async (req, res) => {
  const dryRun = req.body?.dryRun === true || req.query?.dryRun === 'true';
  const result = await runCloudinaryToR2Migration({ dryRun });

  res.status(200).json(
    new ApiResponse(200, result, 'Cloudinary to Cloudflare R2 migration completed successfully')
  );
});

// @route   GET /api/upload/proxy-image?url=...
// @desc    Proxy remote image with CORS headers for frontend canvas cropping
// @access  Public
export const proxyImage = asyncHandler(async (req, res, next) => {
  const { url } = req.query;
  if (!url) {
    return next(new ApiError('URL parameter is required', 400));
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
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

  // Restrict to trusted media hostnames (Cloudinary, Cloudflare R2, HBS domain)
  const isAllowedHost =
    hostname.endsWith('cloudinary.com') ||
    hostname.endsWith('hijabsbyshiza.com') ||
    hostname.endsWith('r2.cloudflarestorage.com') ||
    hostname.endsWith('r2.dev') ||
    hostname.endsWith('amazonaws.com') ||
    (process.env.R2_PUBLIC_URL && hostname === new URL(process.env.R2_PUBLIC_URL).hostname.toLowerCase());

  if (!isAllowedHost) {
    return next(new ApiError('Remote domain is not authorized for proxying', 403));
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return next(new ApiError('Failed to fetch remote image', response.status));
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return next(new ApiError('Remote resource is not an image', 400));
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const arrayBuffer = await response.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    return next(new ApiError(`Error proxying image: ${err.message}`, 500));
  }
});
