import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

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
    label: String,
    fullAddress: String,
    city: String,
    postalCode: String,
    isDefault: {
      type: Boolean,
      default: false
    }
  }],
  status: {
    type: String,
    enum: ['active', 'blocked'],
    default: 'active'
  },
  role: {
    type: String,
    default: 'customer'
  },
  lastLoginAt: Date
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

