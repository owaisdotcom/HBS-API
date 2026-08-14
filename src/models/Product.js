import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
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
  // Support multiple categories per product
  categories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  }],
  categoryPath: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  }],
  
  // Pricing
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative']
  },
  originalPrice: Number,
  costPrice: Number,
  
  // Images
  images: [{
    url: String,
    publicId: String,
    alt: String,
    isPrimary: {
      type: Boolean,
      default: false
    },
    order: Number
  }],
  
  // Variants
  colors: [String],
  sizes: [String],

  // New: Hierarchical variant support - Color with multiple sizes
  variants: [{
    colorId: { type: String, required: true, index: true }, // Unique ID for this color variant
    color: { type: String, required: true }, // Color name
    images: [{
      url: String,
      publicId: String,
      alt: String,
      isPrimary: { type: Boolean, default: false },
      order: Number
    }],
    specs: { type: Object, default: {} }, // Shared specs for this color
    sizes: [{ // Multiple sizes per color, each with its own price
      sizeId: { type: String, required: true }, // Unique ID for this size within the color
      size: { type: String, required: true }, // Size name
      sku: { type: String, sparse: true },
      price: { type: Number, required: true, min: [0, 'Price cannot be negative'] },
      originalPrice: Number,
      costPrice: Number,
      discount: { type: Number, min: [0, 'Discount cannot be negative'], default: 0 }, // Fixed Rs discount off this variant
      stock: {
        type: Number,
        min: [0, 'Stock cannot be negative'],
        default: 0
      },
      stockStatus: {
        type: String,
        enum: ['in_stock', 'out_of_stock', 'low_stock'],
        default: 'in_stock'
      },
        // Customizations
        hasTieElastic: { type: Boolean, default: false },
        tieStock: { type: Number, min: [0, 'Tie stock cannot be negative'], default: 0 },
        elasticStock: { type: Number, min: [0, 'Elastic stock cannot be negative'], default: 0 },
        hasBridalLength: { type: Boolean, default: false },
        bridalLengthPrice: { type: Number, min: [0, 'Bridal length price cannot be negative'], default: 0 },
        bridalStock: { type: Number, min: [0, 'Bridal stock cannot be negative'], default: 0 },
        // Optional per-size size chart image URL
        sizeChartUrl: { type: String },
      weight: Number,
      isActive: { type: Boolean, default: true }
    }],
    isActive: { type: Boolean, default: true }
  }],
  
  // Inventory
  stock: {
    type: Number,
    required: [true, 'Stock quantity is required'],
    min: [0, 'Stock cannot be negative'],
    default: 0
  },
  sku: {
    type: String,
    unique: true,
    sparse: true
  },
  stockStatus: {
    type: String,
    enum: ['in_stock', 'out_of_stock', 'low_stock'],
    default: 'in_stock'
  },
  lowStockThreshold: {
    type: Number,
    default: 10
  },
  
  // Product Details
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
  
  // Stats & Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'draft'],
    default: 'active'
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  isNewArrival: {
    type: Boolean,
    default: false
  },
  isOnSale: {
    type: Boolean,
    default: false
  },
  viewCount: {
    type: Number,
    default: 0
  },
  soldCount: {
    type: Number,
    default: 0
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  reviewCount: {
    type: Number,
    default: 0
  },
  publishedAt: Date,
  
  // Soft delete fields
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Update stock status based on stock quantity
productSchema.pre('save', async function() {
  if (this.stock === 0) {
    this.stockStatus = 'out_of_stock';
  } else if (this.stock <= this.lowStockThreshold) {
    this.stockStatus = 'low_stock';
  } else {
    this.stockStatus = 'in_stock';
  }
});

// Indexes
productSchema.index({ slug: 1 }, { unique: true, partialFilterExpression: { isDeleted: { $ne: true } } });
productSchema.index({ sku: 1 }, { unique: true, sparse: true, partialFilterExpression: { isDeleted: { $ne: true } } });
productSchema.index({ categories: 1 });
productSchema.index({ categoryPath: 1 });
productSchema.index({ status: 1 });
productSchema.index({ price: 1 });
productSchema.index({ isFeatured: 1, createdAt: -1 });
productSchema.index({ isNewArrival: 1, createdAt: -1 });
productSchema.index({ tags: 1 });
productSchema.index({ name: 'text', description: 'text', tags: 'text' });
productSchema.index({ isDeleted: 1 });
// Indexes for variants
productSchema.index({ 'variants.colorId': 1 }, { sparse: true });
productSchema.index({ 'variants.color': 1 }, { sparse: true });
productSchema.index({ 'variants.sizes.sizeId': 1 }, { sparse: true });
productSchema.index({ 'variants.sizes.sku': 1 }, { sparse: true });

export default mongoose.model('Product', productSchema);

