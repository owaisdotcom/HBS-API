import mongoose from 'mongoose';

const guestVerificationSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true
  },
  otpHash: {
    type: String,
    required: true
  },
  otpExpire: {
    type: Date,
    required: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: {
    type: String,
    default: null,
    index: true
  },
  verificationTokenExpire: {
    type: Date,
    default: null
  },
  attempts: {
    type: Number,
    default: 0
  },
  lastSentAt: {
    type: Date,
    default: Date.now
  },
  isUsed: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// TTL index to automatically remove records after 1 hour
guestVerificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 });
guestVerificationSchema.index({ email: 1, isVerified: 1, isUsed: 1 });

export default mongoose.model('GuestVerification', guestVerificationSchema);
