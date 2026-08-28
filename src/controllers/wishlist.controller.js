import Wishlist from '../models/Wishlist.js';
import Product from '../models/Product.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

// @route   GET /api/wishlist
// @desc    Get user's wishlist
// @access  Private
export const getWishlist = asyncHandler(async (req, res) => {
  let wishlist = await Wishlist.findOne({ userId: req.user.id })
    .populate({
      path: 'items.productId',
      select: 'name slug price originalPrice images colors sizes variants status'
    });

  if (!wishlist) {
    wishlist = await Wishlist.create({
      userId: req.user.id,
      items: []
    });
  }

  // Filter out products that no longer exist or are inactive
  wishlist.items = wishlist.items.filter(item => 
    item.productId && item.productId.status === 'active'
  );

  res.json(
    new ApiResponse(200, { 
      wishlist,
      count: wishlist.items.length
    }, 'Wishlist retrieved successfully')
  );
});

// @route   POST /api/wishlist/add
// @desc    Add product variant to wishlist
// @access  Private
export const addToWishlist = asyncHandler(async (req, res, next) => {
  const { productId, selectedColor, selectedSize, variantId, selectedImage, variantSnapshot } = req.body;

  // Check if product exists
  const product = await Product.findById(productId);
  if (!product) {
    return next(new ApiError('Product not found', 404));
  }

  let wishlist = await Wishlist.findOne({ userId: req.user.id });

  if (!wishlist) {
    wishlist = await Wishlist.create({
      userId: req.user.id,
      items: []
    });
  }

  // Find color variant if available
  let matchedColorVariant = null;
  if (Array.isArray(product.variants)) {
    matchedColorVariant = product.variants.find(v => 
      (selectedColor && (v.color === selectedColor || v.colorId === selectedColor)) ||
      (variantId && (v.colorId === variantId || v.color === variantId || v.sizes?.some(s => `${v.colorId}-${s.sizeId}` === variantId)))
    );
  }

  const variantImgUrl = selectedImage
    || matchedColorVariant?.images?.find(i => i.isPrimary)?.url
    || matchedColorVariant?.images?.[0]?.url
    || product.images?.find(i => i.isPrimary)?.url
    || product.images?.[0]?.url
    || null;

  // Check if item already in wishlist (by product + variant/color)
  const existingItem = wishlist.items.find(item => {
    const isSameProduct = item.productId.toString() === productId;
    if (!isSameProduct) return false;
    if (variantId || selectedColor) {
      const sameVariantId = variantId ? item.variantId === variantId : true;
      const sameColor = selectedColor ? item.selectedColor === selectedColor : true;
      return sameVariantId && sameColor;
    }
    return true;
  });

  if (existingItem) {
    return next(new ApiError('Product variant already in wishlist', 400));
  }

  const isOutOfStock = product.stock <= 0 || product.stockStatus === 'out_of_stock';
  wishlist.items.push({
    productId,
    variantId: variantId || null,
    selectedColor: selectedColor || matchedColorVariant?.color || null,
    selectedSize: selectedSize || null,
    selectedImage: variantImgUrl,
    variantSnapshot: variantSnapshot || (matchedColorVariant ? {
      image: variantImgUrl,
      color: matchedColorVariant.color,
      specs: matchedColorVariant.specs
    } : null),
    addedAt: new Date(),
    notifyOnRestock: isOutOfStock
  });

  await wishlist.save();

  wishlist = await Wishlist.findById(wishlist._id)
    .populate({
      path: 'items.productId',
      select: 'name slug price originalPrice images colors sizes variants status'
    });

  res.status(201).json(
    new ApiResponse(201, { 
      wishlist,
      count: wishlist.items.length
    }, 'Product added to wishlist')
  );
});

// @route   DELETE /api/wishlist/remove/:productId
// @desc    Remove product/variant from wishlist
// @access  Private
export const removeFromWishlist = asyncHandler(async (req, res, next) => {
  const { productId } = req.params;
  const { variantId, selectedColor } = req.query;

  const wishlist = await Wishlist.findOne({ userId: req.user.id });

  if (!wishlist) {
    return next(new ApiError('Wishlist not found', 404));
  }

  const itemIndex = wishlist.items.findIndex(item => {
    if (item._id.toString() === productId) return true;
    const isSameProduct = item.productId.toString() === productId;
    if (!isSameProduct) return false;
    if (variantId) return item.variantId === variantId;
    if (selectedColor) return item.selectedColor === selectedColor;
    return true;
  });

  if (itemIndex === -1) {
    return next(new ApiError('Product not in wishlist', 404));
  }

  wishlist.items.splice(itemIndex, 1);
  await wishlist.save();

  await wishlist.populate({
    path: 'items.productId',
    select: 'name slug price originalPrice images colors sizes variants status'
  });

  res.json(
    new ApiResponse(200, { 
      wishlist,
      count: wishlist.items.length
    }, 'Product removed from wishlist')
  );
});

// @route   DELETE /api/wishlist/clear
// @desc    Clear entire wishlist
// @access  Private
export const clearWishlist = asyncHandler(async (req, res, next) => {
  const wishlist = await Wishlist.findOne({ userId: req.user.id });

  if (!wishlist) {
    return next(new ApiError('Wishlist not found', 404));
  }

  wishlist.items = [];
  await wishlist.save();

  res.json(
    new ApiResponse(200, { wishlist }, 'Wishlist cleared successfully')
  );
});

// @route   GET /api/wishlist/check/:productId
// @desc    Check if product is in wishlist
// @access  Private
export const checkWishlist = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { variantId, selectedColor } = req.query;

  const wishlist = await Wishlist.findOne({ userId: req.user.id });

  const isInWishlist = wishlist?.items.some(item => {
    const isSameProduct = item.productId.toString() === productId;
    if (!isSameProduct) return false;
    if (variantId) return item.variantId === variantId;
    if (selectedColor) return item.selectedColor === selectedColor;
    return true;
  }) || false;

  res.json(
    new ApiResponse(200, { isInWishlist }, 'Wishlist checked')
  );
});

