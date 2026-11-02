import Testimonial from '../models/Testimonial.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import uploadService from '../services/upload.service.js';
import { resolveImageUrl, extractImageKey } from '../utils/imageUrl.js';

const normalizeTestimonial = (testimonial) => {
  if (!testimonial) return testimonial;
  const t = typeof testimonial.toObject === 'function' ? testimonial.toObject() : { ...testimonial };
  const raw = t.customerImageR2Url || t.customerImageUrl || t.customerImage || t.r2Url || t.imageUrl;
  if (raw) {
    const url = resolveImageUrl(raw) || raw;
    const key = t.customerImageObjectKey || t.objectKey || extractImageKey(url);
    t.customerImage = url;
    t.customerImageUrl = url;
    t.customerImageR2Url = url;
    t.customerImageObjectKey = key;
    t.imageUrl = url;
    t.r2Url = url;
    t.objectKey = key;
  }
  return t;
};

// @route   GET /api/homepage/testimonials
// @desc    Get published testimonials for homepage
// @access  Public
export const getPublishedTestimonials = asyncHandler(async (req, res) => {
  const testimonials = await Testimonial.find({ isPublished: true })
    .sort({ displayOrder: 1, createdAt: -1 })
    .lean();
  res.json(
    new ApiResponse(200, { testimonials: testimonials.map(normalizeTestimonial) }, 'Testimonials retrieved successfully')
  );
});

// @route   GET /api/admin/testimonials
// @desc    Get all testimonials (admin)
// @access  Private (Admin)
export const getAllTestimonials = asyncHandler(async (req, res) => {
  const testimonials = await Testimonial.find().sort({ displayOrder: 1, createdAt: -1 }).lean();
  res.json(
    new ApiResponse(200, { testimonials: testimonials.map(normalizeTestimonial) }, 'Testimonials retrieved successfully')
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
    new ApiResponse(200, { testimonial: normalizeTestimonial(testimonial) }, 'Testimonial retrieved successfully')
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
    const resImg = await uploadService.uploadSingle(req.file, 'hbs-testimonials');
    const rawImg = typeof resImg === 'string' ? resImg : (resImg?.url || resImg?.r2Url);
    const finalUrl = resolveImageUrl(rawImg) || rawImg;
    const objectKey = typeof resImg === 'object' && (resImg?.objectKey || resImg?.key) ? (resImg.objectKey || resImg.key) : extractImageKey(finalUrl);
    payload.customerImage = finalUrl;
    payload.customerImageUrl = finalUrl;
    payload.customerImageR2Url = finalUrl;
    payload.customerImageObjectKey = objectKey;
    payload.imageUrl = finalUrl;
    payload.r2Url = finalUrl;
    payload.objectKey = objectKey;
  }
  const created = await Testimonial.create(payload);
  res.status(201).json(
    new ApiResponse(201, { testimonial: normalizeTestimonial(created) }, 'Testimonial created successfully')
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
  if (body.review !== undefined) testimonial.review = String(body.review).trim();
  if (body.isPublished !== undefined) testimonial.isPublished = body.isPublished === true || body.isPublished === 'true';
  if (body.displayOrder !== undefined) testimonial.displayOrder = Number(body.displayOrder) ?? 0;
  if (req.file) {
    const resImg = await uploadService.uploadSingle(req.file, 'hbs-testimonials');
    const rawImg = typeof resImg === 'string' ? resImg : (resImg?.url || resImg?.r2Url);
    const finalUrl = resolveImageUrl(rawImg) || rawImg;
    const objectKey = typeof resImg === 'object' && (resImg?.objectKey || resImg?.key) ? (resImg.objectKey || resImg.key) : extractImageKey(finalUrl);
    testimonial.customerImage = finalUrl;
    testimonial.customerImageUrl = finalUrl;
    testimonial.customerImageR2Url = finalUrl;
    testimonial.customerImageObjectKey = objectKey;
    testimonial.imageUrl = finalUrl;
    testimonial.r2Url = finalUrl;
    testimonial.objectKey = objectKey;
  }
  await testimonial.save();
  res.json(
    new ApiResponse(200, { testimonial: normalizeTestimonial(testimonial) }, 'Testimonial updated successfully')
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
