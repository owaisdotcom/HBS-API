import Announcement from '../models/Announcement.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';

// @route   GET /api/announcements
// @desc    Get all active announcements (public)
// @access  Public
export const getAnnouncements = asyncHandler(async (req, res) => {
  const now = new Date();
  
  const announcements = await Announcement.find({
    isActive: true,
    $or: [
      { startDate: { $exists: false } },
      { startDate: null },
      { startDate: { $lte: now } }
    ],
    $or: [
      { endDate: { $exists: false } },
      { endDate: null },
      { endDate: { $gte: now } }
    ]
  })
  .sort({ displayOrder: 1, createdAt: -1 })
  .select('-updatedBy -__v');

  res.json(
    new ApiResponse(200, { announcements }, 'Announcements retrieved successfully')
  );
});

// @route   GET /api/admin/announcements
// @desc    Get all announcements (admin)
// @access  Private (Admin)
export const getAllAnnouncements = asyncHandler(async (req, res) => {
  const announcements = await Announcement.find()
    .sort({ displayOrder: 1, createdAt: -1 })
    .populate('updatedBy', 'name email');

  res.json(
    new ApiResponse(200, { announcements }, 'Announcements retrieved successfully')
  );
});

// @route   POST /api/admin/announcements
// @desc    Create new announcement
// @access  Private (Admin)
export const createAnnouncement = asyncHandler(async (req, res, next) => {
  const { text, icon, link, displayOrder, isActive, startDate, endDate } = req.body;

  if (!text) {
    return next(new ApiError('Announcement text is required', 400));
  }

  const announcement = await Announcement.create({
    text,
    icon,
    link,
    displayOrder,
    isActive,
    startDate,
    endDate,
    updatedBy: req.admin.id
  });

  res.status(201).json(
    new ApiResponse(201, { announcement }, 'Announcement created successfully')
  );
});

// @route   PUT /api/admin/announcements/:id
// @desc    Update announcement
// @access  Private (Admin)
export const updateAnnouncement = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const announcement = await Announcement.findById(id);

  if (!announcement) {
    return next(new ApiError('Announcement not found', 404));
  }

  const { text, icon, link, displayOrder, isActive, startDate, endDate } = req.body;

  announcement.text = text ?? announcement.text;
  announcement.icon = icon ?? announcement.icon;
  announcement.link = link ?? announcement.link;
  announcement.displayOrder = displayOrder ?? announcement.displayOrder;
  announcement.isActive = isActive ?? announcement.isActive;
  announcement.startDate = startDate ?? announcement.startDate;
  announcement.endDate = endDate ?? announcement.endDate;
  announcement.updatedBy = req.admin.id;

  await announcement.save();

  res.json(
    new ApiResponse(200, { announcement }, 'Announcement updated successfully')
  );
});

// @route   DELETE /api/admin/announcements/:id
// @desc    Delete announcement
// @access  Private (Admin)
export const deleteAnnouncement = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const announcement = await Announcement.findById(id);

  if (!announcement) {
    return next(new ApiError('Announcement not found', 404));
  }

  await announcement.deleteOne();

  res.json(
    new ApiResponse(200, null, 'Announcement deleted successfully')
  );
});

// @route   PUT /api/admin/announcements/reorder
// @desc    Reorder announcements
// @access  Private (Admin)
export const reorderAnnouncements = asyncHandler(async (req, res, next) => {
  const { announcements } = req.body;

  if (!Array.isArray(announcements)) {
    return next(new ApiError('Announcements must be an array', 400));
  }

  // Update display order for each announcement
  const updatePromises = announcements.map((item, index) =>
    Announcement.findByIdAndUpdate(item.id, { displayOrder: index })
  );

  await Promise.all(updatePromises);

  res.json(
    new ApiResponse(200, null, 'Announcements reordered successfully')
  );
});

