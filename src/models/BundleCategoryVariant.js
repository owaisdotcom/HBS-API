import mongoose from 'mongoose';

const bundleCategoryVariantSchema = new mongoose.Schema({
  bundleCategoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BundleCategory',
    required: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  variantId: {
    type: String,
    required: true,
    trim: true
  },
  ruleQuantity: {
    type: Number,
    required: true,
    min: [1, 'Rule quantity must be at least 1']
  },
  ruleDiscountAmount: {
    type: Number,
    required: true,
    min: [0, 'Discount amount cannot be negative'],
    default: 0
  }
}, {
  timestamps: true
});

bundleCategoryVariantSchema.index({ bundleCategoryId: 1 });
bundleCategoryVariantSchema.index({ productId: 1, variantId: 1 }, { unique: true });

export default mongoose.model('BundleCategoryVariant', bundleCategoryVariantSchema);
