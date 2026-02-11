import mongoose from 'mongoose';

const preMadeBundleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Bundle name is required'],
    trim: true
  },
  slug: {
    type: String,
    required: [true, 'Slug is required'],
    unique: true,
    lowercase: true
  },
  description: String,
  shortDescription: String,

  // Pricing (product-like, no variants)
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative']
  },
  originalPrice: Number,
  compareAtPrice: Number, // backward compatibility
  costPrice: Number,

  // Images
  images: [{
    url: String,
    alt: String,
    isPrimary: { type: Boolean, default: false },
    order: Number
  }],

  // Bundle details (product-like, no variants)
  features: [String],
  careInstructions: [String],
  specifications: [{
    key: String,
    value: String
  }],

  // Shipping
  weight: Number,
  dimensions: {
    length: Number,
    width: Number,
    height: Number
  },
  shipping: {
    domestic: String,
    cod: String,
    delivery: String,
    returns: String
  },

  // SEO
  metaTitle: String,
  metaDescription: String,
  tags: [String],

  // Status & display
  status: {
    type: String,
    enum: ['active', 'inactive', 'draft'],
    default: 'active'
  },
  displayOrder: { type: Number, default: 0 },
  isFeatured: { type: Boolean, default: false },
  isNewArrival: { type: Boolean, default: false },

  // Stock (product-like)
  stock: { type: Number, default: 0, min: 0 },

  // Stats
  viewCount: { type: Number, default: 0 },
  soldCount: { type: Number, default: 0 },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  reviewCount: { type: Number, default: 0 },
  publishedAt: Date,

  // Soft delete
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null }
}, {
  timestamps: true
});

preMadeBundleSchema.index({ slug: 1 }, { unique: true, partialFilterExpression: { isDeleted: { $ne: true } } });
preMadeBundleSchema.index({ status: 1, displayOrder: 1 });
preMadeBundleSchema.index({ isFeatured: 1, createdAt: -1 });
preMadeBundleSchema.index({ isNewArrival: 1, createdAt: -1 });
preMadeBundleSchema.index({ tags: 1 });
preMadeBundleSchema.index({ name: 'text', description: 'text', tags: 'text' });
preMadeBundleSchema.index({ isDeleted: 1 });

export default mongoose.model('PreMadeBundle', preMadeBundleSchema);
