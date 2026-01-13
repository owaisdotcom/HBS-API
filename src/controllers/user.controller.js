import User from '../models/User.js';
import Order from '../models/Order.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

// @route   GET /api/admin/users
// @desc    Get all users (Admin)
// @access  Private (Admin)
export const getAllUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search, status } = req.query;

  const query = {};

  // Search by name or email
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }

  // Filter by status
  if (status) {
    query.status = status;
  }

  const skip = (page - 1) * limit;

  const users = await User.find(query)
    .select('-password -__v')
    .sort('-createdAt')
    .skip(skip)
    .limit(Number(limit));

  const total = await User.countDocuments(query);

  // Get order count for each user
  const usersWithStats = await Promise.all(
    users.map(async (user) => {
      const orderCount = await Order.countDocuments({ userId: user._id });
      const orders = await Order.find({ userId: user._id });
      const totalSpent = orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);

      return {
        ...user.toObject(),
        orderCount,
        totalSpent
      };
    })
  );

  res.json(
    new ApiResponse(200, {
      users: usersWithStats,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }, 'Users retrieved successfully')
  );
});

// @route   GET /api/admin/users/:id
// @desc    Get single user details (Admin)
// @access  Private (Admin)
export const getUserById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const user = await User.findById(id).select('-password -__v');

  if (!user) {
    return next(new ApiError('User not found', 404));
  }

  // Get user statistics
  const orderCount = await Order.countDocuments({ userId: user._id });
  const orders = await Order.find({ userId: user._id });
  const totalSpent = orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);

  res.json(
    new ApiResponse(200, {
      user: {
        ...user.toObject(),
        orderCount,
        totalSpent
      }
    }, 'User retrieved successfully')
  );
});

// @route   PUT /api/admin/users/:id/block
// @desc    Block/Unblock user (Admin)
// @access  Private (Admin)
export const toggleUserBlock = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { isBlocked } = req.body;

  const user = await User.findById(id);

  if (!user) {
    return next(new ApiError('User not found', 404));
  }

  user.isBlocked = isBlocked;
  user.status = isBlocked ? 'blocked' : 'active';
  await user.save();

  res.json(
    new ApiResponse(200, {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isBlocked: user.isBlocked,
        status: user.status
      }
    }, `User ${isBlocked ? 'blocked' : 'unblocked'} successfully`)
  );
});

// @route   DELETE /api/admin/users/:id
// @desc    Delete user (Admin)
// @access  Private (Admin)
export const deleteUser = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const user = await User.findById(id);

  if (!user) {
    return next(new ApiError('User not found', 404));
  }

  // Check if user has orders
  const orderCount = await Order.countDocuments({ userId: user._id });
  if (orderCount > 0) {
    return next(new ApiError('Cannot delete user with existing orders. Block the user instead.', 400));
  }

  await user.deleteOne();

  res.json(
    new ApiResponse(200, null, 'User deleted successfully')
  );
});



