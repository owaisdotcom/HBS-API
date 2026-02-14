import mongoose from 'mongoose';

const termsSectionSchema = new mongoose.Schema({
  heading: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true,
    default: ''
  },
  order: {
    type: Number,
    default: 0
  },
  style: {
    type: String,
    enum: ['default', 'highlight', 'warning', 'contact'],
    default: 'default'
  }
}, { _id: true });

const termsConditionsSchema = new mongoose.Schema({
  title: {
    type: String,
    default: 'Terms & Conditions',
    trim: true
  },
  introText: {
    type: String,
    default: '',
    trim: true
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  sections: [termsSectionSchema],
  acceptanceText: {
    type: String,
    default: '',
    trim: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  }
}, {
  timestamps: true
});

// Use a singleton pattern - only one document
termsConditionsSchema.statics.getDocument = async function () {
  let doc = await this.findOne();
  if (!doc) {
    doc = await this.create({});
  }
  return doc;
};

export default mongoose.model('TermsConditions', termsConditionsSchema);
