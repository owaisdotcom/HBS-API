import mongoose from 'mongoose';
import { normalizeImageStringArray, normalizeSingleImageUrl } from '../utils/imageUrl.js';

const imageArraySchemaType = {
  type: [String],
  default: [],
  set: normalizeImageStringArray
};

const singleImageSchemaType = {
  type: String,
  set: normalizeSingleImageUrl
};

/**
 * Helper to sanitize an item's raw image fields before Mongoose hydrates/casts them.
 * Converts numeric-key objects, stringified JSON, or malformed data into valid arrays/strings.
 */
function sanitizeRawItemImages(item) {
  if (!item || typeof item !== 'object') return;

  const arrayFields = [
    'variantImages',
    'variantR2Images',
    'orderedVariantImages',
    'orderedVariantR2Images'
  ];

  for (const field of arrayFields) {
    if (item[field] !== undefined && item[field] !== null) {
      item[field] = normalizeImageStringArray(item[field]);
    }
  }

  const singleFields = [
    'productImage',
    'productImageR2Url',
    'variantImage',
    'variantImageR2Url',
    'orderedVariantImage',
    'orderedVariantImageR2Url'
  ];

  for (const field of singleFields) {
    if (item[field] !== undefined && item[field] !== null) {
      item[field] = normalizeSingleImageUrl(item[field]);
    }
  }
}

const orderItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    default: null
  },
  preMadeBundleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PreMadeBundle',
    default: null
  },
  productName: String,
  productImage: singleImageSchemaType,
  productImageR2Url: singleImageSchemaType,
  sku: String,
  variantId: String,
  variantName: String,
  variantImage: singleImageSchemaType,
  variantImageR2Url: singleImageSchemaType,
  variantImages: imageArraySchemaType,
  variantR2Images: imageArraySchemaType,
  orderedVariantImage: singleImageSchemaType,
  orderedVariantImageR2Url: singleImageSchemaType,
  orderedVariantImages: imageArraySchemaType,
  orderedVariantR2Images: imageArraySchemaType,
  variantSnapshot: {
    type: Object,
    default: null
  },
  price: Number,
  quantity: Number,
  selectedColor: String,
  selectedSize: String,
  selectedTieElastic: { type: String, enum: ['tie', 'elastic', null], default: null },
  selectedBridalLength: { type: String, default: null },
  bridalLengthPrice: { type: Number, default: 0 },
  subtotal: Number
}, { _id: true });

orderItemSchema.pre('init', function (rawDoc) {
  sanitizeRawItemImages(rawDoc);
});

orderItemSchema.pre('validate', function () {
  sanitizeRawItemImages(this);
});

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Customer Details Snapshot
  customer: {
    name: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true
    },
    phone: {
      type: String,
      required: true
    },
    alternatePhone: String,
    houseNumber: String,
    streetNumber: String,
    nearestLandmark: String,
    completeAddress: {
      type: String,
      required: true
    },
    // keep legacy address for compatibility
    address: String,
    tehsil: String,
    district: String,
    city: String,
    postalCode: String,
    specialInstructions: String
  },

  // Order Items
  items: [orderItemSchema],

  // Pricing
  subtotal: {
    type: Number,
    required: true
  },
  discount: {
    type: Number,
    default: 0
  },
  shipping: {
    type: Number,
    default: 0
  },
  deliveryFee: {
    type: Number,
    default: 0
  },
  tax: {
    type: Number,
    default: 0
  },
  total: {
    type: Number,
    required: true
  },

  // Coupon
  couponCode: String,
  couponDiscount: Number,

  // Payment
  paymentMethod: {
    type: String,
    enum: ['bank_transfer', 'cod', 'card'],
    default: 'bank_transfer'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'verified', 'failed'],
    default: 'pending'
  },
  paymentReceipt: {
    provider: { type: String, enum: ['cloudinary', 'r2'], default: 'r2' },
    key: String,
    objectKey: String,
    url: String,
    imageUrl: String,
    r2Url: String,
    publicId: String,
    uploadedAt: Date,
    verifiedAt: Date,
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    }
  },

  // Order Status
  status: {
    type: String,
    enum: ['received', 'confirmed', 'processing', 'shipped', 'remain_undelivered', 'delivered', 'cancelled'],
    default: 'received'
  },
  statusHistory: [{
    status: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    note: String,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    }
  }],

  // Tracking & Delivery
  trackingNumber: String,
  courier: String,
  estimatedDelivery: mongoose.Schema.Types.Mixed,
  estimatedDeliveryTime: String,
  deliveryOption: String,
  deliveryOptionName: String,

  // Notes
  customerNotes: String,
  adminNotes: String,

  // Timestamps
  confirmedAt: Date,
  shippedAt: Date,
  remainUndeliveredAt: Date,
  deliveredAt: Date,
  cancelledAt: Date,

  // Stock tracking flags (prevent duplicate deductions/restorations)
  stockDeducted: { type: Boolean, default: false }, // set true after createOrder deducts stock
  stockRestored: { type: Boolean, default: false }, // set true after restock on cancel/reject

  // Soft deletion flags
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null }
}, {
  timestamps: true
});

// Normalize raw items on hydration from MongoDB to prevent CastError on legacy/malformed data
orderSchema.pre('init', function (rawDoc) {
  if (rawDoc && Array.isArray(rawDoc.items)) {
    rawDoc.items.forEach(item => {
      sanitizeRawItemImages(item);
    });
  }
});

// Generate orderId before validation (required field)
orderSchema.pre('validate', async function () {
  if (Array.isArray(this.items)) {
    this.items.forEach(item => {
      sanitizeRawItemImages(item);
    });
  }
  if (this.isNew && !this.orderId) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const datePrefix = `${year}${month}${day}`;

    // Get the start and end of today
    const startOfDay = new Date(year, now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfDay = new Date(year, now.getMonth(), now.getDate(), 23, 59, 59);

    // Count orders created today
    const todayOrderCount = await this.constructor.countDocuments({
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    });

    // Generate sequential number for today (starting from 1)
    const sequentialNumber = String(todayOrderCount + 1).padStart(4, '0');
    let candidateId = `HBS-${datePrefix}${sequentialNumber}`;

    // Concurrency guard: verify candidate uniqueness before assigning
    const collision = await this.constructor.exists({ orderId: candidateId });
    if (collision) {
      const randSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      candidateId = `HBS-${datePrefix}${sequentialNumber}-${randSuffix}`;
    }

    this.orderId = candidateId;
  }
});

// Add to status history when status changes
orderSchema.pre('save', async function () {
  if (this.isModified('status') && !this.isNew) {
    const lastHistory = this.statusHistory && this.statusHistory[this.statusHistory.length - 1];
    // Avoid creating duplicate entry if controller already recorded this transition with note/admin
    if (!lastHistory || lastHistory.status !== this.status) {
      this.statusHistory.push({
        status: this.status,
        timestamp: new Date()
      });
    }

    // Update specific timestamp fields
    if (this.status === 'confirmed') this.confirmedAt = new Date();
    if (this.status === 'shipped') this.shippedAt = new Date();
    if (this.status === 'remain_undelivered') this.remainUndeliveredAt = new Date();
    if (this.status === 'delivered') this.deliveredAt = new Date();
    if (this.status === 'cancelled') this.cancelledAt = new Date();
  }
});

// Indexes
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ isDeleted: 1, status: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ 'customer.email': 1 });
orderSchema.index({ createdAt: -1, paymentStatus: 1 });
orderSchema.index({ paymentStatus: 1, status: 1 });

export default mongoose.model('Order', orderSchema);

