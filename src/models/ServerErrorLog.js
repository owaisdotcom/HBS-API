import mongoose from 'mongoose';

const serverErrorLogSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  method: {
    type: String,
    required: true,
    uppercase: true
  },
  endpoint: {
    type: String,
    required: true
  },
  statusCode: {
    type: Number,
    required: true,
    index: true
  },
  errorCategory: {
    type: String,
    enum: ['5xx Server Error', '4xx Client Error'],
    required: true,
    index: true
  },
  errorMessage: {
    type: String,
    required: true
  },
  stackTrace: {
    type: String,
    default: ''
  },
  requestId: {
    type: String,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null
  },
  severity: {
    type: String,
    enum: ['critical', 'error', 'warning'],
    default: 'error',
    index: true
  },
  queryParams: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  requestBody: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  ipAddress: {
    type: String,
    default: ''
  },
  userAgent: {
    type: String,
    default: ''
  },
  environment: {
    type: String,
    default: () => process.env.NODE_ENV || 'production'
  },
  isResolved: {
    type: Boolean,
    default: false,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    // Automatic cleanup: Delete logs after 30 days (30 * 24 * 60 * 60 seconds)
    expires: 2592000
  }
}, {
  timestamps: false
});

// Compound Indexes for fast dashboard query filtering
serverErrorLogSchema.index({ timestamp: -1, errorCategory: 1 });
serverErrorLogSchema.index({ timestamp: -1, statusCode: 1 });

export default mongoose.model('ServerErrorLog', serverErrorLogSchema);
