import uploadService from '../services/upload.service.js';
import { runCloudinaryToR2Migration } from '../services/migration.service.js';
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

  res.status(200).json(
    new ApiResponse(200, { provider, url, key, publicId }, 'Image uploaded successfully')
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

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return next(new ApiError('Failed to fetch remote image', response.status));
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const arrayBuffer = await response.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    return next(new ApiError(`Error proxying image: ${err.message}`, 500));
  }
});
