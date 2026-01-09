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
  image: String,
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
  metaDescription: String
}, {
  timestamps: true
});

// Update path and level before saving
categorySchema.pre('save', async function(next) {
  if (this.isModified('parentId')) {
    if (this.parentId) {
      const parent = await this.constructor.findById(this.parentId);
      if (parent) {
        this.level = parent.level + 1;
        this.path = [...parent.path, parent._id];
      }
    } else {
      this.level = 0;
      this.path = [];
    }
  }
  next();
});

// Indexes
categorySchema.index({ slug: 1 }, { unique: true });
categorySchema.index({ parentId: 1 });
categorySchema.index({ path: 1 });
categorySchema.index({ status: 1, displayOrder: 1 });

export default mongoose.model('Category', categorySchema);

