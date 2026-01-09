import Coupon from '../models/Coupon.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

// @route   GET /api/coupons
// @desc    Get all coupons
// @access  Private (Admin)
export const getAllCoupons = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;

  const query = status ? { status } : {};
  const skip = (page - 1) * limit;

  const coupons = await Coupon.find(query)
    .sort('-createdAt')
    .skip(skip)
    .limit(Number(limit))
    .populate('createdBy', 'name username')
    .select('-__v');

  const total = await Coupon.countDocuments(query);

  res.json(
    new ApiResponse(200, {
      coupons,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }, 'Coupons retrieved successfully')
  );
});

// @route   GET /api/coupons/:code/validate
// @desc    Validate coupon code
// @access  Public
export const validateCoupon = asyncHandler(async (req, res, next) => {
  const { code } = req.params;
  const { orderAmount } = req.query;

  const coupon = await Coupon.findOne({ code: code.toUpperCase() });

  if (!coupon) {
    return next(new ApiError('Invalid coupon code', 404));
  }

  if (!coupon.isValid()) {
    return next(new ApiError('Coupon is expired or not available', 400));
  }

  if (orderAmount && orderAmount < coupon.minOrderAmount) {
    return next(new ApiError(`Minimum order amount is PKR ${coupon.minOrderAmount}`, 400));
  }

  let discountAmount = 0;
  if (orderAmount) {
    if (coupon.type === 'percentage') {
      discountAmount = (orderAmount * coupon.value) / 100;
      if (coupon.maxDiscount) {
        discountAmount = Math.min(discountAmount, coupon.maxDiscount);
      }
    } else {
      discountAmount = coupon.value;
    }
  }

  res.json(
    new ApiResponse(200, {
      coupon: {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        minOrderAmount: coupon.minOrderAmount,
        maxDiscount: coupon.maxDiscount,
        discountAmount,
        description: coupon.description
      }
    }, 'Coupon is valid')
  );
});

// @route   POST /api/coupons
// @desc    Create new coupon
// @access  Private (Admin)
export const createCoupon = asyncHandler(async (req, res, next) => {
  const {
    code,
    description,
    type,
    value,
    maxDiscount,
    minOrderAmount,
    usageLimit,
    perUserLimit,
    validFrom,
    validUntil,
    applicableCategories,
    applicableProducts
  } = req.body;

  // Check if code already exists
  const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
  if (existingCoupon) {
    return next(new ApiError('Coupon code already exists', 400));
  }

  const coupon = await Coupon.create({
    code: code.toUpperCase(),
    description,
    type,
    value,
    maxDiscount,
    minOrderAmount: minOrderAmount || 0,
    usageLimit,
    perUserLimit: perUserLimit || 1,
    validFrom,
    validUntil,
    applicableCategories,
    applicableProducts,
    createdBy: req.admin.id
  });

  res.status(201).json(
    new ApiResponse(201, { coupon }, 'Coupon created successfully')
  );
});

// @route   PUT /api/coupons/:id
// @desc    Update coupon
// @access  Private (Admin)
export const updateCoupon = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  let coupon = await Coupon.findById(id);

  if (!coupon) {
    return next(new ApiError('Coupon not found', 404));
  }

  // Don't allow changing code if already used
  if (req.body.code && req.body.code !== coupon.code && coupon.usedCount > 0) {
    return next(new ApiError('Cannot change code of a coupon that has been used', 400));
  }

  if (req.body.code) {
    req.body.code = req.body.code.toUpperCase();
  }

  coupon = await Coupon.findByIdAndUpdate(id, req.body, {
    new: true,
    runValidators: true
  });

  res.json(
    new ApiResponse(200, { coupon }, 'Coupon updated successfully')
  );
});

// @route   DELETE /api/coupons/:id
// @desc    Delete coupon
// @access  Private (Admin)
export const deleteCoupon = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const coupon = await Coupon.findById(id);

  if (!coupon) {
    return next(new ApiError('Coupon not found', 404));
  }

  // Don't allow deletion if already used
  if (coupon.usedCount > 0) {
    return next(new ApiError('Cannot delete a coupon that has been used. Set it to inactive instead.', 400));
  }

  await coupon.deleteOne();

  res.json(
    new ApiResponse(200, null, 'Coupon deleted successfully')
  );
});

// @route   GET /api/coupons/:id
// @desc    Get single coupon
// @access  Private (Admin)
export const getCoupon = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const coupon = await Coupon.findById(id)
    .populate('createdBy', 'name username')
    .populate('applicableCategories', 'name')
    .populate('applicableProducts', 'name');

  if (!coupon) {
    return next(new ApiError('Coupon not found', 404));
  }

  res.json(
    new ApiResponse(200, { coupon }, 'Coupon retrieved successfully')
  );
});

