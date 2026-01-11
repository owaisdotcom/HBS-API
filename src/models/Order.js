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
    address: {
      type: String,
      required: true
    },
    city: String,
    postalCode: String
  },
  
  // Order Items
  items: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    productName: String,
    productImage: String,
    sku: String,
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
    enum: ['received', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
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
  deliveredAt: Date,
  cancelledAt: Date
}, {
  timestamps: true
});

// Generate orderId before saving
orderSchema.pre('save', async function() {
  if (this.isNew && !this.orderId) {
    const year = new Date().getFullYear();
    const count = await this.constructor.countDocuments();
    this.orderId = `HBS-${year}-${String(count + 1).padStart(4, '0')}`;
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

