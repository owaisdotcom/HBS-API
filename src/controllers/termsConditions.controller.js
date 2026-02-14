import TermsConditions from '../models/TermsConditions.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';

// @route   GET /api/terms-conditions
// @desc    Get terms and conditions (public)
// @access  Public
export const getTermsConditions = asyncHandler(async (req, res) => {
  const doc = await TermsConditions.getDocument();
  const publicData = {
    title: doc.title,
    introText: doc.introText,
    lastUpdated: doc.lastUpdated,
    acceptanceText: doc.acceptanceText,
    sections: (doc.sections || [])
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(({ heading, content, style }) => ({ heading, content, style }))
  };

  res.json(
    new ApiResponse(200, { termsConditions: publicData }, 'Terms and conditions retrieved successfully')
  );
});

// @route   GET /api/admin/terms-conditions
// @desc    Get terms and conditions for admin (full data)
// @access  Private (Admin)
export const getTermsConditionsAdmin = asyncHandler(async (req, res) => {
  const doc = await TermsConditions.getDocument();

  res.json(
    new ApiResponse(200, { termsConditions: doc }, 'Terms and conditions retrieved successfully')
  );
});

// @route   PUT /api/admin/terms-conditions
// @desc    Update terms and conditions
// @access  Private (Admin)
export const updateTermsConditions = asyncHandler(async (req, res) => {
  const { title, introText, lastUpdated, sections, acceptanceText } = req.body;

  const doc = await TermsConditions.getDocument();

  if (title !== undefined) doc.title = title;
  if (introText !== undefined) doc.introText = introText;
  if (acceptanceText !== undefined) doc.acceptanceText = acceptanceText;
  if (lastUpdated !== undefined) doc.lastUpdated = lastUpdated || new Date();
  doc.updatedBy = req.admin.id;

  if (Array.isArray(sections)) {
    doc.sections = sections.map((s, i) => ({
      heading: s.heading || '',
      content: s.content || '',
      order: s.order ?? i,
      style: s.style || 'default',
      _id: s._id
    }));
  }

  await doc.save();

  res.json(
    new ApiResponse(200, { termsConditions: doc }, 'Terms and conditions updated successfully')
  );
});
