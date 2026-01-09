import Review from '../models/Review.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import uploadService from '../services/upload.service.js';

// @route   GET /api/reviews/product/:productId
// @desc    Get reviews for a product
// @access  Public
export const getProductReviews = asyncHandler(async (req, res, next) => {
  const { productId } = req.params;
  const { page = 1, limit = 10, status = 'approved' } = req.query;

  const product = await Product.findById(productId);
  if (!product) {
    return next(new ApiError('Product not found', 404));
  }

  const query = { productId };
  
  // Admin can see all reviews, public only sees approved
  if (!req.admin) {
    query.status = 'approved';
  } else if (status) {
    query.status = status;
  }

  const skip = (page - 1) * limit;

  const reviews = await Review.find(query)
    .sort('-createdAt')
    .skip(skip)
    .limit(Number(limit))
    .populate('userId', 'fullName')
    .select('-__v');

  const total = await Review.countDocuments(query);

  // Calculate rating statistics
  const stats = await Review.aggregate([
    { $match: { productId: product._id, status: 'approved' } },
    {
      $group: {
        _id: '$rating',
        count: { $sum: 1 }
      }
    }
  ]);

  const ratingDistribution = {
    1: 0, 2: 0, 3: 0, 4: 0, 5: 0
  };
  stats.forEach(stat => {
    ratingDistribution[stat._id] = stat.count;
  });

  res.json(
    new ApiResponse(200, {
      reviews,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      stats: {
        averageRating: product.rating,
        totalReviews: product.reviewCount,
        ratingDistribution
      }
    }, 'Reviews retrieved successfully')
  );
});

// @route   POST /api/reviews
// @desc    Create a review
// @access  Private
export const createReview = asyncHandler(async (req, res, next) => {
  const { productId, orderId, rating, title, comment } = req.body;

  // Check if product exists
  const product = await Product.findById(productId);
  if (!product) {
    return next(new ApiError('Product not found', 404));
  }

  // Check if user already reviewed this product
  const existingReview = await Review.findOne({
    productId,
    userId: req.user.id
  });

  if (existingReview) {
    return next(new ApiError('You have already reviewed this product', 400));
  }

  // Check if order exists and belongs to user (for verified purchase)
  let isVerifiedPurchase = false;
  if (orderId) {
    const order = await Order.findOne({
      _id: orderId,
      userId: req.user.id,
      'items.productId': productId,
      status: { $in: ['delivered'] }
    });
    isVerifiedPurchase = !!order;
  }

  // Handle image uploads
  let images = [];
  if (req.files && req.files.length > 0) {
    images = await uploadService.uploadMultiple(req.files, 'hbs-reviews');
  }

  // Create review
  const review = await Review.create({
    productId,
    userId: req.user.id,
    orderId: orderId || null,
    rating,
    title,
    comment,
    images,
    isVerifiedPurchase
  });

  // Update product rating and review count
  await updateProductRating(productId);

  const populatedReview = await Review.findById(review._id)
    .populate('userId', 'fullName');

  res.status(201).json(
    new ApiResponse(201, { review: populatedReview }, 'Review submitted successfully. It will be published after moderation.')
  );
});

// @route   PUT /api/reviews/:id
// @desc    Update review
// @access  Private
export const updateReview = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { rating, title, comment } = req.body;

  let review = await Review.findById(id);

  if (!review) {
    return next(new ApiError('Review not found', 404));
  }

  // Check if user owns the review
  if (review.userId.toString() !== req.user.id) {
    return next(new ApiError('Not authorized to update this review', 403));
  }

  // Update fields
  if (rating) review.rating = rating;
  if (title) review.title = title;
  if (comment) review.comment = comment;

  // Reset status to pending if modified
  review.status = 'pending';

  await review.save();

  // Update product rating
  await updateProductRating(review.productId);

  res.json(
    new ApiResponse(200, { review }, 'Review updated successfully')
  );
});

// @route   DELETE /api/reviews/:id
// @desc    Delete review
// @access  Private
export const deleteReview = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const review = await Review.findById(id);

  if (!review) {
    return next(new ApiError('Review not found', 404));
  }

  // Check if user owns the review or is admin
  if (!req.admin && review.userId.toString() !== req.user?.id) {
    return next(new ApiError('Not authorized to delete this review', 403));
  }

  const productId = review.productId;
  await review.deleteOne();

  // Update product rating
  await updateProductRating(productId);

  res.json(
    new ApiResponse(200, null, 'Review deleted successfully')
  );
});

// @route   PUT /api/reviews/:id/moderate
// @desc    Moderate review (approve/reject)
// @access  Private (Admin)
export const moderateReview = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { status, moderationNote } = req.body;

  const review = await Review.findById(id);

  if (!review) {
    return next(new ApiError('Review not found', 404));
  }

  review.status = status;
  review.moderationNote = moderationNote;
  review.moderatedBy = req.admin.id;
  review.moderatedAt = new Date();

  await review.save();

  // Update product rating if approved
  if (status === 'approved') {
    await updateProductRating(review.productId);
  }

  res.json(
    new ApiResponse(200, { review }, 'Review moderated successfully')
  );
});

// @route   GET /api/reviews/pending
// @desc    Get pending reviews
// @access  Private (Admin)
export const getPendingReviews = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (page - 1) * limit;

  const reviews = await Review.find({ status: 'pending' })
    .sort('-createdAt')
    .skip(skip)
    .limit(Number(limit))
    .populate('userId', 'fullName email')
    .populate('productId', 'name images')
    .select('-__v');

  const total = await Review.countDocuments({ status: 'pending' });

  res.json(
    new ApiResponse(200, {
      reviews,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }, 'Pending reviews retrieved')
  );
});

// Helper function to update product rating
async function updateProductRating(productId) {
  const stats = await Review.aggregate([
    { $match: { productId: productId, status: 'approved' } },
    {
      $group: {
        _id: null,
        averageRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 }
      }
    }
  ]);

  const averageRating = stats[0]?.averageRating || 0;
  const totalReviews = stats[0]?.totalReviews || 0;

  await Product.findByIdAndUpdate(productId, {
    rating: Math.round(averageRating * 10) / 10,
    reviewCount: totalReviews
  });
}

