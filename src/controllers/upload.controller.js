import uploadService from '../services/upload.service.js';
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
  
  const { url, publicId } = await uploadService.uploadSingle(req.file, folder);

  res.status(200).json(
    new ApiResponse(200, { url, publicId }, 'Image uploaded successfully')
  );
});

