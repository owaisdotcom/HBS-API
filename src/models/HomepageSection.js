import mongoose from 'mongoose';

const homepageSectionSchema = new mongoose.Schema({
  sections: [{
    // Section Type
    type: {
      type: String,
      enum: ['category_grid', 'product_slider', 'banner', 'custom'],
      required: true
    },
    title: String,
    subtitle: String,
    
    // Category Section Configuration
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category'
    },
    productSelection: {
      type: String,
      enum: ['manual', 'newest', 'bestselling', 'featured'],
      default: 'newest'
    },
    productIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    }],
    productLimit: {
      type: Number,
      default: 8
    },
    
    // Layout Configuration
    layout: {
      type: String,
      enum: ['grid', 'slider', 'list'],
      default: 'grid'
    },
    columns: {
      desktop: {
        type: Number,
        default: 4
      },
      tablet: {
        type: Number,
        default: 3
      },
      mobile: {
        type: Number,
        default: 2
      }
    },
    
    // Visibility & Order
    displayOrder: {
      type: Number,
      default: 0
    },
    isVisible: {
      type: Boolean,
      default: true
    },
    showViewAllButton: {
      type: Boolean,
      default: true
    },
    viewAllUrl: String,
    
    // Styling
    backgroundColor: String,
    textColor: String,
    showBorder: Boolean,
    
    // Banner Section
    banner: {
      image: String,
      position: {
        type: String,
        enum: ['left', 'right'],
        default: 'left'
      },
      heading: String,
      description: String,
      buttonText: String,
      buttonUrl: String
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
homepageSectionSchema.index({ isActive: 1 });
homepageSectionSchema.index({ 'sections.displayOrder': 1 });
homepageSectionSchema.index({ 'sections.categoryId': 1 });

export default mongoose.model('HomepageSection', homepageSectionSchema);

