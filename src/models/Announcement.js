import mongoose from 'mongoose';

const announcementSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
    trim: true
  },
  icon: {
    type: String,
    default: '🎉'
  },
  link: {
    type: String,
    trim: true
  },
  displayOrder: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  startDate: Date,
  endDate: Date,
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  }
}, {
  timestamps: true
});

// Indexes
announcementSchema.index({ isActive: 1, displayOrder: 1 });
announcementSchema.index({ startDate: 1, endDate: 1 });

// Method to check if announcement is currently active based on dates
announcementSchema.methods.isCurrentlyActive = function() {
  const now = new Date();
  const isActiveStatus = this.isActive;
  const isWithinDateRange = 
    (!this.startDate || this.startDate <= now) &&
    (!this.endDate || this.endDate >= now);
  
  return isActiveStatus && isWithinDateRange;
};

export default mongoose.model('Announcement', announcementSchema);

