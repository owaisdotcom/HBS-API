import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  
  // Review Content
  rating: {
    type: Number,
    required: [true, 'Rating is required'],
    min: [1, 'Rating must be at least 1'],
    max: [5, 'Rating cannot exceed 5']
  },
  title: {
    type: String,
    trim: true
  },
  comment: {
    type: String,
    required: [true, 'Review comment is required']
  },
  
  // Media
  images: [String],
  r2Images: [String],
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  isVerifiedPurchase: {
    type: Boolean,
    default: false
  },
  
  // Engagement
  helpfulCount: {
    type: Number,
    default: 0
  },
  reportCount: {
    type: Number,
    default: 0
  },
  
  // Admin Moderation
  moderatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  moderatedAt: Date,
  moderationNote: String
}, {
  timestamps: true
});

// Indexes
reviewSchema.index({ productId: 1, status: 1, createdAt: -1 });
reviewSchema.index({ userId: 1 });
reviewSchema.index({ orderId: 1 });
reviewSchema.index({ status: 1 });

export default mongoose.model('Review', reviewSchema);

