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
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: [true, 'Category is required']
  },
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
  publishedAt: Date
}, {
  timestamps: true
});

// Update stock status based on stock quantity
productSchema.pre('save', function(next) {
  if (this.stock === 0) {
    this.stockStatus = 'out_of_stock';
  } else if (this.stock <= this.lowStockThreshold) {
    this.stockStatus = 'low_stock';
  } else {
    this.stockStatus = 'in_stock';
  }
  next();
});

// Indexes
productSchema.index({ slug: 1 }, { unique: true });
productSchema.index({ sku: 1 }, { unique: true, sparse: true });
productSchema.index({ categoryId: 1 });
productSchema.index({ categoryPath: 1 });
productSchema.index({ status: 1 });
productSchema.index({ price: 1 });
productSchema.index({ isFeatured: 1, createdAt: -1 });
productSchema.index({ isNewArrival: 1, createdAt: -1 });
productSchema.index({ tags: 1 });
productSchema.index({ name: 'text', description: 'text', tags: 'text' });

export default mongoose.model('Product', productSchema);

