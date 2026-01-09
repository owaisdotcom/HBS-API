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
      select: 'name slug price originalPrice images stock status'
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
// @desc    Add product to wishlist
// @access  Private
export const addToWishlist = asyncHandler(async (req, res, next) => {
  const { productId } = req.body;

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

  // Check if product already in wishlist
  const existingItem = wishlist.items.find(
    item => item.productId.toString() === productId
  );

  if (existingItem) {
    return next(new ApiError('Product already in wishlist', 400));
  }

  wishlist.items.push({
    productId,
    addedAt: new Date()
  });

  await wishlist.save();

  wishlist = await Wishlist.findById(wishlist._id)
    .populate({
      path: 'items.productId',
      select: 'name slug price originalPrice images stock status'
    });

  res.status(201).json(
    new ApiResponse(201, { 
      wishlist,
      count: wishlist.items.length
    }, 'Product added to wishlist')
  );
});

// @route   DELETE /api/wishlist/remove/:productId
// @desc    Remove product from wishlist
// @access  Private
export const removeFromWishlist = asyncHandler(async (req, res, next) => {
  const { productId } = req.params;

  const wishlist = await Wishlist.findOne({ userId: req.user.id });

  if (!wishlist) {
    return next(new ApiError('Wishlist not found', 404));
  }

  const itemIndex = wishlist.items.findIndex(
    item => item.productId.toString() === productId
  );

  if (itemIndex === -1) {
    return next(new ApiError('Product not in wishlist', 404));
  }

  wishlist.items.splice(itemIndex, 1);
  await wishlist.save();

  await wishlist.populate({
    path: 'items.productId',
    select: 'name slug price originalPrice images stock status'
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

  const wishlist = await Wishlist.findOne({ userId: req.user.id });

  const isInWishlist = wishlist?.items.some(
    item => item.productId.toString() === productId
  ) || false;

  res.json(
    new ApiResponse(200, { isInWishlist }, 'Wishlist checked')
  );
});

