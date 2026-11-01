import mongoose from 'mongoose';

const bundleCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Bundle category name is required'],
    trim: true
  },
  slug: {
    type: String,
    required: [true, 'Slug is required'],
    unique: true,
    lowercase: true
  },
  description: String,
  thumbnail: {
    type: String,
    default: null
  },
  thumbnailR2Url: {
    type: String,
    default: null
  },
  coverImage: {
    type: String,
    default: null
  },
  coverImageR2Url: {
    type: String,
    default: null
  },
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

bundleCategorySchema.index({ slug: 1 }, { unique: true });
bundleCategorySchema.index({ status: 1, displayOrder: 1 });

export default mongoose.model('BundleCategory', bundleCategorySchema);
