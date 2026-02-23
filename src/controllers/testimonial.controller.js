import Testimonial from '../models/Testimonial.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import uploadService from '../services/upload.service.js';

// @route   GET /api/homepage/testimonials
// @desc    Get published testimonials for homepage
// @access  Public
export const getPublishedTestimonials = asyncHandler(async (req, res) => {
  const testimonials = await Testimonial.find({ isPublished: true })
    .sort({ displayOrder: 1, createdAt: -1 })
    .lean();
  res.json(
    new ApiResponse(200, { testimonials }, 'Testimonials retrieved successfully')
  );
});

// @route   GET /api/admin/testimonials
// @desc    Get all testimonials (admin)
// @access  Private (Admin)
export const getAllTestimonials = asyncHandler(async (req, res) => {
  const testimonials = await Testimonial.find().sort({ displayOrder: 1, createdAt: -1 }).lean();
  res.json(
    new ApiResponse(200, { testimonials }, 'Testimonials retrieved successfully')
  );
});

// @route   GET /api/admin/testimonials/:id
// @desc    Get single testimonial (admin)
// @access  Private (Admin)
export const getTestimonialById = asyncHandler(async (req, res, next) => {
  const testimonial = await Testimonial.findById(req.params.id);
  if (!testimonial) {
    return next(new ApiError('Testimonial not found', 404));
  }
  res.json(
    new ApiResponse(200, { testimonial }, 'Testimonial retrieved successfully')
  );
});

// @route   POST /api/admin/testimonials
// @desc    Create testimonial (admin)
// @access  Private (Admin)
export const createTestimonial = asyncHandler(async (req, res, next) => {
  const body = req.body || {};
  const customerName = body.customerName ?? body.name;
  const testimonialText = body.testimonial ?? body.review;
  const rating = body.rating;
  const isPublished = body.isPublished;
  const displayOrder = body.displayOrder;
  if (!customerName || !testimonialText || rating == null) {
    return next(new ApiError('Customer name, rating, and testimonial text are required', 400));
  }
  const payload = {
    customerName: String(customerName).trim(),
    rating: Number(rating) || 5,
    testimonial: String(testimonialText).trim(),
    isPublished: isPublished === true || isPublished === 'true',
    displayOrder: Number(displayOrder) || 0
  };
  if (req.file) {
    payload.customerImage = await uploadService.uploadSingle(req.file, 'hbs-testimonials');
  }
  const created = await Testimonial.create(payload);
  res.status(201).json(
    new ApiResponse(201, { testimonial: created }, 'Testimonial created successfully')
  );
});

// @route   PUT /api/admin/testimonials/:id
// @desc    Update testimonial (admin)
// @access  Private (Admin)
export const updateTestimonial = asyncHandler(async (req, res, next) => {
  const testimonial = await Testimonial.findById(req.params.id);
  if (!testimonial) {
    return next(new ApiError('Testimonial not found', 404));
  }
  const body = req.body || {};
  if (body.customerName !== undefined) testimonial.customerName = String(body.customerName).trim();
  if (body.name !== undefined) testimonial.customerName = String(body.name).trim();
  if (body.rating !== undefined) testimonial.rating = Number(body.rating) || 5;
  if (body.testimonial !== undefined) testimonial.testimonial = String(body.testimonial).trim();
  if (body.review !== undefined) testimonial.testimonial = String(body.review).trim();
  if (body.isPublished !== undefined) testimonial.isPublished = body.isPublished === true || body.isPublished === 'true';
  if (body.displayOrder !== undefined) testimonial.displayOrder = Number(body.displayOrder) ?? 0;
  if (req.file) {
    testimonial.customerImage = await uploadService.uploadSingle(req.file, 'hbs-testimonials');
  }
  await testimonial.save();
  res.json(
    new ApiResponse(200, { testimonial }, 'Testimonial updated successfully')
  );
});

// @route   DELETE /api/admin/testimonials/:id
// @desc    Delete testimonial (admin)
// @access  Private (Admin)
export const deleteTestimonial = asyncHandler(async (req, res, next) => {
  const testimonial = await Testimonial.findByIdAndDelete(req.params.id);
  if (!testimonial) {
    return next(new ApiError('Testimonial not found', 404));
  }
  res.json(
    new ApiResponse(200, null, 'Testimonial deleted successfully')
  );
});
