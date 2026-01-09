import ContactQuery from '../models/ContactQuery.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

// @route   POST /api/contact
// @desc    Submit contact query
// @access  Public
export const submitContactQuery = asyncHandler(async (req, res) => {
  const { name, email, phone, subject, message } = req.body;

  const contactQuery = await ContactQuery.create({
    name,
    email,
    phone,
    subject,
    message
  });

  res.status(201).json(
    new ApiResponse(201, { contactQuery }, 'Your message has been sent successfully. We will get back to you soon.')
  );
});

// @route   GET /api/contact
// @desc    Get all contact queries
// @access  Private (Admin)
export const getAllContactQueries = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;

  const query = status ? { status } : {};
  const skip = (page - 1) * limit;

  const queries = await ContactQuery.find(query)
    .sort('-createdAt')
    .skip(skip)
    .limit(Number(limit))
    .populate('assignedTo', 'name username')
    .select('-__v');

  const total = await ContactQuery.countDocuments(query);

  res.json(
    new ApiResponse(200, {
      queries,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }, 'Contact queries retrieved successfully')
  );
});

// @route   GET /api/contact/:id
// @desc    Get single contact query
// @access  Private (Admin)
export const getContactQuery = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const query = await ContactQuery.findById(id)
    .populate('assignedTo', 'name username email');

  if (!query) {
    return next(new ApiError('Contact query not found', 404));
  }

  res.json(
    new ApiResponse(200, { query }, 'Contact query retrieved successfully')
  );
});

// @route   PUT /api/contact/:id
// @desc    Update contact query (assign, add notes, change status)
// @access  Private (Admin)
export const updateContactQuery = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { status, adminNotes, assignedTo } = req.body;

  let query = await ContactQuery.findById(id);

  if (!query) {
    return next(new ApiError('Contact query not found', 404));
  }

  if (status) query.status = status;
  if (adminNotes) query.adminNotes = adminNotes;
  if (assignedTo) query.assignedTo = assignedTo;

  if (status === 'resolved') {
    query.resolvedAt = new Date();
  }

  await query.save();

  res.json(
    new ApiResponse(200, { query }, 'Contact query updated successfully')
  );
});

// @route   DELETE /api/contact/:id
// @desc    Delete contact query
// @access  Private (Admin)
export const deleteContactQuery = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const query = await ContactQuery.findById(id);

  if (!query) {
    return next(new ApiError('Contact query not found', 404));
  }

  await query.deleteOne();

  res.json(
    new ApiResponse(200, null, 'Contact query deleted successfully')
  );
});

