import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Coupon from '../models/Coupon.js';
import User from '../models/User.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import uploadService from '../services/upload.service.js';

const recomputeProductStock = async (productId) => {
  const product = await Product.findById(productId, 'variants');
  if (!product) return;
  const totalStock = (product.variants || []).reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
  await Product.updateOne({ _id: productId }, { $set: { stock: totalStock } });
};

// @route   POST /api/orders
// @desc    Create new order
// @access  Public/Private
export const createOrder = asyncHandler(async (req, res, next) => {
  const {
    customer,
    items,
    couponCode,
    paymentMethod,
    customerNotes
  } = req.body;

  if (!req.file) {
    return next(new ApiError('Payment receipt is required', 400));
  }

  // Validate and calculate totals
  let subtotal = 0;
  const orderItems = [];

  for (const item of items) {
    const product = await Product.findOne({ _id: item.productId, isDeleted: { $ne: true } });

    if (!product) {
      return next(new ApiError(`Product ${item.productId} not found`, 404));
    }

    // If a variantId is provided, prefer variant stock/price/sku
    let chosenVariant = null;
    if (item.variantId && Array.isArray(product.variants)) {
      chosenVariant = product.variants.find(v => v.variantId === item.variantId);
      if (!chosenVariant) {
        return next(new ApiError(`Variant ${item.variantId} not found for product ${product.name}`, 404));
      }
      if (chosenVariant.stock < item.quantity) {
        return next(new ApiError(`Insufficient stock for ${product.name} (variant)`, 400));
      }
    } else {
      if (product.stock < item.quantity) {
        return next(new ApiError(`Insufficient stock for ${product.name}`, 400));
      }
    }

    const unitPrice = chosenVariant?.price ?? product.price;
    const itemSubtotal = unitPrice * item.quantity;
    subtotal += itemSubtotal;

    orderItems.push({
      productId: product._id,
      productName: product.name,
      productImage: (chosenVariant?.images?.[0]?.url) || product.images[0]?.url || '',
      sku: chosenVariant?.sku || product.sku,
      variantId: chosenVariant?.variantId || null,
      variantSnapshot: chosenVariant ? {
        sku: chosenVariant.sku || null,
        price: chosenVariant.price || null,
        image: chosenVariant.images?.[0]?.url || null,
        color: chosenVariant.color || null,
        size: chosenVariant.size || null,
        specs: chosenVariant.specs || null
      } : null,
      price: unitPrice,
      quantity: item.quantity,
      selectedColor: item.selectedColor,
      selectedSize: item.selectedSize,
      subtotal: itemSubtotal
    });
  }

  // Apply coupon if provided
  let discount = 0;
  let couponDiscount = 0;
  if (couponCode) {
    const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });

    if (!coupon) {
      return next(new ApiError('Invalid coupon code', 400));
    }

    if (!coupon.isValid()) {
      return next(new ApiError('Coupon is expired or invalid', 400));
    }

    if (subtotal < coupon.minOrderAmount) {
      return next(new ApiError(`Minimum order amount is PKR ${coupon.minOrderAmount}`, 400));
    }

    if (coupon.type === 'percentage') {
      couponDiscount = (subtotal * coupon.value) / 100;
      if (coupon.maxDiscount) {
        couponDiscount = Math.min(couponDiscount, coupon.maxDiscount);
      }
    } else {
      couponDiscount = coupon.value;
    }

    discount = couponDiscount;
  }

  // Calculate shipping
  const shipping = subtotal >= 5000 ? 0 : 250;

  // Calculate total
  const total = subtotal - discount + shipping;

  // Upload receipt to cloud
  const receiptUrl = await uploadService.uploadSingle(req.file, 'hbs-receipts');

  // Create order
  const order = await Order.create({
    userId: req.user?.id || null,
    customer: {
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      alternatePhone: customer.alternatePhone || null,
      houseNumber: customer.houseNumber || null,
      streetNumber: customer.streetNumber || null,
      nearestLandmark: customer.nearestLandmark || null,
      completeAddress: customer.completeAddress || customer.address || '',
      address: customer.completeAddress || customer.address || '',
      tehsil: customer.tehsil || null,
      district: customer.district || null,
      city: customer.city || null,
      postalCode: customer.postalCode || null,
      specialInstructions: customer.specialInstructions || null
    },
    items: orderItems,
    subtotal,
    discount,
    shipping,
    total,
    couponCode: couponCode?.toUpperCase(),
    couponDiscount,
    paymentMethod: paymentMethod || 'bank_transfer',
    customerNotes,
    paymentReceipt: {
      url: receiptUrl,
      uploadedAt: new Date()
    },
    paymentStatus: 'pending'
  });

  // Update coupon usage if applicable
  if (couponCode) {
    await Coupon.findOneAndUpdate(
      { code: couponCode.toUpperCase() },
      {
        $inc: { usedCount: 1 },
        $push: {
          usedBy: {
            userId: req.user?.id,
            orderId: order._id,
            usedAt: new Date(),
            discountAmount: couponDiscount
          }
        }
      }
    );
  }

  // Reduce variant stock and recompute product stock
  const touchedProductIds = new Set();
  for (const item of orderItems) {
    if (item.variantId) {
      await Product.updateOne(
        { _id: item.productId, 'variants.variantId': item.variantId },
        {
          $inc: {
            soldCount: item.quantity,
            'variants.$[v].stock': -item.quantity
          }
        },
        { arrayFilters: [{ 'v.variantId': item.variantId }] }
      );
    } else {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { stock: -item.quantity, soldCount: item.quantity }
      });
    }
    touchedProductIds.add(item.productId.toString());
  }
  for (const productId of touchedProductIds) {
    await recomputeProductStock(productId);
  }

  res.status(201).json(
    new ApiResponse(201, { order }, 'Order created successfully')
  );
});

// @route   GET /api/orders
// @desc    Get all orders (Admin) or user orders
// @access  Private
export const getOrders = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    status,
    paymentStatus,
    search
  } = req.query;

  const query = {};

  // If not admin, filter by user
  if (!req.admin) {
    if (!req.user) {
      return res.json(new ApiResponse(200, { orders: [], pagination: {} }));
    }
    query.userId = req.user.id;
  }

  // Status filters
  if (status) query.status = status;
  if (paymentStatus) query.paymentStatus = paymentStatus;

  // Search by order ID or customer email
  if (search) {
    query.$or = [
      { orderId: new RegExp(search, 'i') },
      { 'customer.email': new RegExp(search, 'i') }
    ];
  }

  const skip = (page - 1) * limit;

  const orders = await Order.find(query)
    .sort('-createdAt')
    .skip(skip)
    .limit(Number(limit))
    .populate('userId', 'fullName email')
    .select('-__v');

  const total = await Order.countDocuments(query);

  res.json(
    new ApiResponse(200, {
      orders,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }, 'Orders retrieved successfully')
  );
});

// @route   GET /api/orders/:id
// @desc    Get single order
// @access  Private
export const getOrder = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  let query;
  if (id.match(/^[0-9a-fA-F]{24}$/)) {
    query = { _id: id };
  } else {
    query = { orderId: id };
  }

  const order = await Order.findOne(query)
    .populate('userId', 'fullName email phone')
    .populate('items.productId', 'name slug images')
    .populate('statusHistory.updatedBy', 'name');

  if (!order) {
    return next(new ApiError('Order not found', 404));
  }

  // Check authorization (user can only see their own orders)
  if (!req.admin && order.userId && order.userId.toString() !== req.user?.id) {
    return next(new ApiError('Not authorized to access this order', 403));
  }

  res.json(
    new ApiResponse(200, { order }, 'Order retrieved successfully')
  );
});

// @route   PUT /api/orders/:id/status
// @desc    Update order status
// @access  Private (Admin)
export const updateOrderStatus = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { status, note } = req.body;

  const order = await Order.findById(id);

  if (!order) {
    return next(new ApiError('Order not found', 404));
  }

  const allowedTransitions = {
    received: ['confirmed', 'cancelled'],
    confirmed: ['processing', 'cancelled'],
    processing: ['shipped', 'cancelled'],
    shipped: ['remain_undelivered', 'delivered', 'cancelled'],
    remain_undelivered: ['delivered', 'cancelled'],
    delivered: [],
    cancelled: []
  };

  if (order.status === status) {
    return next(new ApiError('Order is already in this status', 400));
  }

  const nextStatuses = allowedTransitions[order.status] || [];
  if (!nextStatuses.includes(status)) {
    return next(new ApiError(`Invalid status transition from ${order.status} to ${status}`, 400));
  }

  // Enforce payment verification before confirmation
  if (status === 'confirmed' && order.paymentStatus !== 'verified') {
    return next(new ApiError('Payment must be verified before confirming the order', 400));
  }

  order.status = status;
  order.statusHistory.push({
    status,
    note,
    updatedBy: req.admin.id,
    timestamp: new Date()
  });

  await order.save();

  if (status === 'cancelled') {
    const touchedProductIds = new Set();
    for (const item of order.items) {
      if (item.variantId) {
        await Product.updateOne(
          { _id: item.productId, 'variants.variantId': item.variantId },
          {
            $inc: {
              soldCount: -item.quantity,
              'variants.$[v].stock': item.quantity
            }
          },
          { arrayFilters: [{ 'v.variantId': item.variantId }] }
        );
      } else {
        await Product.findByIdAndUpdate(item.productId, {
          $inc: { stock: item.quantity, soldCount: -item.quantity }
        });
      }
      touchedProductIds.add(item.productId.toString());
    }
    for (const productId of touchedProductIds) {
      await recomputeProductStock(productId);
    }
  }

  res.json(
    new ApiResponse(200, { order }, 'Order status updated successfully')
  );
});

// @route   POST /api/orders/:id/receipt
// @desc    Upload payment receipt
// @access  Public/Private
export const uploadReceipt = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  if (!req.file) {
    return next(new ApiError('Please upload a receipt file', 400));
  }

  const order = await Order.findById(id);

  if (!order) {
    return next(new ApiError('Order not found', 404));
  }

  // Upload receipt to cloud
  const receiptUrl = await uploadService.uploadSingle(req.file, 'hbs-receipts');

  order.paymentReceipt = {
    url: receiptUrl,
    uploadedAt: new Date()
  };

  await order.save();

  res.json(
    new ApiResponse(200, { order }, 'Receipt uploaded successfully')
  );
});

// @route   PUT /api/orders/:id/verify-payment
// @desc    Verify payment
// @access  Private (Admin)
export const verifyPayment = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { isVerified = true } = req.body;

  const order = await Order.findById(id);

  if (!order) {
    return next(new ApiError('Order not found', 404));
  }

  if (!order.paymentReceipt || !order.paymentReceipt.url) {
    return next(new ApiError('No receipt uploaded for this order', 400));
  }

  if (isVerified) {
    order.paymentStatus = 'verified';
    order.paymentReceipt.verifiedAt = new Date();
    order.paymentReceipt.verifiedBy = req.admin.id;

    // Auto-update order status to confirmed if still in received
    if (order.status === 'received') {
      order.status = 'confirmed';
      order.statusHistory.push({
        status: 'confirmed',
        note: 'Payment verified',
        updatedBy: req.admin.id,
        timestamp: new Date()
      });
    }
  } else {
    // Reject payment and cancel the order
    order.paymentStatus = 'failed';

    if (['shipped', 'remain_undelivered', 'delivered'].includes(order.status)) {
      return next(new ApiError('Cannot reject payment for shipped or delivered orders', 400));
    }

    if (order.status !== 'cancelled') {
      order.status = 'cancelled';
      order.cancelledAt = new Date();
      order.statusHistory.push({
        status: 'cancelled',
        note: 'Payment rejected',
        updatedBy: req.admin.id,
        timestamp: new Date()
      });
    }
  }

  await order.save();

  if (!isVerified && order.status === 'cancelled') {
    const touchedProductIds = new Set();
    for (const item of order.items) {
      if (item.variantId) {
        await Product.updateOne(
          { _id: item.productId, 'variants.variantId': item.variantId },
          {
            $inc: {
              soldCount: -item.quantity,
              'variants.$[v].stock': item.quantity
            }
          },
          { arrayFilters: [{ 'v.variantId': item.variantId }] }
        );
      } else {
        await Product.findByIdAndUpdate(item.productId, {
          $inc: { stock: item.quantity, soldCount: -item.quantity }
        });
      }
      touchedProductIds.add(item.productId.toString());
    }
    for (const productId of touchedProductIds) {
      await recomputeProductStock(productId);
    }
  }

  res.json(
    new ApiResponse(
      200,
      { order },
      isVerified ? 'Payment verified successfully' : 'Payment rejected and order cancelled'
    )
  );
});

// @route   PUT /api/orders/:id/cancel
// @desc    Cancel order
// @access  Private
export const cancelOrder = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const order = await Order.findById(id);

  if (!order) {
    return next(new ApiError('Order not found', 404));
  }

  // Check authorization
  if (!req.admin && order.userId && order.userId.toString() !== req.user?.id) {
    return next(new ApiError('Not authorized to cancel this order', 403));
  }

  // Cannot cancel if already shipped or delivered
  if (['shipped', 'remain_undelivered', 'delivered'].includes(order.status)) {
    return next(new ApiError('Cannot cancel order that has been shipped or delivered', 400));
  }

  order.status = 'cancelled';
  order.cancelledAt = new Date();
  order.statusHistory.push({
    status: 'cancelled',
    note: req.body.reason || 'Cancelled by ' + (req.admin ? 'admin' : 'customer'),
    updatedBy: req.admin?.id || null,
    timestamp: new Date()
  });

  await order.save();

  // Restore variant stock and recompute product stock
  {
    const touchedProductIds = new Set();
    for (const item of order.items) {
      if (item.variantId) {
        await Product.updateOne(
          { _id: item.productId, 'variants.variantId': item.variantId },
          {
            $inc: {
              soldCount: -item.quantity,
              'variants.$[v].stock': item.quantity
            }
          },
          { arrayFilters: [{ 'v.variantId': item.variantId }] }
        );
      } else {
        await Product.findByIdAndUpdate(item.productId, {
          $inc: { stock: item.quantity, soldCount: -item.quantity }
        });
      }
      touchedProductIds.add(item.productId.toString());
    }
    for (const productId of touchedProductIds) {
      await recomputeProductStock(productId);
    }
  }

  res.json(
    new ApiResponse(200, { order }, 'Order cancelled successfully')
  );
});

// @route   GET /api/orders/stats/summary
// @desc    Get order statistics (Admin)
// @access  Private (Admin)
export const getOrderStats = asyncHandler(async (req, res) => {
  const stats = await Order.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$total' }
      }
    }
  ]);

  const totalOrders = await Order.countDocuments();
  const totalRevenue = await Order.aggregate([
    { $match: { paymentStatus: 'verified' } },
    { $group: { _id: null, total: { $sum: '$total' } } }
  ]);

  res.json(
    new ApiResponse(200, {
      stats,
      totalOrders,
      totalRevenue: totalRevenue[0]?.total || 0
    }, 'Order statistics retrieved')
  );
});

