import PreMadeBundle from '../models/PreMadeBundle.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import uploadService from '../services/upload.service.js';
import { generateR2Url, resolveImageUrl } from '../utils/imageUrl.js';

const resolveSlug = (id) => {
  if (id.match(/^[0-9a-fA-F]{24}$/)) {
    return PreMadeBundle.findOne({ _id: id, isDeleted: { $ne: true } });
  }
  return PreMadeBundle.findOne({ slug: id, isDeleted: { $ne: true } });
};

// @route   GET /api/pre-made-bundles
// @desc    List pre-made bundles (public: active only by default)
// @access  Public
export const listPreMadeBundles = asyncHandler(async (req, res) => {
  const { status = 'active', includeInactive } = req.query;
  const query = { isDeleted: { $ne: true } };
  if (includeInactive !== 'true') query.status = status;
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

const parseBody = (body) => {
  const out = { ...body };
  if (typeof out.features === 'string') {
    try { out.features = JSON.parse(out.features); } catch { out.features = []; }
  }
  if (typeof out.careInstructions === 'string') {
    try { out.careInstructions = JSON.parse(out.careInstructions); } catch { out.careInstructions = []; }
  }
  if (typeof out.tags === 'string') {
    try { out.tags = JSON.parse(out.tags); } catch { out.tags = (out.tags || '').split(',').map(t => t.trim()).filter(Boolean); }
  }
  if (typeof out.specifications === 'string') {
    try { out.specifications = JSON.parse(out.specifications); } catch { out.specifications = []; }
  }
  if (typeof out.dimensions === 'string') {
    try { out.dimensions = JSON.parse(out.dimensions); } catch { out.dimensions = {}; }
  }
  if (typeof out.shipping === 'string') {
    try { out.shipping = JSON.parse(out.shipping); } catch { out.shipping = {}; }
  }
  if (typeof out.existingImages === 'string') {
    try { out.existingImages = JSON.parse(out.existingImages); } catch { out.existingImages = []; }
  }
  return out;
};

// @route   POST /api/pre-made-bundles
// @desc    Create pre-made bundle (admin)
// @access  Private Admin
export const createPreMadeBundle = asyncHandler(async (req, res, next) => {
  const raw = req.body;
  const body = typeof raw.name === 'string' && raw.variants === undefined ? raw : (raw.data ? (typeof raw.data === 'string' ? JSON.parse(raw.data) : raw.data) : raw);
  const parsed = parseBody(body);

  const name = parsed.name?.trim();
  const slug = (parsed.slug || name?.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')) || 'pre-made-bundle';
  const existing = await PreMadeBundle.findOne({ slug, isDeleted: { $ne: true } });
  if (existing) return next(new ApiError('Slug already exists', 400));

  let images = [];
  if (req.files?.length) {
    const uploadResults = await uploadService.uploadMultiple(req.files, 'hbs-pre-made-bundles');
    images = uploadResults.map((item, i) => {
      const rawUrl = typeof item === 'string' ? item : item.url;
      const url = resolveImageUrl(rawUrl) || rawUrl;
      const r2Url = typeof item === 'object' && item.r2Url ? (resolveImageUrl(item.r2Url) || item.r2Url) : url;
      const provider = typeof item === 'object' && item.provider ? item.provider : 'r2';
      const key = typeof item === 'object' ? item.key : undefined;
      return { provider, key, url, r2Url, order: i, isPrimary: i === 0 };
    });
  }

  const payload = {
    name,
    slug,
    description: parsed.description,
    shortDescription: parsed.shortDescription,
    price: Number(parsed.price) || 0,
    originalPrice: parsed.originalPrice != null ? Number(parsed.originalPrice) : undefined,
    compareAtPrice: parsed.compareAtPrice != null ? Number(parsed.compareAtPrice) : undefined,
    costPrice: parsed.costPrice != null ? Number(parsed.costPrice) : undefined,
    images,
    displayOrder: Number(parsed.displayOrder) || 0,
    status: parsed.status || 'active',
    isFeatured: parsed.isFeatured === true || parsed.featured === 'true',
    isNewArrival: parsed.isNewArrival === true || parsed.newArrival === 'true',
    isOnSale: parsed.isOnSale === true || parsed.onSale === 'true',
    features: Array.isArray(parsed.features) ? parsed.features : [],
    careInstructions: Array.isArray(parsed.careInstructions) ? parsed.careInstructions : [],
    specifications: Array.isArray(parsed.specifications) ? parsed.specifications : [],
    weight: parsed.weight != null ? Number(parsed.weight) : undefined,
    dimensions: parsed.dimensions && typeof parsed.dimensions === 'object' ? parsed.dimensions : undefined,
    shipping: parsed.shipping && typeof parsed.shipping === 'object' ? parsed.shipping : undefined,
    metaTitle: parsed.metaTitle,
    metaDescription: parsed.metaDescription,
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    stock: parsed.stock != null ? Number(parsed.stock) : 0,
    publishedAt: new Date()
  };

  const bundle = await PreMadeBundle.create(payload);
  res.status(201).json(
    new ApiResponse(201, { preMadeBundle: bundle }, 'Pre-made bundle created successfully')
  );
});

// @route   PUT /api/pre-made-bundles/:id
// @desc    Update pre-made bundle (admin)
// @access  Private Admin
export const updatePreMadeBundle = asyncHandler(async (req, res, next) => {
  const bundle = await PreMadeBundle.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
  if (!bundle) return next(new ApiError('Pre-made bundle not found', 404));

  const raw = req.body;
  const body = typeof raw.name === 'string' && raw.variants === undefined ? raw : (raw.data ? (typeof raw.data === 'string' ? JSON.parse(raw.data) : raw.data) : raw);
  const parsed = parseBody(body);

  if (parsed.name !== undefined) bundle.name = parsed.name.trim();
  if (parsed.slug !== undefined) bundle.slug = parsed.slug;
  if (parsed.description !== undefined) bundle.description = parsed.description;
  if (parsed.shortDescription !== undefined) bundle.shortDescription = parsed.shortDescription;
  if (parsed.price !== undefined) bundle.price = Number(parsed.price);
  if (parsed.originalPrice !== undefined) bundle.originalPrice = parsed.originalPrice == null ? undefined : Number(parsed.originalPrice);
  if (parsed.compareAtPrice !== undefined) bundle.compareAtPrice = parsed.compareAtPrice == null ? undefined : Number(parsed.compareAtPrice);
  if (parsed.costPrice !== undefined) bundle.costPrice = parsed.costPrice == null ? undefined : Number(parsed.costPrice);
  if (parsed.displayOrder !== undefined) bundle.displayOrder = Number(parsed.displayOrder);
  if (parsed.status !== undefined) bundle.status = parsed.status;
  if (parsed.isFeatured !== undefined) bundle.isFeatured = parsed.isFeatured === true || parsed.isFeatured === 'true';
  if (parsed.isNewArrival !== undefined) bundle.isNewArrival = parsed.isNewArrival === true || parsed.isNewArrival === 'true';
  if (parsed.isOnSale !== undefined || parsed.onSale !== undefined) {
    bundle.isOnSale = parsed.isOnSale === true || parsed.isOnSale === 'true' || parsed.onSale === true || parsed.onSale === 'true';
  }
  if (parsed.features !== undefined) bundle.features = Array.isArray(parsed.features) ? parsed.features : [];
  if (parsed.careInstructions !== undefined) bundle.careInstructions = Array.isArray(parsed.careInstructions) ? parsed.careInstructions : [];
  if (parsed.specifications !== undefined) bundle.specifications = Array.isArray(parsed.specifications) ? parsed.specifications : [];
  if (parsed.weight !== undefined) bundle.weight = parsed.weight == null ? undefined : Number(parsed.weight);
  if (parsed.dimensions !== undefined) bundle.dimensions = parsed.dimensions && typeof parsed.dimensions === 'object' ? parsed.dimensions : undefined;
  if (parsed.shipping !== undefined) bundle.shipping = parsed.shipping && typeof parsed.shipping === 'object' ? parsed.shipping : undefined;
  if (parsed.metaTitle !== undefined) bundle.metaTitle = parsed.metaTitle;
  if (parsed.metaDescription !== undefined) bundle.metaDescription = parsed.metaDescription;
  if (parsed.tags !== undefined) bundle.tags = Array.isArray(parsed.tags) ? parsed.tags : [];
  if (parsed.stock !== undefined) bundle.stock = Math.max(0, Number(parsed.stock) || 0);

  // Images: existingImages (JSON array with url, order) + new uploads
  if (parsed.existingImages !== undefined && Array.isArray(parsed.existingImages)) {
    bundle.images = parsed.existingImages.map((img, i) => {
      const rawUrl = typeof img === 'string' ? img : img.url;
      const url = resolveImageUrl(rawUrl) || rawUrl;
      const r2Url = typeof img === 'object' && img.r2Url ? (resolveImageUrl(img.r2Url) || img.r2Url) : url;
      const provider = typeof img === 'object' && img.provider ? img.provider : 'r2';
      const key = typeof img === 'object' ? img.key : undefined;
      return {
        provider,
        key,
        url,
        r2Url,
        alt: typeof img === 'object' ? img.alt : undefined,
        isPrimary: i === 0,
        order: i
      };
    });
  }
  if (req.files?.length) {
    const uploadResults = await uploadService.uploadMultiple(req.files, 'hbs-pre-made-bundles');
    const startOrder = (bundle.images || []).length;
    uploadResults.forEach((item, i) => {
      const rawUrl = typeof item === 'string' ? item : item.url;
      const url = resolveImageUrl(rawUrl) || rawUrl;
      const r2Url = typeof item === 'object' && item.r2Url ? (resolveImageUrl(item.r2Url) || item.r2Url) : url;
      const provider = typeof item === 'object' && item.provider ? item.provider : 'r2';
      const key = typeof item === 'object' ? item.key : undefined;
      bundle.images.push({ provider, key, url, r2Url, order: startOrder + i, isPrimary: bundle.images.length === 0 && i === 0 });
    });
  }

  await bundle.save();
  res.json(
    new ApiResponse(200, { preMadeBundle: bundle }, 'Pre-made bundle updated successfully')
  );
});

// @route   DELETE /api/pre-made-bundles/:id
// @desc    Delete pre-made bundle (admin) - soft delete
// @access  Private Admin
export const deletePreMadeBundle = asyncHandler(async (req, res, next) => {
  const bundle = await PreMadeBundle.findOne({ _id: req.params.id });
  if (!bundle) return next(new ApiError('Pre-made bundle not found', 404));
  bundle.isDeleted = true;
  bundle.deletedAt = new Date();
  await bundle.save();
  res.json(
    new ApiResponse(200, null, 'Pre-made bundle deleted successfully')
  );
});
