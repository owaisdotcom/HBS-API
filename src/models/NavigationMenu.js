import mongoose from 'mongoose';

const navigationMenuSchema = new mongoose.Schema({
  position: {
    type: String,
    enum: ['header', 'footer'],
    required: true
  },
  menuItems: [{
    type: {
      type: String,
      enum: ['category', 'link', 'megamenu'],
      required: true
    },
    label: {
      type: String,
      required: true
    },
    url: String,
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category'
    },
    icon: String,
    
    // Mega Menu Configuration
    hasMegaMenu: {
      type: Boolean,
      default: false
    },
    megaMenuColumns: [{
      title: String,
      items: [{
        label: String,
        url: String,
        categoryId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Category'
        },
        isNew: Boolean,
        isHot: Boolean
      }]
    }],
    
    // Display Settings
    displayOrder: {
      type: Number,
      default: 0
    },
    isVisible: {
      type: Boolean,
      default: true
    },
    openInNewTab: Boolean,
    cssClass: String,
    
    // Mobile Settings
    showOnMobile: {
      type: Boolean,
      default: true
    }
  }],
  
  isActive: {
    type: Boolean,
    default: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  }
}, {
  timestamps: true
});

// Indexes
navigationMenuSchema.index({ position: 1, isActive: 1 });
navigationMenuSchema.index({ 'menuItems.displayOrder': 1 });

export default mongoose.model('NavigationMenu', navigationMenuSchema);

