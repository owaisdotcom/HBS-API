import mongoose from 'mongoose';
import BundleCategory from '../models/BundleCategory.js';
import BundleCategoryVariant from '../models/BundleCategoryVariant.js';
import Product from '../models/Product.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import uploadService from '../services/upload.service.js';
import { generateR2Url, resolveImageUrl } from '../utils/imageUrl.js';

const resolveBundleCategory = async (id) => {
  if (id.match(/^[0-9a-fA-F]{24}$/)) {
    return BundleCategory.findOne({ _id: id });
  }
  return BundleCategory.findOne({ slug: id });
};

// @route   GET /api/bundle-categories/rule
// @desc    Get bundle rule for a product variant (for product page / cart UI)
// @access  Public
export const getBundleRuleForVariant = asyncHandler(async (req, res) => {
  const { productId, variantId } = req.query;
  if (!productId || variantId == null || String(variantId).trim() === '') {
    return res.json(new ApiResponse(200, { rule: null }, 'No rule'));
  }
  const pid = mongoose.Types.ObjectId.isValid(productId) ? new mongoose.Types.ObjectId(productId) : productId;
  const bcv = await BundleCategoryVariant.findOne({ productId: pid, variantId: String(variantId).trim() })
    .populate('bundleCategoryId', 'name slug');
  if (!bcv) {
    return res.json(new ApiResponse(200, { rule: null }, 'No rule'));
  }
  res.json(
    new ApiResponse(200, {
      rule: {
        ruleQuantity: bcv.ruleQuantity,
        ruleDiscountAmount: bcv.ruleDiscountAmount ?? 0,
        bundleCategoryName: bcv.bundleCategoryId?.name,
        bundleCategorySlug: bcv.bundleCategoryId?.slug
      }
    }, 'Rule retrieved successfully')
  );
});

// @route   GET /api/bundle-categories
// @desc    List bundle categories (public: active only; admin can pass includeInactive)
// @access  Public / Admin
export const listBundleCategories = asyncHandler(async (req, res) => {
  const { status = 'active', includeInactive } = req.query;
  const query = includeInactive === 'true' ? {} : { status };
  const categories = await BundleCategory.find(query).sort('displayOrder createdAt');
  res.json(
    new ApiResponse(200, { bundleCategories: categories }, 'Bundle categories retrieved successfully')
  );
});

// @route   GET /api/bundle-categories/:id
// @desc    Get bundle category by id or slug
// @access  Public
export const getBundleCategory = asyncHandler(async (req, res, next) => {
  const category = await resolveBundleCategory(req.params.id);
  if (!category) {
    return next(new ApiError('Bundle category not found', 404));
  }
  res.json(
    new ApiResponse(200, { bundleCategory: category }, 'Bundle category retrieved successfully')
  );
});

// @route   POST /api/bundle-categories
// @desc    Create bundle category (admin)
// @access  Private Admin
export const createBundleCategory = asyncHandler(async (req, res, next) => {
  const { name, slug, description, displayOrder, status } = req.body;
  const existing = await BundleCategory.findOne({ slug: slug || name?.toLowerCase().replace(/\s+/g, '-') });
  if (existing) {
    return next(new ApiError('Slug already exists', 400));
  }
  let thumbnail = null;
  let thumbnailR2Url = null;
  let coverImage = null;
  let coverImageR2Url = null;
  if (req.files) {
    if (req.files.thumbnail?.[0]) {
      const resThumb = await uploadService.uploadSingle(req.files.thumbnail[0], 'hbs-bundle-categories');
      const rawThumb = typeof resThumb === 'string' ? resThumb : resThumb?.url;
      thumbnail = resolveImageUrl(rawThumb) || rawThumb;
      thumbnailR2Url = typeof resThumb === 'object' && resThumb?.r2Url ? (resolveImageUrl(resThumb.r2Url) || resThumb.r2Url) : thumbnail;
    }
    if (req.files.coverImage?.[0]) {
      const resCover = await uploadService.uploadSingle(req.files.coverImage[0], 'hbs-bundle-categories');
      const rawCover = typeof resCover === 'string' ? resCover : resCover?.url;
      coverImage = resolveImageUrl(rawCover) || rawCover;
      coverImageR2Url = typeof resCover === 'object' && resCover?.r2Url ? (resolveImageUrl(resCover.r2Url) || resCover.r2Url) : coverImage;
    }
  }
  const finalSlug = (slug || name?.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')) || 'bundle-category';
  const category = await BundleCategory.create({
    name,
    slug: finalSlug,
    description,
    thumbnail,
    thumbnailR2Url,
    coverImage,
    coverImageR2Url,
    displayOrder: displayOrder != null ? Number(displayOrder) : 0,
    status: status || 'active'
  });
  res.status(201).json(
    new ApiResponse(201, { bundleCategory: category }, 'Bundle category created successfully')
  );
});

// @route   PUT /api/bundle-categories/:id
// @desc    Update bundle category (admin)
// @access  Private Admin
export const updateBundleCategory = asyncHandler(async (req, res, next) => {
  const category = await resolveBundleCategory(req.params.id);
  if (!category) {
    return next(new ApiError('Bundle category not found', 404));
  }
  if (req.files?.thumbnail?.[0]) {
    const resThumb = await uploadService.uploadSingle(req.files.thumbnail[0], 'hbs-bundle-categories');
    const rawThumb = typeof resThumb === 'string' ? resThumb : resThumb?.url;
    category.thumbnail = resolveImageUrl(rawThumb) || rawThumb;
    category.thumbnailR2Url = typeof resThumb === 'object' && resThumb?.r2Url ? (resolveImageUrl(resThumb.r2Url) || resThumb.r2Url) : category.thumbnail;
  }
  if (req.files?.coverImage?.[0]) {
    const resCover = await uploadService.uploadSingle(req.files.coverImage[0], 'hbs-bundle-categories');
    const rawCover = typeof resCover === 'string' ? resCover : resCover?.url;
    category.coverImage = resolveImageUrl(rawCover) || rawCover;
    category.coverImageR2Url = typeof resCover === 'object' && resCover?.r2Url ? (resolveImageUrl(resCover.r2Url) || resCover.r2Url) : category.coverImage;
  }
  const { name, slug, description, displayOrder, status } = req.body;
  if (name !== undefined) category.name = name;
  if (slug !== undefined) category.slug = slug;
  if (description !== undefined) category.description = description;
  if (displayOrder !== undefined) category.displayOrder = Number(displayOrder);
  if (status !== undefined) category.status = status;
  await category.save();
  res.json(
    new ApiResponse(200, { bundleCategory: category }, 'Bundle category updated successfully')
  );
});

// @route   DELETE /api/bundle-categories/:id
// @desc    Delete bundle category (admin)
// @access  Private Admin
export const deleteBundleCategory = asyncHandler(async (req, res, next) => {
  const category = await resolveBundleCategory(req.params.id);
  if (!category) {
    return next(new ApiError('Bundle category not found', 404));
  }
  await BundleCategoryVariant.deleteMany({ bundleCategoryId: category._id });
  await BundleCategory.deleteOne({ _id: category._id });
  res.json(
    new ApiResponse(200, null, 'Bundle category deleted successfully')
  );
});

// @route   GET /api/bundle-categories/:id/variants
// @desc    List variants in a bundle category (with product + variant details)
// @access  Public (for user bundle category page) / Admin
export const listBundleCategoryVariants = asyncHandler(async (req, res, next) => {
  const cat = await resolveBundleCategory(req.params.id);
  if (!cat) {
    return next(new ApiError('Bundle category not found', 404));
  }
  const bcvList = await BundleCategoryVariant.find({ bundleCategoryId: cat._id })
    .populate('productId', 'name slug images variants');
  const variants = [];
  for (const bcv of bcvList) {
    const product = bcv.productId;
    if (!product) continue;
    let colorVariant = null;
    let sizeObj = null;
    for (const v of product.variants || []) {
      const s = (v.sizes || []).find(sz => `${v.colorId}-${sz.sizeId}` === bcv.variantId);
      if (s) {
        colorVariant = v;
        sizeObj = s;
        break;
      }
    }
    variants.push({
      _id: bcv._id,
      bundleCategoryId: bcv.bundleCategoryId,
      productId: bcv.productId._id,
      productName: product.name,
      productSlug: product.slug,
      variantId: bcv.variantId,
      color: colorVariant?.color,
      size: sizeObj?.size,
      ruleQuantity: bcv.ruleQuantity,
      ruleDiscountAmount: bcv.ruleDiscountAmount ?? 0,
      variantPrice: sizeObj?.price,
      image: (colorVariant?.images?.[0]?.url) || (product.images?.[0]?.url)
    });
  }
  res.json(
    new ApiResponse(200, { variants, bundleCategory: cat }, 'Variants retrieved successfully')
  );
});

// @route   POST /api/bundle-categories/:id/variants
// @desc    Add variant to bundle category (admin). Enforce one rule per variant globally.
// @access  Private Admin
export const addBundleCategoryVariant = asyncHandler(async (req, res, next) => {
  const cat = await resolveBundleCategory(req.params.id);
  if (!cat) {
    return next(new ApiError('Bundle category not found', 404));
  }
  const { productId, variantId, ruleQuantity, ruleDiscountAmount } = req.body;
  if (!productId || !variantId) {
    return next(new ApiError('productId and variantId are required', 400));
  }
  const existing = await BundleCategoryVariant.findOne({ productId, variantId });
  if (existing) {
    return next(new ApiError('This variant already has a bundle rule (one rule per variant)', 400));
  }
  const product = await Product.findOne({ _id: productId, isDeleted: { $ne: true } });
  if (!product) {
    return next(new ApiError('Product not found', 404));
  }
  let colorV = null;
  let sizeV = null;
  for (const v of product.variants || []) {
    const found = (v.sizes || []).find(s => `${v.colorId}-${s.sizeId}` === variantId);
    if (found) {
      colorV = v;
      sizeV = found;
      break;
    }
  }
  if (!colorV || !sizeV) {
    return next(new ApiError('Variant not found in product', 404));
  }
  const qty = Math.max(1, parseInt(ruleQuantity, 10) || 1);
  const amount = Math.max(0, parseFloat(ruleDiscountAmount) || 0);
  const bcv = await BundleCategoryVariant.create({
    bundleCategoryId: cat._id,
    productId,
    variantId,
    ruleQuantity: qty,
    ruleDiscountAmount: amount
  });
  res.status(201).json(
    new ApiResponse(201, { variant: bcv }, 'Variant added successfully')
  );
});

// @route   PUT /api/bundle-categories/:id/variants/:bvId
// @desc    Update variant rule (admin). bvId = BundleCategoryVariant _id
// @access  Private Admin
export const updateBundleCategoryVariant = asyncHandler(async (req, res, next) => {
  const { id, bvId } = req.params;
  const cat = await resolveBundleCategory(id);
  if (!cat) {
    return next(new ApiError('Bundle category not found', 404));
  }
  const bcv = await BundleCategoryVariant.findOne({
    _id: bvId,
    bundleCategoryId: cat._id
  });
  if (!bcv) {
    return next(new ApiError('Variant not found in this bundle category', 404));
  }
  const { ruleQuantity, ruleDiscountAmount } = req.body;
  if (ruleQuantity !== undefined) bcv.ruleQuantity = Math.max(1, parseInt(ruleQuantity, 10) || 1);
  if (ruleDiscountAmount !== undefined) bcv.ruleDiscountAmount = Math.max(0, parseFloat(ruleDiscountAmount) || 0);
  await bcv.save();
  res.json(
    new ApiResponse(200, { variant: bcv }, 'Variant rule updated successfully')
  );
});

// @route   DELETE /api/bundle-categories/:id/variants/:bvId
// @desc    Remove variant from bundle category (admin)
// @access  Private Admin
export const removeBundleCategoryVariant = asyncHandler(async (req, res, next) => {
  const { id, bvId } = req.params;
  const cat = await resolveBundleCategory(id);
  if (!cat) {
    return next(new ApiError('Bundle category not found', 404));
  }
  const result = await BundleCategoryVariant.deleteOne({
    _id: bvId,
    bundleCategoryId: cat._id
  });
  if (result.deletedCount === 0) {
    return next(new ApiError('Variant not found in this bundle category', 404));
  }
  res.json(
    new ApiResponse(200, null, 'Variant removed successfully')
  );
});
