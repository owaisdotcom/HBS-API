import mongoose from 'mongoose';

const heroSliderSchema = new mongoose.Schema({
  slides: [{
    // Image - support both simple URL and responsive images
    imageUrl: String, // Simple single URL (primary)
    imageUrlR2Url: String,
    r2Url: String,
    image: {
      desktop: String,
      desktopR2Url: String,
      tablet: String,
      tabletR2Url: String,
      mobile: String,
      mobileR2Url: String,
      alt: String
    },
    
    // Text Overlay - support both naming conventions
    title: String, // Primary heading
    heading: String, // Alternative field name
    subtitle: String, // Subheading
    subheading: String, // Alternative field name
    description: String,
    
    // Text Positioning & Styling
    textPosition: {
      type: String,
      enum: ['left', 'center', 'right'],
      default: 'center'
    },
    textColor: {
      type: String,
      default: '#FFFFFF'
    },
    textShadow: {
      type: Boolean,
      default: true
    },
    
    // Call-to-Action Buttons - support both single button (legacy) and multiple buttons
    button: {
      text: String,
      link: String, // Primary field
      url: String, // Alternative field name
      style: {
        type: String,
        enum: ['primary', 'secondary', 'outline'],
        default: 'primary'
      },
      isVisible: {
        type: Boolean,
        default: true
      }
    },
    buttons: [{
      text: String,
      link: String,
      url: String,
      style: {
        type: String,
        enum: ['primary', 'secondary', 'outline'],
        default: 'primary'
      },
      isVisible: {
        type: Boolean,
        default: true
      }
    }],
    
    // Display Settings
    displayOrder: {
      type: Number,
      default: 0
    },
    isActive: {
      type: Boolean,
      default: true
    },
    
    // Scheduling
    startDate: Date,
    endDate: Date,
    
    // Background Settings
    backgroundColor: String,
    overlayColor: String,
    overlayOpacity: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    }
  }],
  
  // Slider Settings
  autoPlay: {
    type: Boolean,
    default: true
  },
  autoPlaySpeed: {
    type: Number,
    default: 5000
  },
  transitionSpeed: {
    type: Number,
    default: 800
  },
  showArrows: {
    type: Boolean,
    default: true
  },
  showDots: {
    type: Boolean,
    default: true
  },
  loop: {
    type: Boolean,
    default: true
  },
  
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
heroSliderSchema.index({ isActive: 1 });
heroSliderSchema.index({ 'slides.displayOrder': 1 });

export default mongoose.model('HeroSlider', heroSliderSchema);

