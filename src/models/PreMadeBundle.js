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
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative']
  },
  compareAtPrice: Number,
  images: [{
    url: String,
    alt: String,
    isPrimary: { type: Boolean, default: false },
    order: Number
  }],
  displayOrder: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  }
}, {
  timestamps: true
});

preMadeBundleSchema.index({ slug: 1 }, { unique: true });
preMadeBundleSchema.index({ status: 1, displayOrder: 1 });

export default mongoose.model('PreMadeBundle', preMadeBundleSchema);
