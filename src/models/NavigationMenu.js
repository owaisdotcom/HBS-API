import mongoose from 'mongoose';

const navigationMenuSchema = new mongoose.Schema({
  position: {
    type: String,
    enum: ['header', 'footer'],
    default: 'header'
  },
  menuItems: [{
    // Menu Item Type: 'custom' for manual links, 'category' for category-based
    itemType: {
      type: String,
      enum: ['custom', 'category'],
      required: true,
      default: 'custom'
    },
    
    // For Custom Items
    label: {
      type: String,
      required: function() {
        return this.itemType === 'custom';
      }
    },
    link: {
      type: String,
      required: function() {
        return this.itemType === 'custom' && !this.categoryId;
      }
    },
    
    // For Category-Based Items
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: function() {
        return this.itemType === 'category';
      }
    },
    
    // Children/Submenu Items (can be custom or category-based)
    children: [{
      itemType: {
        type: String,
        enum: ['custom', 'category'],
        default: 'custom'
      },
      label: String,
      link: String,
      categoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category'
      },
      // Third level - Sub-submenu
      children: [{
        itemType: {
          type: String,
          enum: ['custom', 'category'],
          default: 'custom'
        },
        label: String,
        link: String,
        categoryId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Category'
        }
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
    openInNewTab: {
      type: Boolean,
      default: false
    },
    
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

