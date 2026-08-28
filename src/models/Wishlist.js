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
    variantId: {
      type: String,
      default: null
    },
    selectedColor: {
      type: String,
      default: null
    },
    selectedSize: {
      type: String,
      default: null
    },
    selectedImage: {
      type: String,
      default: null
    },
    variantSnapshot: {
      type: Object,
      default: null
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

