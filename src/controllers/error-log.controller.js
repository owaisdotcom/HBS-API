import ServerErrorLog from '../models/ServerErrorLog.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';

/**
 * @desc    Get paginated server & client error logs with search and filtering
 * @route   GET /api/admin/error-logs
 * @access  Private/Admin
 */
export const getErrorLogs = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const skip = (page - 1) * limit;

  const { search, statusCode, category, severity, isResolved, dateRange } = req.query;

  // Build filter query
  const query = {};

  if (search) {
    query.$or = [
      { endpoint: { $regex: search, $options: 'i' } },
      { errorMessage: { $regex: search, $options: 'i' } },
      { requestId: { $regex: search, $options: 'i' } }
    ];
  }

  if (category && category !== 'all') {
    if (category === '5xx' || category === '5xx Server Error') {
      query.statusCode = { $gte: 500, $lt: 600 };
    } else if (category === '4xx' || category === '4xx Client Error') {
      query.statusCode = { $gte: 400, $lt: 500 };
    }
  }

  if (statusCode && statusCode !== 'all') {
    if (statusCode === '5xx') {
      query.statusCode = { $gte: 500, $lt: 600 };
    } else if (statusCode === '4xx') {
      query.statusCode = { $gte: 400, $lt: 500 };
    } else {
      query.statusCode = parseInt(statusCode, 10);
    }
  }

  if (severity && severity !== 'all') {
    query.severity = severity;
  }

  if (isResolved !== undefined && isResolved !== '' && isResolved !== 'all') {
    query.isResolved = isResolved === 'true';
  }

  if (dateRange && dateRange !== 'all') {
    const now = new Date();
    let startDate = new Date();
    if (dateRange === '24h') {
      startDate.setHours(now.getHours() - 24);
    } else if (dateRange === '7d') {
      startDate.setDate(now.getDate() - 7);
    } else if (dateRange === '30d') {
      startDate.setDate(now.getDate() - 30);
    }
    query.timestamp = { $gte: startDate };
  }

  // Execute logs query & count
  const [logs, total] = await Promise.all([
    ServerErrorLog.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'name email')
      .populate('adminId', 'name email')
      .lean(),
    ServerErrorLog.countDocuments(query)
  ]);

  // Compute overall summary statistics for admin header cards
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [totalLogs, todayLogs, count5xx, count4xx] = await Promise.all([
    ServerErrorLog.countDocuments({}),
    ServerErrorLog.countDocuments({ timestamp: { $gte: startOfToday } }),
    ServerErrorLog.countDocuments({ statusCode: { $gte: 500 } }),
    ServerErrorLog.countDocuments({ statusCode: { $gte: 400, $lt: 500 } })
  ]);

  res.json({
    success: true,
    data: logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1
    },
    stats: {
      totalLogs,
      todayLogs,
      count5xx,
      count4xx
    }
  });
});

/**
 * @desc    Get single error log by ID
 * @route   GET /api/admin/error-logs/:id
 * @access  Private/Admin
 */
export const getErrorLogById = asyncHandler(async (req, res) => {
  const log = await ServerErrorLog.findById(req.params.id)
    .populate('userId', 'name email')
    .populate('adminId', 'name email');

  if (!log) {
    throw new ApiError('Error log not found', 404);
  }

  res.json({
    success: true,
    data: log
  });
});

/**
 * @desc    Toggle resolution status of error log
 * @route   PATCH /api/admin/error-logs/:id/resolve
 * @access  Private/Admin
 */
export const toggleResolveErrorLog = asyncHandler(async (req, res) => {
  const log = await ServerErrorLog.findById(req.params.id);

  if (!log) {
    throw new ApiError('Error log not found', 404);
  }

  log.isResolved = !log.isResolved;
  await log.save();

  res.json({
    success: true,
    message: `Log marked as ${log.isResolved ? 'resolved' : 'unresolved'}`,
    data: log
  });
});

/**
 * @desc    Delete single error log
 * @route   DELETE /api/admin/error-logs/:id
 * @access  Private/Admin
 */
export const deleteErrorLog = asyncHandler(async (req, res) => {
  const log = await ServerErrorLog.findById(req.params.id);

  if (!log) {
    throw new ApiError('Error log not found', 404);
  }

  await log.deleteOne();

  res.json({
    success: true,
    message: 'Error log deleted successfully'
  });
});

/**
 * @desc    Bulk clear error logs
 * @route   DELETE /api/admin/error-logs
 * @access  Private/Admin
 */
export const clearErrorLogs = asyncHandler(async (req, res) => {
  const { filter } = req.query;
  const query = {};

  if (filter === 'resolved') {
    query.isResolved = true;
  } else if (filter === 'older-7d') {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    query.timestamp = { $lt: cutoff };
  } else if (filter === '4xx') {
    query.statusCode = { $gte: 400, $lt: 500 };
  }

  const result = await ServerErrorLog.deleteMany(query);

  res.json({
    success: true,
    message: `Cleared ${result.deletedCount} error log entries`,
    deletedCount: result.deletedCount
  });
});
