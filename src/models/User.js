import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  phone: {
    type: String,
    trim: true
  },
  addresses: [{
    label: {
      type: String,
      default: 'Home'
    },
    fullName: String,
    phone: String,
    alternatePhone: String,
    houseNumber: String,
    streetNumber: String,
    nearestLandmark: String,
    completeAddress: String,
    fullAddress: String,
    tehsil: String,
    district: String,
    city: String,
    province: String,
    country: {
      type: String,
      default: 'Pakistan'
    },
    postalCode: String,
    isDefault: {
      type: Boolean,
      default: false
    }
  }],
  savedCheckoutDetails: {
    name: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    alternatePhone: { type: String, trim: true, default: '' },
    houseNumber: { type: String, trim: true, default: '' },
    streetNumber: { type: String, trim: true, default: '' },
    nearestLandmark: { type: String, trim: true, default: '' },
    completeAddress: { type: String, trim: true, default: '' },
    tehsil: { type: String, trim: true, default: '' },
    district: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    province: { type: String, trim: true, default: '' },
    country: { type: String, default: 'Pakistan' },
    postalCode: { type: String, trim: true, default: '' },
    hasSavedDetails: { type: Boolean, default: false },
    updatedAt: Date
  },
  status: {
    type: String,
    enum: ['active', 'blocked'],
    default: 'active'
  },
  role: {
    type: String,
    default: 'customer'
  },
  lastLoginAt: Date,
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  emailVerificationExpire: Date,
  emailVerificationOTP: String,
  emailVerificationOTPExpire: Date,
  resetPasswordToken: String,
  resetPasswordExpire: Date
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate email verification token
userSchema.methods.generateEmailVerificationToken = function() {
  const verificationToken = crypto.randomBytes(32).toString('hex');
  
  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');
  
  this.emailVerificationExpire = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  
  return verificationToken;
};

// Generate email verification OTP (6-digit)
userSchema.methods.generateEmailVerificationOTP = function() {
  const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
  
  this.emailVerificationOTP = crypto
    .createHash('sha256')
    .update(otp)
    .digest('hex');
  
  this.emailVerificationOTPExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  return otp;
};

// Generate password reset token
userSchema.methods.generatePasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  this.resetPasswordExpire = Date.now() + 60 * 60 * 1000; // 1 hour
  
  return resetToken;
};

// Ensure only one default address
userSchema.pre('save', async function() {
  if (this.addresses && this.addresses.length > 0) {
    const defaultAddresses = this.addresses.filter(addr => addr.isDefault);
    if (defaultAddresses.length > 1) {
      // Keep only the first one as default
      this.addresses.forEach((addr, index) => {
        if (index > 0) addr.isDefault = false;
      });
    }
  }
});

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ status: 1 });
userSchema.index({ createdAt: -1 });

export default mongoose.model('User', userSchema);

