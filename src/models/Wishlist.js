import mongoose from 'mongoose';

const wishlistSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  items: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    },
    notifyOnDiscount: {
      type: Boolean,
      default: false
    },
    notifyOnRestock: {
      type: Boolean,
      default: false
    }
  }]
}, {
  timestamps: true
});

// Indexes
wishlistSchema.index({ userId: 1 }, { unique: true });
wishlistSchema.index({ 'items.productId': 1 });

export default mongoose.model('Wishlist', wishlistSchema);

