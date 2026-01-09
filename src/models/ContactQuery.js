import mongoose from 'mongoose';

const contactQuerySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
  },
  phone: {
    type: String,
    trim: true
  },
  subject: {
    type: String,
    trim: true
  },
  message: {
    type: String,
    required: [true, 'Message is required']
  },
  status: {
    type: String,
    enum: ['new', 'in_progress', 'resolved'],
    default: 'new'
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  adminNotes: String,
  resolvedAt: Date
}, {
  timestamps: true
});

// Indexes
contactQuerySchema.index({ status: 1, createdAt: -1 });
contactQuerySchema.index({ email: 1 });

export default mongoose.model('ContactQuery', contactQuerySchema);

