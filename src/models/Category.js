import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Category name is required'],
    trim: true
  },
  slug: {
    type: String,
    required: [true, 'Slug is required'],
    unique: true,
    lowercase: true
  },
  description: String,
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },
  level: {
    type: Number,
    default: 0
  },
  path: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  }],
  thumbnail: {
    type: String,
    default: null
  },
  coverImage: {
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
  },
  metaTitle: String,
  metaDescription: String,
  
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

// Update path and level before saving
categorySchema.pre('save', async function() {
  if (this.isModified('parentId')) {
    if (this.parentId) {
      const parent = await this.constructor.findOne({ _id: this.parentId, isDeleted: { $ne: true } });
      if (parent) {
        this.level = parent.level + 1;
        this.path = [...parent.path, parent._id];
      }
    } else {
      this.level = 0;
      this.path = [];
    }
  }
});

// Indexes
categorySchema.index({ slug: 1 }, { unique: true, partialFilterExpression: { isDeleted: { $ne: true } } });
categorySchema.index({ parentId: 1 });
categorySchema.index({ path: 1 });
categorySchema.index({ status: 1, displayOrder: 1 });
categorySchema.index({ isDeleted: 1 });

export default mongoose.model('Category', categorySchema);

