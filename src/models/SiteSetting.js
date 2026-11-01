import mongoose from 'mongoose';

const siteSettingSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true
  },
  
  // General Settings
  siteName: String,
  siteTagline: String,
  logo: String,
  logoR2Url: String,
  favicon: String,
  faviconR2Url: String,
  
  // Contact Information
  contactEmail: String,
  contactPhone: String,
  whatsappNumber: String,
  address: String,
  
  // Social Media Links
  socialMedia: {
    facebook: String,
    instagram: String,
    tiktok: String,
    daraz: String,
    youtube: String
  },
  
  // News Ticker
  newsTicker: {
    isEnabled: {
      type: Boolean,
      default: true
    },
    items: [{
      text: String,
      icon: String,
      displayOrder: Number
    }]
  },
  
  // SEO Settings
  seo: {
    metaTitle: String,
    metaDescription: String,
    metaKeywords: [String],
    ogImage: String,
    ogImageR2Url: String
  },
  
  // Shipping Settings
  shipping: {
    freeShippingThreshold: Number,
    standardShippingCost: Number,
    expressShippingCost: Number,
    codAvailableCities: [String]
  },
  
  // Email Settings
  email: {
    fromEmail: String,
    fromName: String,
    orderConfirmationEnabled: {
      type: Boolean,
      default: true
    },
    orderStatusUpdateEnabled: {
      type: Boolean,
      default: true
    }
  },
  
  // Instagram Integration
  instagramReels: [{
    embedCode: String,
    displayOrder: Number,
    isVisible: {
      type: Boolean,
      default: true
    }
  }],
  
  // Footer Settings
  footer: {
    copyrightText: String,
    showSocialLinks: {
      type: Boolean,
      default: true
    },
    showPaymentMethods: Boolean,
    paymentMethodImages: [String],
    paymentMethodR2Images: [String]
  },
  
  // Maintenance Mode
  maintenanceMode: {
    isEnabled: {
      type: Boolean,
      default: false
    },
    message: String,
    allowedIPs: [String]
  },

  // Homepage content blocks: The Art of Hijab & Niqab, Elegance in Modesty
  contentBlocks: {
    hijabNiqab: {
      title: String,
      paragraphs: [String],
      image: String,
      imageR2Url: String,
      primaryButtonText: String,
      primaryButtonUrl: String,
      secondaryButtonText: String,
      secondaryButtonUrl: String
    },
    elegance: {
      title: String,
      paragraphs: [String],
      image: String,
      imageR2Url: String,
      primaryButtonText: String,
      primaryButtonUrl: String,
      secondaryButtonText: String,
      secondaryButtonUrl: String
    }
  },
  
  // Marketing Banner Popup
  marketingBanner: {
    isEnabled: {
      type: Boolean,
      default: false
    },
    image: String,
    imageR2Url: String,
    title: String,
    subtitle: String,
    buttonText: String,
    buttonUrl: String,
    backgroundColor: {
      type: String,
      default: '#ffffff'
    }
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
siteSettingSchema.index({ key: 1 }, { unique: true });
siteSettingSchema.index({ isActive: 1 });

export default mongoose.model('SiteSetting', siteSettingSchema);

