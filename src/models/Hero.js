import mongoose from 'mongoose';

const heroSchema = new mongoose.Schema({
  imageUrl: {
    type: String,
    default: '/hero.png'
  },
  imageUrlR2Url: {
    type: String,
    default: null
  },
  r2Url: {
    type: String,
    default: null
  },
  title: {
    type: String,
    default: 'Modesty that reveals your dignity. Style that feels like you.'
  },
  subtitle: {
    type: String,
    default: 'Curated for you'
  },
  description: {
    type: String,
    default: 'From everyday hijabs to occasion-ready abayas—each piece is chosen for quality, comfort, and versatility. Feel confident and at ease, every day.'
  },
  button: {
    text: { type: String, default: 'Shop Now' },
    link: { type: String, default: '#shop-categories' }
  },
  secondaryButton: {
    text: { type: String, default: 'About Us' },
    link: { type: String, default: '/about' }
  },
  textPosition: {
    type: String,
    enum: ['left', 'center', 'right'],
    default: 'left'
  },
  overlayOpacity: {
    type: Number,
    min: 0,
    max: 100,
    default: 60
  },
  imageFadeIn: {
    type: Boolean,
    default: true
  },
  imageFadeInDuration: {
    type: Number,
    default: 800
  },
  imageFadeInDelay: {
    type: Number,
    default: 0
  },
  imageHoverScale: {
    type: Number,
    min: 1,
    max: 1.5,
    default: 1.05
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

heroSchema.index({ isActive: 1 });

export default mongoose.model('Hero', heroSchema);
