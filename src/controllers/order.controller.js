import Order from '../models/Order.js';
import Product from '../models/Product.js';
import PreMadeBundle from '../models/PreMadeBundle.js';
import Coupon from '../models/Coupon.js';
import User from '../models/User.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import uploadService from '../services/upload.service.js';
import { getBundleRule, computeLineWithBundle } from '../utils/bundlePricing.js';

const recomputeProductStock = async (productId) => {
  const product = await Product.findById(productId, 'variants').lean();
  if (!product) return;
  const totalStock = (product.variants || []).reduce(
    (sum, v) => sum + (v.sizes || []).reduce((s, sz) => s + (Number(sz.stock) || 0), 0),
    0
  );
  await Product.updateOne({ _id: productId }, { $set: { stock: totalStock } });
};

/**
 * Deduct stock for a single order item (called once when order is created).
 * Returns the productId string if a product was touched, null for bundles.
 */
const deductOrderItem = async (item) => {
  // Pre-made bundle
  if (item.preMadeBundleId) {
    await PreMadeBundle.findByIdAndUpdate(item.preMadeBundleId, {
      $inc: { stock: -item.quantity, soldCount: item.quantity }
    });
    return null;
  }
  if (!item.productId) return null;

  if (item.variantId) {
    const prod = await Product.findOne({ _id: item.productId }, { variants: 1 }).lean();
    if (prod && Array.isArray(prod.variants)) {
      let colorId = null, sizeId = null;
      for (const v of prod.variants) {
        const s = (v.sizes || []).find(sz => `${v.colorId}-${sz.sizeId}` === item.variantId);
        if (s) { colorId = v.colorId; sizeId = s.sizeId; break; }
      }
      if (colorId != null && sizeId != null) {
        const incFields = {
          soldCount: item.quantity,
          'variants.$[c].sizes.$[s].stock': -item.quantity
        };
        // Only deduct tie/elastic stock for stock-tracked customizations (not bridal)
        if (item.selectedTieElastic === 'tie') {
          incFields['variants.$[c].sizes.$[s].tieStock'] = -item.quantity;
        } else if (item.selectedTieElastic === 'elastic') {
          incFields['variants.$[c].sizes.$[s].elasticStock'] = -item.quantity;
        }
        await Product.updateOne(
          { _id: item.productId },
          { $inc: incFields },
          { arrayFilters: [{ 'c.colorId': colorId }, { 's.sizeId': sizeId }] }
        );
        return item.productId.toString();
      }
    }
  }

  // Fallback: legacy/non-variant product
  await Product.findByIdAndUpdate(item.productId, {
    $inc: { stock: -item.quantity, soldCount: item.quantity }
  });
  return item.productId.toString();
};

/**
 * Restore stock for a single order item (called once when order is cancelled/rejected).
 * Mirrors deductOrderItem exactly. Returns productId string or null.
 */
const restoreOrderItem = async (item) => {
  if (item.preMadeBundleId) {
    await PreMadeBundle.findByIdAndUpdate(item.preMadeBundleId, {
      $inc: { stock: item.quantity, soldCount: -item.quantity }
    });
    return null;
  }
  if (!item.productId) return null;

  if (item.variantId) {
    const prod = await Product.findOne({ _id: item.productId }, { variants: 1 }).lean();
    if (prod && Array.isArray(prod.variants)) {
      let colorId = null, sizeId = null;
      for (const v of prod.variants) {
        const s = (v.sizes || []).find(sz => `${v.colorId}-${sz.sizeId}` === item.variantId);
        if (s) { colorId = v.colorId; sizeId = s.sizeId; break; }
      }
      if (colorId != null && sizeId != null) {
        const incFields = {
          soldCount: -item.quantity,
          'variants.$[c].sizes.$[s].stock': item.quantity
        };
        if (item.selectedTieElastic === 'tie') {
          incFields['variants.$[c].sizes.$[s].tieStock'] = item.quantity;
        } else if (item.selectedTieElastic === 'elastic') {
          incFields['variants.$[c].sizes.$[s].elasticStock'] = item.quantity;
        }
        await Product.updateOne(
          { _id: item.productId },
          { $inc: incFields },
          { arrayFilters: [{ 'c.colorId': colorId }, { 's.sizeId': sizeId }] }
        );
        return item.productId.toString();
      }
    }
  }

  await Product.findByIdAndUpdate(item.productId, {
    $inc: { stock: item.quantity, soldCount: -item.quantity }
  });
  return item.productId.toString();
};

/**
 * Idempotent stock restoration for a full order.
 * Only runs if stockDeducted=true and stockRestored=false.
 * Sets stockRestored=true after success to prevent duplicates.
 */
const restoreAllStock = async (order) => {
  // Guard: only restore if stock was actually deducted and not yet restored
  if (!order.stockDeducted || order.stockRestored) return;

  const touchedProductIds = new Set();
  for (const item of order.items) {
    const pId = await restoreOrderItem(item);
    if (pId) touchedProductIds.add(pId);
  }
  for (const productId of touchedProductIds) {
    await recomputeProductStock(productId);
  }

  // Mark as restored (atomic update to prevent race conditions)
  await Order.updateOne({ _id: order._id }, { $set: { stockRestored: true } });
  order.stockRestored = true;
};

/**
 * Get unit weight (in kg) for one order item from product or bundle.
 */
const getItemUnitWeight = (item, product, bundle) => {
  if (bundle) {
    return Number(bundle.weight) || 0;
  }
  if (!product) return 0;
  if (item.variantId && Array.isArray(product.variants)) {
    for (const v of product.variants) {
      const sizeEntry = (v.sizes || []).find(sz => `${v.colorId}-${sz.sizeId}` === item.variantId);
      if (sizeEntry != null && sizeEntry.weight != null) {
        return Number(sizeEntry.weight) || 0;
      }
    }
  }
  return Number(product.weight) || 0;
};

/** Normalize ref to 24-char hex ID string (handles ObjectId, string, or populated object). */
const toRefId = (ref) => {
  if (ref == null) return null;
  if (typeof ref === 'string' && /^[0-9a-fA-F]{24}$/.test(ref)) return ref;
  if (typeof ref === 'object' && ref._id != null) return ref._id.toString();
  try {
    const s = ref.toString();
    if (/^[0-9a-fA-F]{24}$/.test(s)) return s;
  } catch (_) {}
  return null;
};

/**
 * Compute total weight (kg) for an order from its items.
 * If productMap and bundleMap are provided, uses them; otherwise fetches Product/PreMadeBundle.
 */
const computeOrderTotalWeight = async (order, productMap = null, bundleMap = null) => {
  if (!order?.items?.length) return 0;
  let productMapLocal = productMap;
  let bundleMapLocal = bundleMap;
  if (!productMapLocal || !bundleMapLocal) {
    const productIds = [...new Set(order.items.map(i => toRefId(i.productId)).filter(Boolean))];
    const bundleIds = [...new Set(order.items.map(i => toRefId(i.preMadeBundleId)).filter(Boolean))];
    const [products, bundles] = await Promise.all([
      productIds.length ? Product.find({ _id: { $in: productIds } }).select('weight variants').lean() : [],
      bundleIds.length ? PreMadeBundle.find({ _id: { $in: bundleIds } }).select('weight').lean() : []
    ]);
    productMapLocal = new Map(products.map(p => [p._id.toString(), p]));
    bundleMapLocal = new Map(bundles.map(b => [b._id.toString(), b]));
  }
  let total = 0;
  for (const item of order.items) {
    const product = item.productId ? productMapLocal.get(toRefId(item.productId)) : null;
    const bundle = item.preMadeBundleId ? bundleMapLocal.get(toRefId(item.preMadeBundleId)) : null;
    const unitWeight = getItemUnitWeight(item, product, bundle);
    total += unitWeight * (Number(item.quantity) || 0);
  }
  return Math.round(total * 1000) / 1000;
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
    if (item.preMadeBundleId) {
      const bundle = await PreMadeBundle.findOne({ _id: item.preMadeBundleId, status: 'active' });
      if (!bundle) {
        return next(new ApiError(`Pre-made bundle ${item.preMadeBundleId} not found or inactive`, 404));
      }
      const qty = Math.max(1, Number(item.quantity) || 1);
      const bundleStock = Number(bundle.stock) ?? 0;
      if (bundleStock < qty) {
        return next(new ApiError(`Insufficient stock for ${bundle.name}. Available: ${bundleStock}, requested: ${qty}`, 400));
      }
      const itemSubtotal = bundle.price * qty;
      subtotal += itemSubtotal;
      orderItems.push({
        productId: null,
        preMadeBundleId: bundle._id,
        productName: bundle.name,
        productImage: bundle.images?.[0]?.url || '',
        sku: null,
        variantId: null,
        variantSnapshot: null,
        price: bundle.price,
        quantity: qty,
        selectedColor: null,
        selectedSize: null,
        subtotal: itemSubtotal
      });
      continue;
    }

    const product = await Product.findOne({ _id: item.productId, isDeleted: { $ne: true } }).lean();
    if (!product) {
      return next(new ApiError(`Product ${item.productId} not found`, 404));
    }

    let chosenVariant = null;
    if (item.variantId && Array.isArray(product.variants)) {
      let colorV = null;
      let sizeV = null;
      for (const v of product.variants) {
        const s = (v.sizes || []).find(sz => `${v.colorId}-${sz.sizeId}` === item.variantId);
        if (s) {
          colorV = v;
          sizeV = s;
          break;
        }
      }
      chosenVariant = sizeV ? { ...sizeV, images: colorV.images, color: colorV.color, size: sizeV.size } : null;
      if (!chosenVariant) {
        return next(new ApiError(`Variant ${item.variantId} not found for product ${product.name}`, 404));
      }
      const variantStock = Number(sizeV.stock) || 0;
      const requestedQty = Number(item.quantity) || 0;
      if (variantStock < requestedQty) {
        return next(new ApiError(`Insufficient stock for ${product.name} (variant). Available: ${variantStock}, requested: ${requestedQty}`, 400));
      }

      // Check Customization options requirement (Tie, Elastic, or Bridal Length)
      const hasCustomizations = sizeV.hasTieElastic || sizeV.hasBridalLength;
      if (hasCustomizations) {
        const hasTieSelection = item.selectedTieElastic && ['tie', 'elastic'].includes(item.selectedTieElastic);
        const hasBridalSelection = item.selectedBridalLength === 'bridal';

        if (!hasTieSelection && !hasBridalSelection) {
          return next(new ApiError(`Please select a customization option (Tie, Elastic, or Bridal Length) for ${product.name}`, 400));
        }

        if (item.selectedTieElastic === 'tie') {
          const tieStock = Number(sizeV.tieStock) || 0;
          if (tieStock < requestedQty) {
            return next(new ApiError(`Tie option for ${product.name} is out of stock. Available: ${tieStock}, requested: ${requestedQty}`, 400));
          }
        } else if (item.selectedTieElastic === 'elastic') {
          const elasticStock = Number(sizeV.elasticStock) || 0;
          if (elasticStock < requestedQty) {
            return next(new ApiError(`Elastic option for ${product.name} is out of stock. Available: ${elasticStock}, requested: ${requestedQty}`, 400));
          }
        }
      }
    } else {
      const productStock = Number(product.stock) || 0;
      const requestedQty = Number(item.quantity) || 0;
      if (productStock < requestedQty) {
        return next(new ApiError(`Insufficient stock for ${product.name}. Available: ${productStock}, requested: ${requestedQty}`, 400));
      }
    }

    const baseUnitPrice = chosenVariant?.price ?? product.price;
    const bridalExtra = (chosenVariant?.hasBridalLength && item.selectedBridalLength === 'bridal') ? (Number(chosenVariant.bridalLengthPrice) || 0) : 0;
    const unitPrice = baseUnitPrice + bridalExtra;
    const rule = item.variantId ? await getBundleRule(item.productId, item.variantId) : null;
    const computed = computeLineWithBundle(unitPrice, item.quantity, rule);
    subtotal += computed.effectiveLineTotal;
    const effectiveUnitPrice = computed.effectiveLineTotal / item.quantity;

    orderItems.push({
      productId: product._id,
      preMadeBundleId: null,
      productName: product.name,
      productImage: (chosenVariant?.images?.[0]?.url) || (product.images?.[0]?.url) || '',
      sku: chosenVariant?.sku || product.sku,
      variantId: item.variantId || null,
      variantSnapshot: chosenVariant ? {
        sku: chosenVariant.sku || null,
        price: chosenVariant.price || null,
        image: chosenVariant.images?.[0]?.url || null,
        color: chosenVariant.color || null,
        size: chosenVariant.size || null,
        specs: chosenVariant.specs || null,
        hasTieElastic: chosenVariant.hasTieElastic || false,
        hasBridalLength: chosenVariant.hasBridalLength || false,
        bridalLengthPrice: chosenVariant.bridalLengthPrice || 0
      } : null,
      price: effectiveUnitPrice,
      quantity: item.quantity,
      selectedColor: item.selectedColor,
      selectedSize: item.selectedSize,
      selectedTieElastic: chosenVariant?.hasTieElastic ? item.selectedTieElastic : null,
      selectedBridalLength: chosenVariant?.hasBridalLength ? item.selectedBridalLength : null,
      bridalLengthPrice: (chosenVariant?.hasBridalLength && item.selectedBridalLength === 'bridal') ? (Number(chosenVariant.bridalLengthPrice) || 0) : 0,
      subtotal: computed.effectiveLineTotal
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

  // Calculate shipping (Rs. 300 standard shipping, free over Rs. 5000)
  const shipping = subtotal >= 5000 ? 0 : 300;

  // Calculate total
  const total = subtotal - discount + shipping;

  // Upload receipt to cloud
  const { url: receiptUrl } = await uploadService.uploadSingle(req.file, 'hbs-receipts');

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

  // Deduct stock for all items and mark order as stock-deducted (idempotency guard)
  const touchedProductIds = new Set();
  for (const item of orderItems) {
    const pId = await deductOrderItem(item);
    if (pId) touchedProductIds.add(pId);
  }
  for (const productId of touchedProductIds) {
    await recomputeProductStock(productId);
  }
  // Mark stock as deducted so restoreAllStock knows it needs to restore later if cancelled
  await Order.updateOne({ _id: order._id }, { $set: { stockDeducted: true } });
  order.stockDeducted = true;

  res.status(201).json(
    new ApiResponse(201, { order }, 'Order created successfully')
  );
});

/** Helper: normalize shipping charge to Rs. 300 for existing/legacy orders */
const normalizeOrderShipping = (orderObj) => {
  if (!orderObj) return orderObj;
  const sub = Number(orderObj.subtotal) || 0;
  const disc = Number(orderObj.discount) || 0;
  if (sub >= 5000) {
    orderObj.shipping = 0;
    orderObj.total = Math.max(0, sub - disc);
  } else {
    orderObj.shipping = 300;
    orderObj.total = Math.max(0, sub - disc + 300);
  }
  return orderObj;
};

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

  // Background migration for legacy Rs. 250 shipping records
  Order.updateMany(
    { subtotal: { $lt: 5000 }, shipping: { $ne: 300 } },
    [
      {
        $set: {
          shipping: 300,
          total: { $add: [{ $subtract: ['$subtotal', '$discount'] }, 300] }
        }
      }
    ]
  ).catch(() => {});

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
    .select('-__v')
    .lean();

  const total = await Order.countDocuments(query);

  // Batch-fetch products and bundles for totalWeight computation (normalize refs in case of populated objects)
  const allProductIds = [...new Set(orders.flatMap(o => (o.items || []).map(i => toRefId(i.productId)).filter(Boolean)))];
  const allBundleIds = [...new Set(orders.flatMap(o => (o.items || []).map(i => toRefId(i.preMadeBundleId)).filter(Boolean)))];
  const [products, bundles] = await Promise.all([
    allProductIds.length ? Product.find({ _id: { $in: allProductIds } }).select('weight variants').lean() : [],
    allBundleIds.length ? PreMadeBundle.find({ _id: { $in: allBundleIds } }).select('weight').lean() : []
  ]);
  const productMap = new Map(products.map(p => [p._id.toString(), p]));
  const bundleMap = new Map(bundles.map(b => [b._id.toString(), b]));

  const ordersWithWeight = await Promise.all(
    orders.map(async (o) => {
      const normalized = normalizeOrderShipping({ ...o });
      const totalWeight = await computeOrderTotalWeight(normalized, productMap, bundleMap);
      return { ...normalized, totalWeight };
    })
  );

  res.json(
    new ApiResponse(200, {
      orders: ordersWithWeight,
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

  const orderObj = normalizeOrderShipping(order.toObject ? order.toObject() : order);
  const totalWeight = await computeOrderTotalWeight(orderObj);
  orderObj.totalWeight = totalWeight;

  res.json(
    new ApiResponse(200, { order: orderObj }, 'Order retrieved successfully')
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
    return res.json(
      new ApiResponse(200, { order }, 'Order is already in this status')
    );
  }

  const nextStatuses = allowedTransitions[order.status] || [];
  const previousStatuses = [...new Set((order.statusHistory || []).map((h) => h.status).filter(Boolean))];
  const allowed = [order.status, ...nextStatuses, ...previousStatuses];
  if (!allowed.includes(status)) {
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

  // Restore stock on cancellation — guarded by stockDeducted/stockRestored flags
  if (status === 'cancelled') {
    await restoreAllStock(order);
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

  // Reject on cancelled order: allow as no-op (ensure paymentStatus = failed, already cancelled)
  if (order.status === 'cancelled') {
    if (isVerified) {
      return next(new ApiError('Cannot verify payment for a cancelled order', 400));
    }
    order.paymentStatus = 'failed';
    await order.save();
    return res.json(
      new ApiResponse(200, { order }, 'Payment already rejected for this order')
    );
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

  // Restore stock on payment rejection — guarded by stockDeducted/stockRestored flags
  if (!isVerified && order.status === 'cancelled') {
    await restoreAllStock(order);
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

  // Restore variant stock — guarded by stockDeducted/stockRestored flags
  await restoreAllStock(order);

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

