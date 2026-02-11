import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema({
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
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  price: {
    type: Number,
    required: true
  },
  variantId: {
    type: String,
    default: null
  },
  variantSnapshot: {
    type: Object,
    default: null
  },
  selectedColor: {
    type: String
  },
  selectedSize: {
    type: String
  },
  addedAt: {
    type: Date,
    default: Date.now
  },
  reservedUntil: {
    type: Date,
    default: null
  }
});

const cartSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  items: [cartItemSchema],
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Update the updatedAt field on save
cartSchema.pre('save', async function() {
  this.updatedAt = Date.now();
});

// Indexes
cartSchema.index({ userId: 1 }, { unique: true });
cartSchema.index({ 'items.productId': 1 });

// Calculate cart totals
cartSchema.methods.calculateTotals = function() {
  const subtotal = this.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const shipping = subtotal > 5000 ? 0 : 250; // Free shipping over Rs. 5000
  const total = subtotal + shipping;
  
  return {
    subtotal,
    shipping,
    total,
    itemCount: this.items.reduce((sum, item) => sum + item.quantity, 0)
  };
};

export default mongoose.model('Cart', cartSchema);

