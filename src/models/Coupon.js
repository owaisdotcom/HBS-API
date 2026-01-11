import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: [true, 'Coupon code is required'],
    unique: true,
    uppercase: true,
    trim: true
  },
  description: String,
  
  // Discount Type
  type: {
    type: String,
    enum: ['percentage', 'fixed'],
    required: true
  },
  value: {
    type: Number,
    required: [true, 'Discount value is required'],
    min: [0, 'Value cannot be negative']
  },
  maxDiscount: Number, // For percentage type
  
  // Conditions
  minOrderAmount: {
    type: Number,
    default: 0
  },
  applicableCategories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  }],
  applicableProducts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  
  // Usage Limits
  usageLimit: {
    type: Number,
    required: true
  },
  usedCount: {
    type: Number,
    default: 0
  },
  perUserLimit: {
    type: Number,
    default: 1
  },
  
  // Validity
  validFrom: {
    type: Date,
    required: true
  },
  validUntil: {
    type: Date,
    required: true
  },
  
  // Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'expired'],
    default: 'active'
  },
  
  // Tracking
  usedBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order'
    },
    usedAt: Date,
    discountAmount: Number
  }],
  
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  }
}, {
  timestamps: true
});

// Check if coupon is expired
couponSchema.methods.isExpired = function() {
  return new Date() > this.validUntil;
};

// Check if coupon is valid
couponSchema.methods.isValid = function() {
  const now = new Date();
  return this.status === 'active' && 
         now >= this.validFrom && 
         now <= this.validUntil &&
         this.usedCount < this.usageLimit;
};

// Update status based on expiry
couponSchema.pre('save', async function() {
  if (this.isExpired()) {
    this.status = 'expired';
  }
});

// Indexes
couponSchema.index({ code: 1 }, { unique: true });
couponSchema.index({ status: 1, validFrom: 1, validUntil: 1 });
couponSchema.index({ validUntil: 1 });

export default mongoose.model('Coupon', couponSchema);

