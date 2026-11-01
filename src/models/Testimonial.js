import mongoose from 'mongoose';

const testimonialSchema = new mongoose.Schema({
  customerName: {
    type: String,
    required: [true, 'Customer name is required'],
    trim: true
  },
  customerImage: String,
  customerImageR2Url: String,
  r2Url: String,
  rating: {
    type: Number,
    required: [true, 'Rating is required'],
    min: [1, 'Rating must be at least 1'],
    max: [5, 'Rating cannot exceed 5']
  },
  testimonial: {
    type: String,
    required: [true, 'Testimonial text is required']
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  displayOrder: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes
testimonialSchema.index({ isPublished: 1, displayOrder: 1 });

export default mongoose.model('Testimonial', testimonialSchema);

