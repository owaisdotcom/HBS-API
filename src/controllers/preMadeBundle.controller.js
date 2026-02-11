import PreMadeBundle from '../models/PreMadeBundle.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import uploadService from '../services/upload.service.js';

const resolveSlug = (id) => {
  if (id.match(/^[0-9a-fA-F]{24}$/)) {
    return PreMadeBundle.findById(id);
  }
  return PreMadeBundle.findOne({ slug: id });
};

// @route   GET /api/pre-made-bundles
// @desc    List pre-made bundles (public: active only)
// @access  Public
export const listPreMadeBundles = asyncHandler(async (req, res) => {
  const { status = 'active', includeInactive } = req.query;
  const query = includeInactive === 'true' ? {} : { status };
  const bundles = await PreMadeBundle.find(query).sort('displayOrder createdAt');
  res.json(
    new ApiResponse(200, { preMadeBundles: bundles }, 'Pre-made bundles retrieved successfully')
  );
});

// @route   GET /api/pre-made-bundles/:id
// @desc    Get pre-made bundle by id or slug
// @access  Public
export const getPreMadeBundle = asyncHandler(async (req, res, next) => {
  const bundle = await resolveSlug(req.params.id);
  if (!bundle) {
    return next(new ApiError('Pre-made bundle not found', 404));
  }
  res.json(
    new ApiResponse(200, { preMadeBundle: bundle }, 'Pre-made bundle retrieved successfully')
  );
});

// @route   POST /api/pre-made-bundles
// @desc    Create pre-made bundle (admin)
// @access  Private Admin
export const createPreMadeBundle = asyncHandler(async (req, res, next) => {
  const { name, slug, description, shortDescription, price, compareAtPrice, displayOrder, status } = req.body;
  const finalSlug = (slug || name?.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')) || 'pre-made-bundle';
  const existing = await PreMadeBundle.findOne({ slug: finalSlug });
  if (existing) {
    return next(new ApiError('Slug already exists', 400));
  }
  let images = [];
  if (req.files?.length) {
    const urls = await uploadService.uploadMultiple(req.files, 'hbs-pre-made-bundles');
    images = urls.map((url, i) => ({ url, order: i, isPrimary: i === 0 }));
  }
  const bundle = await PreMadeBundle.create({
    name,
    slug: finalSlug,
    description,
    shortDescription,
    price: Number(price),
    compareAtPrice: compareAtPrice != null ? Number(compareAtPrice) : undefined,
    images,
    displayOrder: displayOrder != null ? Number(displayOrder) : 0,
    status: status || 'active'
  });
  res.status(201).json(
    new ApiResponse(201, { preMadeBundle: bundle }, 'Pre-made bundle created successfully')
  );
});

// @route   PUT /api/pre-made-bundles/:id
// @desc    Update pre-made bundle (admin)
// @access  Private Admin
export const updatePreMadeBundle = asyncHandler(async (req, res, next) => {
  const bundle = await resolveSlug(req.params.id);
  if (!bundle) {
    return next(new ApiError('Pre-made bundle not found', 404));
  }
  const { name, slug, description, shortDescription, price, compareAtPrice, displayOrder, status } = req.body;
  if (name !== undefined) bundle.name = name;
  if (slug !== undefined) bundle.slug = slug;
  if (description !== undefined) bundle.description = description;
  if (shortDescription !== undefined) bundle.shortDescription = shortDescription;
  if (price !== undefined) bundle.price = Number(price);
  if (compareAtPrice !== undefined) bundle.compareAtPrice = compareAtPrice == null ? undefined : Number(compareAtPrice);
  if (displayOrder !== undefined) bundle.displayOrder = Number(displayOrder);
  if (status !== undefined) bundle.status = status;
  if (req.files?.length) {
    const urls = await uploadService.uploadMultiple(req.files, 'hbs-pre-made-bundles');
    const newImages = urls.map((url, i) => ({ url, order: (bundle.images?.length || 0) + i, isPrimary: false }));
    bundle.images = [...(bundle.images || []), ...newImages];
  }
  await bundle.save();
  res.json(
    new ApiResponse(200, { preMadeBundle: bundle }, 'Pre-made bundle updated successfully')
  );
});

// @route   DELETE /api/pre-made-bundles/:id
// @desc    Delete pre-made bundle (admin)
// @access  Private Admin
export const deletePreMadeBundle = asyncHandler(async (req, res, next) => {
  const bundle = await resolveSlug(req.params.id);
  if (!bundle) {
    return next(new ApiError('Pre-made bundle not found', 404));
  }
  await PreMadeBundle.deleteOne({ _id: bundle._id });
  res.json(
    new ApiResponse(200, null, 'Pre-made bundle deleted successfully')
  );
});
