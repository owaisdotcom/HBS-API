import mongoose from 'mongoose';

const rateLimitSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  count: {
    type: Number,
    required: true,
    default: 1
  },
  expiresAt: {
    type: Date,
    required: true
  }
}, {
  timestamps: true
});

// TTL index to automatically purge expired records in MongoDB background thread
rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('RateLimit', rateLimitSchema);
