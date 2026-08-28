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
  selectedImage: {
    type: String,
    default: null
  },
  selectedTieElastic: {
    type: String,
    enum: ['tie', 'elastic', null],
    default: null
  },
  selectedBridalLength: {
    type: String,
    default: null
  },
  bridalLengthPrice: {
    type: Number,
    default: 0
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
cartSchema.index({ 'items.productId': 1, 'items.reservedUntil': 1 });

// Calculate cart totals
cartSchema.methods.calculateTotals = function() {
  const subtotal = this.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const shipping = this.items.length > 0 ? 300 : 0;
  const total = subtotal + shipping;
  
  return {
    subtotal,
    shipping,
    total,
    itemCount: this.items.reduce((sum, item) => sum + item.quantity, 0)
  };
};

export default mongoose.model('Cart', cartSchema);

