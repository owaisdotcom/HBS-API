import mongoose from 'mongoose';

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
  items: [{
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
    productImage: String,
    sku: String,
    variantId: String,
    variantSnapshot: {
      type: Object,
      default: null
    },
    price: Number,
    quantity: Number,
    selectedColor: String,
    selectedSize: String,
    subtotal: Number
  }],
  
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
    url: String,
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
  
  // Tracking
  trackingNumber: String,
  courier: String,
  estimatedDelivery: Date,
  
  // Notes
  customerNotes: String,
  adminNotes: String,
  
  // Timestamps
  confirmedAt: Date,
  shippedAt: Date,
  remainUndeliveredAt: Date,
  deliveredAt: Date,
  cancelledAt: Date
}, {
  timestamps: true
});

// Generate orderId before validation (required field)
orderSchema.pre('validate', async function() {
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
    
    this.orderId = `HBS-${datePrefix}${sequentialNumber}`;
  }
});

// Add to status history when status changes
orderSchema.pre('save', async function() {
  if (this.isModified('status') && !this.isNew) {
    this.statusHistory.push({
      status: this.status,
      timestamp: new Date()
    });
    
    // Update specific timestamp fields
    if (this.status === 'confirmed') this.confirmedAt = new Date();
    if (this.status === 'shipped') this.shippedAt = new Date();
    if (this.status === 'remain_undelivered') this.remainUndeliveredAt = new Date();
    if (this.status === 'delivered') this.deliveredAt = new Date();
    if (this.status === 'cancelled') this.cancelledAt = new Date();
  }
});

// Indexes
orderSchema.index({ orderId: 1 }, { unique: true });
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ 'customer.email': 1 });

export default mongoose.model('Order', orderSchema);

