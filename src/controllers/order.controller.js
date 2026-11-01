import Order from '../models/Order.js';
import Product from '../models/Product.js';
import PreMadeBundle from '../models/PreMadeBundle.js';
import Coupon from '../models/Coupon.js';
import User from '../models/User.js';
import GuestVerification from '../models/GuestVerification.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import uploadService from '../services/upload.service.js';
import { generateR2Url, resolveImageUrl } from '../utils/imageUrl.js';
import { syncCheckoutDetailsWithUser } from './auth.controller.js';
import cacheService from '../services/cache.service.js';
import rateLimiterService from '../services/rateLimiter.service.js';
import { getBundleRule, computeLineWithBundle } from '../utils/bundlePricing.js';
import {
  sendOrderReceivedEmail,
  sendOrderConfirmedEmail,
  sendOrderProcessingEmail,
  sendOrderShippedEmail,
  sendOrderRemainUndeliveredEmail,
  sendOrderDeliveredEmail,
  sendOrderCancelledEmail
} from '../services/email.service.js';

const recomputeProductStock = async (productId) => {
  const product = await Product.findById(productId, 'variants').lean();
  if (!product) return;
  let totalStock = 0;
  for (const colorVariant of (product.variants || [])) {
    for (const size of (colorVariant.sizes || [])) {
      const tie = Number(size.tieStock) || 0;
      const elastic = Number(size.elasticStock) || 0;
      const bridal = Number(size.bridalStock) || 0;
      const hasCust = size.hasTieElastic || size.hasBridalLength || tie > 0 || elastic > 0 || bridal > 0;
      const sizeStock = hasCust ? (tie + elastic + bridal) : (Number(size.stock) || 0);
      totalStock += sizeStock;

      await Product.updateOne(
        { _id: productId },
        { $set: { 'variants.$[c].sizes.$[s].stock': sizeStock } },
        { arrayFilters: [{ 'c.colorId': colorVariant.colorId }, { 's.sizeId': size.sizeId }] }
      );
    }
  }
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
      let colorId = null, sizeId = null, targetSize = null;
      for (const v of prod.variants) {
        const s = (v.sizes || []).find(sz => `${v.colorId}-${sz.sizeId}` === item.variantId);
        if (s) { colorId = v.colorId; sizeId = s.sizeId; targetSize = s; break; }
      }
      if (colorId != null && sizeId != null && targetSize != null) {
        const qty = Number(item.quantity) || 1;
        const incFields = {
          soldCount: qty,
          'variants.$[c].sizes.$[s].stock': -qty
        };
        // Deduct tie/elastic/bridal stock based on selected customization
        if (item.selectedTieElastic === 'tie') {
          incFields['variants.$[c].sizes.$[s].tieStock'] = -qty;
        } else if (item.selectedTieElastic === 'elastic') {
          incFields['variants.$[c].sizes.$[s].elasticStock'] = -qty;
        }
        if (item.selectedBridalLength === 'bridal') {
          incFields['variants.$[c].sizes.$[s].bridalStock'] = -qty;
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
      let colorId = null, sizeId = null, targetSize = null;
      for (const v of prod.variants) {
        const s = (v.sizes || []).find(sz => `${v.colorId}-${sz.sizeId}` === item.variantId);
        if (s) { colorId = v.colorId; sizeId = s.sizeId; targetSize = s; break; }
      }
      if (colorId != null && sizeId != null && targetSize != null) {
        const qty = Number(item.quantity) || 1;
        const incFields = {
          soldCount: -qty,
          'variants.$[c].sizes.$[s].stock': qty
        };
        if (item.selectedTieElastic === 'tie') {
          incFields['variants.$[c].sizes.$[s].tieStock'] = qty;
        } else if (item.selectedTieElastic === 'elastic') {
          incFields['variants.$[c].sizes.$[s].elasticStock'] = qty;
        }
        if (item.selectedBridalLength === 'bridal') {
          incFields['variants.$[c].sizes.$[s].bridalStock'] = qty;
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
  } catch (_) { }
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

export const DELIVERY_OPTIONS = {
  tcs_express: {
    id: 'tcs_express',
    name: 'TCS Express Delivery',
    shortName: 'TCS Express',
    courier: 'TCS Express',
    fee: 500,
    estimatedDeliveryTime: '2 to 3 working days',
    isDefault: false
  },
  other_couriers: {
    id: 'other_couriers',
    name: 'Other Couriers (Trax, PostEx, etc.)',
    shortName: 'Other Couriers',
    courier: 'Other Couriers (Trax, PostEx, etc.)',
    fee: 300,
    estimatedDeliveryTime: '4 to 7 working days',
    isDefault: true
  }
};

export const resolveDeliveryOption = (optionKey) => {
  const normalizedKey = (optionKey || '').trim().toLowerCase();
  if (normalizedKey === 'tcs_express' || normalizedKey === 'tcs' || normalizedKey === 'tcs express') {
    return DELIVERY_OPTIONS.tcs_express;
  }
  return DELIVERY_OPTIONS.other_couriers;
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
    customerNotes,
    guestVerificationToken,
    deliveryOption
  } = req.body;

  if (!req.file) {
    return next(new ApiError('Payment receipt is required', 400));
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return next(new ApiError('Order must contain at least one item', 400));
  }

  // Pre-validate guest required fields before lock acquisition
  if (!req.user) {
    if (!customer?.email) {
      return next(new ApiError('Customer email is required', 400));
    }
    if (!guestVerificationToken) {
      return next(new ApiError('Email verification required for guest checkout. Please verify your email before placing the order.', 400));
    }
  }

  // Acquire distributed submission lock to safeguard against duplicate order submissions
  const normalizedEmail = (customer?.email || req.user?.email || '').toLowerCase().trim();
  const idempotencyKey = req.headers['x-idempotency-key'] ||
    req.body.idempotencyKey ||
    (req.user ? `user_${req.user.id || req.user._id}` : `guest_${guestVerificationToken || normalizedEmail}`);
  const lockKey = `order_checkout_${idempotencyKey}`;
  const lockAcquired = await rateLimiterService.acquireLock(lockKey, 30);
  if (!lockAcquired) {
    return next(new ApiError('An order placement is already in progress for this request. Please wait a moment.', 409));
  }

  let guestVerificationDoc = null;
  let orderCreatedSuccessfully = false;

  try {
    // Guest checkout email verification check (atomic check-and-set to prevent race conditions)
    if (!req.user) {
      const normalizedGuestEmail = customer.email.toLowerCase().trim();

      // Atomic findOneAndUpdate claims token immediately
      guestVerificationDoc = await GuestVerification.findOneAndUpdate(
        {
          email: normalizedGuestEmail,
          verificationToken: guestVerificationToken,
          isVerified: true,
          isUsed: false,
          verificationTokenExpire: { $gt: new Date() }
        },
        { $set: { isUsed: true, usedAt: new Date() } },
        { new: true }
      );

      if (!guestVerificationDoc) {
        return next(new ApiError('Invalid or expired email verification code. Please verify your email again.', 400));
      }
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
        const rawBundleImg = bundle.images?.[0]?.url || '';
        const bundleImg = resolveImageUrl(rawBundleImg) || rawBundleImg;
        orderItems.push({
          productId: null,
          preMadeBundleId: bundle._id,
          productName: bundle.name,
          productImage: bundleImg,
          productImageR2Url: bundleImg,
          sku: null,
          variantId: null,
          variantName: null,
          variantImage: null,
          variantImageR2Url: null,
          variantImages: [],
          variantR2Images: [],
          orderedVariantImage: null,
          orderedVariantImageR2Url: null,
          orderedVariantImages: [],
          orderedVariantR2Images: [],
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

      let colorV = null;
      let sizeV = null;
      if (Array.isArray(product.variants) && product.variants.length > 0) {
        // 1. Try finding by variantId (matches `${v.colorId}-${sz.sizeId}` or `sz.sizeId`)
        if (item.variantId) {
          for (const v of product.variants) {
            const s = (v.sizes || []).find(sz => `${v.colorId}-${sz.sizeId}` === item.variantId || sz.sizeId === item.variantId);
            if (s) {
              colorV = v;
              sizeV = s;
              break;
            }
          }
          // If not found in sizes, check if variantId matches colorId
          if (!colorV) {
            colorV = product.variants.find(v => v.colorId === item.variantId || v.color === item.variantId);
            if (colorV) {
              sizeV = (colorV.sizes || []).find(sz => sz.size === item.selectedSize || sz.sizeId === item.selectedSize) || colorV.sizes?.[0] || null;
            }
          }
        }

        // 2. If not found by variantId, try finding by selectedColor
        if (!colorV && item.selectedColor) {
          colorV = product.variants.find(v =>
            v.color?.trim().toLowerCase() === item.selectedColor?.trim().toLowerCase() ||
            v.colorId?.trim().toLowerCase() === item.selectedColor?.trim().toLowerCase()
          );
          if (colorV) {
            if (item.selectedSize) {
              sizeV = (colorV.sizes || []).find(sz =>
                sz.size?.trim().toLowerCase() === item.selectedSize?.trim().toLowerCase() ||
                sz.sizeId?.trim().toLowerCase() === item.selectedSize?.trim().toLowerCase()
              );
            }
            if (!sizeV) {
              sizeV = colorV.sizes?.[0] || null;
            }
          }
        }
      }

      if (item.variantId && !colorV && !sizeV) {
        return next(new ApiError(`Variant ${item.variantId} not found for product ${product.name}`, 404));
      }

      let chosenVariant = null;
      if (sizeV && colorV) {
        chosenVariant = { ...sizeV, images: colorV.images, color: colorV.color, colorId: colorV.colorId, size: sizeV.size };
      } else if (colorV) {
        chosenVariant = { images: colorV.images, color: colorV.color, colorId: colorV.colorId, size: item.selectedSize || null };
      }

      if (sizeV) {
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
          if (item.selectedBridalLength === 'bridal') {
            const bridalStock = Number(sizeV.bridalStock) || 0;
            if (bridalStock < requestedQty) {
              return next(new ApiError(`Bridal Length option for ${product.name} is out of stock. Available: ${bridalStock}, requested: ${requestedQty}`, 400));
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

      // Collect all image URLs for this variant
      const rawVariantImages = colorV?.images || chosenVariant?.images || [];
      const variantImagesList = (Array.isArray(rawVariantImages) ? rawVariantImages : [])
        .map(img => (typeof img === 'string' ? img : img?.url))
        .filter(Boolean);

      const primaryVariantImg = (Array.isArray(rawVariantImages) ? rawVariantImages : []).find(i => i?.isPrimary)?.url ||
        variantImagesList[0] ||
        null;

      // Resolve exact variant image (prioritizing customer selected/snapshot image, then primary variant image)
      const resolvedVariantImg = item.selectedImage ||
        item.variantSnapshot?.image ||
        primaryVariantImg ||
        null;

      const finalVariantImages = [];
      if (resolvedVariantImg) {
        finalVariantImages.push(resolvedVariantImg);
      }
      for (const url of variantImagesList) {
        if (!finalVariantImages.includes(url)) {
          finalVariantImages.push(url);
        }
      }

      // Default/main product image
      const productMainImage = product.images?.find(i => i?.isPrimary)?.url ||
        product.images?.[0]?.url ||
        product.image ||
        '';

      // Readable variant name (e.g. "Dark Grey" or "Dark Grey / Standard")
      const variantName = [item.selectedColor || colorV?.color, item.selectedSize || sizeV?.size]
        .filter(Boolean)
        .join(' / ') || item.selectedColor || colorV?.color || null;

      const rawMainImg = productMainImage || resolvedVariantImg || '';
      const mainImg = resolveImageUrl(rawMainImg) || rawMainImg;
      const finalVariantImg = resolveImageUrl(resolvedVariantImg) || resolvedVariantImg;
      const resolvedVariantImages = (finalVariantImages || []).map(img => resolveImageUrl(img) || img);

      orderItems.push({
        productId: product._id,
        preMadeBundleId: null,
        productName: product.name,
        productImage: mainImg,
        productImageR2Url: mainImg,
        sku: chosenVariant?.sku || product.sku,
        variantId: item.variantId || (colorV && sizeV ? `${colorV.colorId}-${sizeV.sizeId}` : (colorV?.colorId || null)),
        variantName,
        variantImage: finalVariantImg,
        variantImageR2Url: finalVariantImg,
        variantImages: resolvedVariantImages,
        variantR2Images: resolvedVariantImages,
        orderedVariantImage: finalVariantImg,
        orderedVariantImageR2Url: finalVariantImg,
        orderedVariantImages: resolvedVariantImages,
        orderedVariantR2Images: resolvedVariantImages,
        variantSnapshot: (chosenVariant || resolvedVariantImg) ? {
          sku: chosenVariant?.sku || product.sku || null,
          price: chosenVariant?.price || effectiveUnitPrice,
          name: variantName,
          image: resolvedVariantImg,
          images: finalVariantImages,
          color: chosenVariant?.color || item.selectedColor || null,
          size: chosenVariant?.size || item.selectedSize || null,
          specs: chosenVariant?.specs || colorV?.specs || null,
          hasTieElastic: chosenVariant?.hasTieElastic || false,
          hasBridalLength: chosenVariant?.hasBridalLength || false,
          bridalLengthPrice: chosenVariant?.bridalLengthPrice || 0
        } : null,
        price: effectiveUnitPrice,
        quantity: item.quantity,
        selectedColor: item.selectedColor || chosenVariant?.color || null,
        selectedSize: item.selectedSize || chosenVariant?.size || null,
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

    // Calculate delivery fee based on selected option (never trust frontend amount)
    const selectedDelivery = resolveDeliveryOption(deliveryOption);
    const shipping = selectedDelivery.fee;

    // Calculate total
    const total = subtotal - discount + shipping;

    // Upload receipt to cloud
    const receiptRes = await uploadService.uploadSingle(req.file, 'hbs-receipts');
    const receiptUrl = typeof receiptRes === 'string' ? receiptRes : receiptRes?.url;
    const receiptProvider = typeof receiptRes === 'object' && receiptRes?.provider ? receiptRes.provider : 'r2';
    const receiptKey = typeof receiptRes === 'object' ? receiptRes?.key : undefined;
    const receiptPublicId = typeof receiptRes === 'object' ? receiptRes?.publicId : undefined;

    // Create order
    const normalizedCustomerEmail = (customer?.email || req.user?.email || '').toLowerCase().trim();
    const order = await Order.create({
      userId: req.user?.id || null,
      customer: {
        name: (customer.name || '').trim(),
        email: normalizedCustomerEmail,
        phone: (customer.phone || '').trim(),
        alternatePhone: customer.alternatePhone ? customer.alternatePhone.trim() : null,
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
      deliveryFee: shipping,
      total,
      deliveryOption: selectedDelivery.id,
      deliveryOptionName: selectedDelivery.name,
      estimatedDeliveryTime: selectedDelivery.estimatedDeliveryTime,
      courier: selectedDelivery.courier,
      couponCode: couponCode?.toUpperCase(),
      couponDiscount,
      paymentMethod: paymentMethod || 'bank_transfer',
      customerNotes,
      paymentReceipt: {
        provider: receiptProvider,
        key: receiptKey,
        publicId: receiptPublicId,
        url: resolveImageUrl(receiptUrl) || receiptUrl,
        r2Url: resolveImageUrl(receiptUrl) || receiptUrl,
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

    // If registered user opted to save/update checkout details, persist them
    if (req.user && (req.body.saveCheckoutDetails === true || req.body.saveCheckoutDetails === 'true')) {
      try {
        const userToUpdate = await User.findById(req.user.id || req.user._id);
        if (userToUpdate) {
          syncCheckoutDetailsWithUser(userToUpdate, customer);
          await userToUpdate.save();
        }
      } catch (saveErr) {
        console.error('Failed to auto-save checkout details on order creation:', saveErr);
        // Non-fatal, do not break order creation
      }
    }

    // Send Order Received Email (asynchronous, non-blocking)
    sendOrderReceivedEmail(order).catch(err =>
      console.error('Failed to send order received email:', err.message)
    );

    orderCreatedSuccessfully = true;

    res.status(201).json(
      new ApiResponse(201, { order }, 'Order created successfully')
    );
  } finally {
    // If order was not created successfully, revert guest verification token consumption so customer can retry
    if (!orderCreatedSuccessfully && guestVerificationDoc?._id) {
      await GuestVerification.updateOne(
        { _id: guestVerificationDoc._id },
        { $set: { isUsed: false, usedAt: null } }
      ).catch(() => { });
    }

    // Always release the distributed submission lock so subsequent requests are not blocked
    await rateLimiterService.releaseLock(lockKey).catch((err) => {
      console.error(`Failed to release order lock ${lockKey}:`, err.message);
    });
  }
});

/** Helper: normalize shipping charge for existing/legacy orders */
const normalizeOrderShipping = (orderObj) => {
  if (!orderObj) return orderObj;
  const sub = Number(orderObj.subtotal) || 0;
  const disc = Number(orderObj.discount) || 0;
  const shipping = (typeof orderObj.shipping === 'number' && !isNaN(orderObj.shipping))
    ? orderObj.shipping
    : (typeof orderObj.deliveryFee === 'number' && !isNaN(orderObj.deliveryFee)
      ? orderObj.deliveryFee
      : 300);
  orderObj.shipping = shipping;
  if (orderObj.total == null || isNaN(orderObj.total)) {
    orderObj.total = Math.max(0, sub - disc + shipping);
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

  const query = {
    isDeleted: { $ne: true }
  };

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

  // Search by order ID, customer name, email, phone, city, tracking number, or user full name
  if (search && typeof search === 'string' && search.trim()) {
    const escapedSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(escapedSearch, 'i');

    // Find registered user IDs whose fullName or email matches the search term
    const matchingUsers = await User.find({
      $or: [
        { fullName: searchRegex },
        { email: searchRegex }
      ]
    }).select('_id').lean();

    const userIds = matchingUsers.map(u => u._id);

    query.$or = [
      { orderId: searchRegex },
      { 'customer.name': searchRegex },
      { 'customer.email': searchRegex },
      { 'customer.phone': searchRegex },
      { 'customer.alternatePhone': searchRegex },
      { 'customer.city': searchRegex },
      { trackingNumber: searchRegex },
      { courier: searchRegex },
      ...(userIds.length > 0 ? [{ userId: { $in: userIds } }] : [])
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

  // Check authorization (admin, owner user, or matching guest email query param)
  const { email } = req.query;
  const isAdmin = !!req.admin;
  const isOwnerUser = req.user && order.userId && order.userId.toString() === req.user.id;
  const isGuestEmailMatch = email && (order.customer?.email || '').trim().toLowerCase() === email.trim().toLowerCase();

  if (!isAdmin && !isOwnerUser && !isGuestEmailMatch) {
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
  const { status, note, trackingNumber, courier } = req.body;

  const order = await Order.findById(id);

  if (!order) {
    return next(new ApiError('Order not found', 404));
  }

  const targetStatus = status || order.status;

  // Validate tracking number when status is or is being set to shipped
  if (targetStatus === 'shipped') {
    const effectiveTracking = trackingNumber !== undefined ? trackingNumber?.trim() : order.trackingNumber?.trim();
    if (!effectiveTracking) {
      return next(new ApiError('Tracking number is required when changing order status to Shipped', 400));
    }
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

  if (order.status === targetStatus && trackingNumber === undefined && courier === undefined) {
    return res.json(
      new ApiResponse(200, { order }, 'Order is already in this status')
    );
  }

  if (order.status !== targetStatus) {
    const nextStatuses = allowedTransitions[order.status] || [];
    const previousStatuses = [...new Set((order.statusHistory || []).map((h) => h.status).filter(Boolean))];
    const allowed = [order.status, ...nextStatuses, ...previousStatuses];
    if (!allowed.includes(targetStatus)) {
      return next(new ApiError(`Invalid status transition from ${order.status} to ${targetStatus}`, 400));
    }

    // Enforce payment verification before confirmation
    if (targetStatus === 'confirmed' && order.paymentStatus !== 'verified') {
      return next(new ApiError('Payment must be verified before confirming the order', 400));
    }
  }

  const previousTrackingNumber = order.trackingNumber || '';
  const trackingNumberChanged = trackingNumber !== undefined && trackingNumber.trim() !== previousTrackingNumber;

  // Update tracking information if provided
  if (trackingNumber !== undefined) {
    order.trackingNumber = trackingNumber.trim();
  }
  if (courier !== undefined) {
    order.courier = courier.trim();
  }

  const statusChanged = order.status !== targetStatus;
  order.status = targetStatus;

  order.statusHistory.push({
    status: targetStatus,
    note: note || (trackingNumber ? `Tracking updated: ${order.trackingNumber}${order.courier ? ` (${order.courier})` : ''}` : undefined),
    updatedBy: req.admin.id,
    timestamp: new Date()
  });

  await order.save();

  // Restore stock on cancellation — guarded by stockDeducted/stockRestored flags
  if (targetStatus === 'cancelled' && statusChanged) {
    await restoreAllStock(order);
  }

  // Send email notification based on updated status (asynchronous, non-blocking, duplicate guarded)
  if (statusChanged || (targetStatus === 'shipped' && trackingNumberChanged)) {
    if (statusChanged && targetStatus === 'confirmed') {
      sendOrderConfirmedEmail(order).catch(err => console.error('Failed to send order confirmed email:', err.message));
    } else if (statusChanged && targetStatus === 'processing') {
      sendOrderProcessingEmail(order).catch(err => console.error('Failed to send order processing email:', err.message));
    } else if (targetStatus === 'shipped') {
      sendOrderShippedEmail(order, order.trackingNumber, order.courier).catch(err => console.error('Failed to send order shipped email:', err.message));
    } else if (statusChanged && targetStatus === 'remain_undelivered') {
      sendOrderRemainUndeliveredEmail(order, note).catch(err => console.error('Failed to send order remain undelivered email:', err.message));
    } else if (statusChanged && targetStatus === 'delivered') {
      sendOrderDeliveredEmail(order).catch(err => console.error('Failed to send order delivered email:', err.message));
    } else if (statusChanged && targetStatus === 'cancelled') {
      sendOrderCancelledEmail(order, note).catch(err => console.error('Failed to send order cancelled email:', err.message));
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
  const uploadRes = await uploadService.uploadSingle(req.file, 'hbs-receipts');
  const receiptUrl = typeof uploadRes === 'string' ? uploadRes : uploadRes?.url;
  const receiptProvider = typeof uploadRes === 'object' && uploadRes?.provider ? uploadRes.provider : 'r2';
  const receiptKey = typeof uploadRes === 'object' ? uploadRes?.key : undefined;
  const receiptPublicId = typeof uploadRes === 'object' ? uploadRes?.publicId : undefined;

  order.paymentReceipt = {
    provider: receiptProvider,
    key: receiptKey,
    publicId: receiptPublicId,
    url: resolveImageUrl(receiptUrl) || receiptUrl,
    r2Url: resolveImageUrl(receiptUrl) || receiptUrl,
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

  const previousPaymentStatus = order.paymentStatus;
  const previousOrderStatus = order.status;

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

  // Send email notification only if state changed to prevent duplicate customer emails
  if (isVerified && previousPaymentStatus !== 'verified') {
    sendOrderConfirmedEmail(order).catch(err => console.error('Failed to send order confirmed email:', err.message));
  } else if (!isVerified && previousOrderStatus !== 'cancelled') {
    sendOrderCancelledEmail(order, 'Payment receipt rejected').catch(err => console.error('Failed to send order cancelled email:', err.message));
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

  // Send order cancelled email notification (asynchronous, non-blocking)
  sendOrderCancelledEmail(order, req.body.reason || 'Cancelled by customer').catch(err =>
    console.error('Failed to send order cancelled email:', err.message)
  );

  res.json(
    new ApiResponse(200, { order }, 'Order cancelled successfully')
  );
});

// @route   GET /api/orders/stats/summary
// @desc    Get order statistics (Admin)
// @access  Private (Admin)
export const getOrderStats = asyncHandler(async (req, res) => {
  const matchFilter = {
    status: { $ne: 'cancelled' },
    isDeleted: { $ne: true }
  };

  const stats = await Order.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$total' }
      }
    }
  ]);

  const totalOrders = await Order.countDocuments(matchFilter);
  const totalRevenue = await Order.aggregate([
    { $match: { ...matchFilter, paymentStatus: 'verified' } },
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

// @route   DELETE /api/admin/orders/:id
// @desc    Soft delete a cancelled order (Admin)
// @access  Private (Admin)
export const softDeleteOrder = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const order = await Order.findById(id);

  if (!order) {
    return next(new ApiError('Order not found', 404));
  }

  // Prevent duplicate soft-delete requests (idempotent)
  if (order.isDeleted) {
    return res.json(
      new ApiResponse(200, { orderId: order.orderId }, 'Order is already deleted')
    );
  }

  // Only cancelled orders can be soft deleted
  if (order.status !== 'cancelled') {
    return next(new ApiError('Only cancelled orders can be soft deleted', 400));
  }

  order.isDeleted = true;
  order.deletedAt = new Date();

  await order.save();

  // Flush admin dashboard cache so KPIs update immediately
  cacheService.flushAll();

  res.json(
    new ApiResponse(200, { orderId: order.orderId }, 'Order soft deleted successfully')
  );
});

