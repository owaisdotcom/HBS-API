import mongoose from 'mongoose';
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
import {
  generateR2Url,
  resolveImageUrl,
  extractImageKey,
  normalizeImageStringArray,
  normalizeSingleImageUrl
} from '../utils/imageUrl.js';
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

const recomputeProductStock = async (productId, session = null) => {
  const q = Product.findById(productId, 'variants');
  if (session) q.session(session);
  const product = await q.lean();
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

      const opts = {
        arrayFilters: [{ 'c.colorId': colorVariant.colorId }, { 's.sizeId': size.sizeId }],
        ...(session ? { session } : {})
      };
      await Product.updateOne(
        { _id: productId },
        { $set: { 'variants.$[c].sizes.$[s].stock': sizeStock } },
        opts
      );
    }
  }
  const finalOpts = session ? { session } : {};
  await Product.updateOne({ _id: productId }, { $set: { stock: totalStock } }, finalOpts);
};

/**
 * Deduct stock for a single order item (called once when order is created or rejection reverted).
 * Returns the productId string if a product was touched, null for bundles.
 */
const deductOrderItem = async (item, session = null) => {
  const opts = session ? { session } : {};
  // Pre-made bundle
  if (item.preMadeBundleId) {
    await PreMadeBundle.findByIdAndUpdate(item.preMadeBundleId, {
      $inc: { stock: -item.quantity, soldCount: item.quantity }
    }, opts);
    return null;
  }
  if (!item.productId) return null;

  if (item.variantId) {
    const q = Product.findOne({ _id: item.productId }, { variants: 1 });
    if (session) q.session(session);
    const prod = await q.lean();
    if (prod && Array.isArray(prod.variants)) {
      let colorId = null, sizeId = null, targetSize = null;
      for (const v of prod.variants) {
        const s = (v.sizes || []).find(sz => `${v.colorId}-${sz.sizeId}` === item.variantId || sz.sizeId === item.variantId);
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
        const updateOpts = {
          arrayFilters: [{ 'c.colorId': colorId }, { 's.sizeId': sizeId }],
          ...(session ? { session } : {})
        };
        await Product.updateOne(
          { _id: item.productId },
          { $inc: incFields },
          updateOpts
        );
        return item.productId.toString();
      }
    }
  }

  // Fallback: legacy/non-variant product
  await Product.findByIdAndUpdate(item.productId, {
    $inc: { stock: -item.quantity, soldCount: item.quantity }
  }, opts);
  return item.productId.toString();
};

/**
 * Restore stock for a single order item (called once when order is cancelled/rejected).
 * Mirrors deductOrderItem exactly. Returns productId string or null.
 */
const restoreOrderItem = async (item, session = null) => {
  const opts = session ? { session } : {};
  if (item.preMadeBundleId) {
    await PreMadeBundle.findByIdAndUpdate(item.preMadeBundleId, {
      $inc: { stock: item.quantity, soldCount: -item.quantity }
    }, opts);
    return null;
  }
  if (!item.productId) return null;

  if (item.variantId) {
    const q = Product.findOne({ _id: item.productId }, { variants: 1 });
    if (session) q.session(session);
    const prod = await q.lean();
    if (prod && Array.isArray(prod.variants)) {
      let colorId = null, sizeId = null, targetSize = null;
      for (const v of prod.variants) {
        const s = (v.sizes || []).find(sz => `${v.colorId}-${sz.sizeId}` === item.variantId || sz.sizeId === item.variantId);
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
        const updateOpts = {
          arrayFilters: [{ 'c.colorId': colorId }, { 's.sizeId': sizeId }],
          ...(session ? { session } : {})
        };
        await Product.updateOne(
          { _id: item.productId },
          { $inc: incFields },
          updateOpts
        );
        return item.productId.toString();
      }
    }
  }

  await Product.findByIdAndUpdate(item.productId, {
    $inc: { stock: item.quantity, soldCount: -item.quantity }
  }, opts);
  return item.productId.toString();
};

/**
 * Verify sufficient stock is available before re-deducting stock for an order.
 * Checks pre-made bundles, product variants, customization stock (tie/elastic/bridal), and regular products.
 * Aggregates quantities if the same item/variant appears multiple times in the order.
 */
const verifySufficientStockForOrder = async (order, session = null) => {
  const bundleDemands = new Map();
  const productVariantDemands = new Map();
  const simpleProductDemands = new Map();

  for (const item of (order.items || [])) {
    const qty = Math.max(1, Number(item.quantity) || 1);

    if (item.preMadeBundleId) {
      const bId = item.preMadeBundleId.toString();
      const existing = bundleDemands.get(bId) || { id: item.preMadeBundleId, name: item.productName || 'Bundle', qty: 0 };
      existing.qty += qty;
      bundleDemands.set(bId, existing);
      continue;
    }

    if (item.productId) {
      const pId = item.productId.toString();
      if (item.variantId) {
        const key = `${pId}:::${item.variantId}:::${item.selectedTieElastic || ''}:::${item.selectedBridalLength || ''}`;
        const existing = productVariantDemands.get(key) || {
          productId: item.productId,
          variantId: item.variantId,
          productName: item.productName || 'Product',
          tieElastic: item.selectedTieElastic,
          bridalLength: item.selectedBridalLength,
          qty: 0
        };
        existing.qty += qty;
        productVariantDemands.set(key, existing);
      } else {
        const existing = simpleProductDemands.get(pId) || { productId: item.productId, name: item.productName || 'Product', qty: 0 };
        existing.qty += qty;
        simpleProductDemands.set(pId, existing);
      }
    }
  }

  // Check pre-made bundles
  for (const demand of bundleDemands.values()) {
    const q = PreMadeBundle.findById(demand.id);
    if (session) q.session(session);
    const bundle = await q.lean();
    if (!bundle) {
      return { ok: false, message: `Pre-made bundle "${demand.name}" is no longer available` };
    }
    const currentStock = Number(bundle.stock) ?? 0;
    if (currentStock < demand.qty) {
      return {
        ok: false,
        message: `Insufficient stock for bundle "${bundle.name}". Available: ${currentStock}, requested: ${demand.qty}`
      };
    }
  }

  // Check simple products
  for (const demand of simpleProductDemands.values()) {
    const q = Product.findById(demand.productId);
    if (session) q.session(session);
    const prod = await q.lean();
    if (!prod || prod.isDeleted) {
      return { ok: false, message: `Product "${demand.name}" is no longer available` };
    }
    const currentStock = Number(prod.stock) ?? 0;
    if (currentStock < demand.qty) {
      return {
        ok: false,
        message: `Insufficient stock for "${prod.name}". Available: ${currentStock}, requested: ${demand.qty}`
      };
    }
  }

  // Check variant products
  for (const demand of productVariantDemands.values()) {
    const q = Product.findById(demand.productId);
    if (session) q.session(session);
    const prod = await q.lean();
    if (!prod || prod.isDeleted) {
      return { ok: false, message: `Product "${demand.productName}" is no longer available` };
    }

    let targetSize = null;
    let targetColor = null;
    if (Array.isArray(prod.variants)) {
      for (const v of prod.variants) {
        const s = (v.sizes || []).find(sz => `${v.colorId}-${sz.sizeId}` === demand.variantId || sz.sizeId === demand.variantId);
        if (s) {
          targetColor = v;
          targetSize = s;
          break;
        }
      }
    }

    if (!targetSize) {
      const currentStock = Number(prod.stock) ?? 0;
      if (currentStock < demand.qty) {
        return {
          ok: false,
          message: `Insufficient stock for "${prod.name}". Available: ${currentStock}, requested: ${demand.qty}`
        };
      }
      continue;
    }

    const sizeStock = Number(targetSize.stock) ?? 0;
    if (sizeStock < demand.qty) {
      const label = `${prod.name} (${targetColor?.color || ''} - ${targetSize.size || ''})`.trim();
      return {
        ok: false,
        message: `Insufficient stock for "${label}". Available: ${sizeStock}, requested: ${demand.qty}`
      };
    }

    if (demand.tieElastic === 'tie') {
      const tieStock = Number(targetSize.tieStock) ?? 0;
      if (tieStock < demand.qty) {
        return {
          ok: false,
          message: `Insufficient stock for "${prod.name}" Tie customization. Available: ${tieStock}, requested: ${demand.qty}`
        };
      }
    } else if (demand.tieElastic === 'elastic') {
      const elasticStock = Number(targetSize.elasticStock) ?? 0;
      if (elasticStock < demand.qty) {
        return {
          ok: false,
          message: `Insufficient stock for "${prod.name}" Elastic customization. Available: ${elasticStock}, requested: ${demand.qty}`
        };
      }
    }

    if (demand.bridalLength === 'bridal') {
      const bridalStock = Number(targetSize.bridalStock) ?? 0;
      if (bridalStock < demand.qty) {
        return {
          ok: false,
          message: `Insufficient stock for "${prod.name}" Bridal Length option. Available: ${bridalStock}, requested: ${demand.qty}`
        };
      }
    }
  }

  return { ok: true };
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
    fee: 350,
    estimatedDeliveryTime: '2 to 4 working days',
    isDefault: true,
    badgeText: 'Standard',
    description: 'Order processing time 24-48 hours after order placement.'
  }
};

export const resolveDeliveryOption = (optionKey) => {
  const normalizedKey = (optionKey || '').trim().toLowerCase();
  if (DELIVERY_OPTIONS[normalizedKey]) {
    return DELIVERY_OPTIONS[normalizedKey];
  }
  return DELIVERY_OPTIONS.tcs_express;
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
      const mainImg = normalizeSingleImageUrl(rawMainImg) || '';
      const finalVariantImg = normalizeSingleImageUrl(resolvedVariantImg) || null;
      const resolvedVariantImages = normalizeImageStringArray(finalVariantImages);

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
          image: finalVariantImg,
          images: resolvedVariantImages,
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
    const rawReceiptUrl = typeof receiptRes === 'string' ? receiptRes : receiptRes?.url;
    const canonicalReceiptUrl = resolveImageUrl(rawReceiptUrl) || rawReceiptUrl;
    const receiptProvider = typeof receiptRes === 'object' && receiptRes?.provider ? receiptRes.provider : 'r2';
    const receiptKey = typeof receiptRes === 'object' ? (receiptRes?.objectKey || receiptRes?.key) : extractImageKey(canonicalReceiptUrl);
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
        objectKey: receiptKey,
        publicId: receiptPublicId,
        url: canonicalReceiptUrl,
        imageUrl: canonicalReceiptUrl,
        r2Url: canonicalReceiptUrl,
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

/** Helper: normalize payment receipt to canonical Cloudflare R2 development URLs */
export const normalizeOrderReceipt = (orderObj) => {
  if (!orderObj) return orderObj;
  if (orderObj.paymentReceipt) {
    const pr = orderObj.paymentReceipt;
    const rawUrl = pr.url || pr.imageUrl || pr.r2Url;
    if (rawUrl) {
      const canonical = resolveImageUrl(rawUrl) || rawUrl;
      pr.url = canonical;
      pr.imageUrl = canonical;
      pr.r2Url = canonical;
      if (!pr.objectKey && (pr.key || canonical)) {
        pr.objectKey = pr.key || extractImageKey(canonical);
      }
    }
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
      const normalized = normalizeOrderReceipt(normalizeOrderShipping({ ...o }));
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

  const orderObj = normalizeOrderReceipt(normalizeOrderShipping(order.toObject ? order.toObject() : order));
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
  const rawReceiptUrl = typeof uploadRes === 'string' ? uploadRes : uploadRes?.url;
  const canonicalReceiptUrl = resolveImageUrl(rawReceiptUrl) || rawReceiptUrl;
  const receiptProvider = typeof uploadRes === 'object' && uploadRes?.provider ? uploadRes.provider : 'r2';
  const receiptKey = typeof uploadRes === 'object' ? (uploadRes?.objectKey || uploadRes?.key) : extractImageKey(canonicalReceiptUrl);
  const receiptPublicId = typeof uploadRes === 'object' ? uploadRes?.publicId : undefined;

  order.paymentReceipt = {
    provider: receiptProvider,
    key: receiptKey,
    objectKey: receiptKey,
    publicId: receiptPublicId,
    url: canonicalReceiptUrl,
    imageUrl: canonicalReceiptUrl,
    r2Url: canonicalReceiptUrl,
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

  // Reject on cancelled order: allow as idempotent no-op (ensure paymentStatus = failed, already cancelled)
  if (order.status === 'cancelled') {
    if (isVerified) {
      return next(new ApiError('Cannot verify payment for a cancelled order', 400));
    }
    if (order.paymentStatus !== 'failed') {
      await Order.updateOne({ _id: order._id }, { $set: { paymentStatus: 'failed' } });
      order.paymentStatus = 'failed';
    }
    return res.json(
      new ApiResponse(200, { order }, 'Payment already rejected for this order')
    );
  }

  const previousPaymentStatus = order.paymentStatus;
  const previousOrderStatus = order.status;

  // Idempotency: If payment is already verified and verify requested again
  if (isVerified && previousPaymentStatus === 'verified') {
    return res.json(
      new ApiResponse(200, { order }, 'Payment already verified for this order')
    );
  }

  // Idempotency: If payment already failed and order cancelled, and reject requested again
  if (!isVerified && previousPaymentStatus === 'failed' && previousOrderStatus === 'cancelled') {
    return res.json(
      new ApiResponse(200, { order }, 'Payment already rejected for this order')
    );
  }

  const updateFields = {};
  const pushFields = {};
  const adminId = req.admin?.id || req.admin?._id;

  if (isVerified) {
    updateFields.paymentStatus = 'verified';
    updateFields['paymentReceipt.verifiedAt'] = order.paymentReceipt.verifiedAt || new Date();
    if (adminId) {
      updateFields['paymentReceipt.verifiedBy'] = adminId;
    }

    // Auto-update order status to confirmed if still in received
    if (order.status === 'received') {
      updateFields.status = 'confirmed';
      updateFields.confirmedAt = order.confirmedAt || new Date();
      pushFields.statusHistory = {
        status: 'confirmed',
        note: 'Payment verified',
        updatedBy: adminId,
        timestamp: new Date()
      };
    }
  } else {
    // Reject payment and cancel the order
    if (['shipped', 'remain_undelivered', 'delivered'].includes(order.status)) {
      return next(new ApiError('Cannot reject payment for shipped or delivered orders', 400));
    }

    updateFields.paymentStatus = 'failed';

    if (order.status !== 'cancelled') {
      updateFields.status = 'cancelled';
      updateFields.cancelledAt = order.cancelledAt || new Date();
      pushFields.statusHistory = {
        status: 'cancelled',
        note: 'Payment rejected',
        updatedBy: adminId,
        timestamp: new Date()
      };
    }
  }

  const mongoUpdate = { $set: updateFields };
  if (Object.keys(pushFields).length > 0) {
    mongoUpdate.$push = pushFields;
  }

  // Use targeted update so payment verification only writes required fields and does not fail on unrelated product image metadata
  const updatedOrder = await Order.findByIdAndUpdate(
    order._id,
    mongoUpdate,
    { new: true, runValidators: false }
  );

  const finalOrder = updatedOrder || order;

  // Restore stock on payment rejection — guarded by stockDeducted/stockRestored flags
  if (!isVerified && finalOrder.status === 'cancelled') {
    await restoreAllStock(finalOrder);
  }

  // Send email notification only if state changed to prevent duplicate customer emails
  if (isVerified && previousPaymentStatus !== 'verified') {
    sendOrderConfirmedEmail(finalOrder).catch(err => console.error('Failed to send order confirmed email:', err.message));
  } else if (!isVerified && previousOrderStatus !== 'cancelled') {
    sendOrderCancelledEmail(finalOrder, 'Payment receipt rejected').catch(err => console.error('Failed to send order cancelled email:', err.message));
  }

  res.json(
    new ApiResponse(
      200,
      { order: finalOrder },
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

/**
 * Helper to check whether MongoDB transactions are supported in the current environment
 * (Transactions require a Replica Set or Sharded cluster).
 */
const supportsTransactions = () => {
  try {
    const topology = mongoose.connection?.client?.topology?.description;
    if (!topology) return false;
    const type = topology.type;
    return type === 'ReplicaSetWithPrimary' || type === 'Sharded';
  } catch (_) {
    return false;
  }
};

// @route   POST /api/admin/orders/:orderId/revert-payment-rejection
// @desc    Revert payment rejection and return order to pending verification
// @access  Private (Admin)
export const revertPaymentRejection = asyncHandler(async (req, res, next) => {
  const orderIdentifier = (req.params.orderId || req.params.id || '').trim();
  const reason = (req.body.reason || '').trim();

  if (!reason) {
    return next(new ApiError('Reason is required to revert payment rejection', 400));
  }

  if (!orderIdentifier) {
    return next(new ApiError('Order ID is required', 400));
  }

  // 1. Distributed/memory lock to prevent race conditions & duplicate executions
  const lockKey = `order_revert_rejection_${orderIdentifier}`;
  const lockAcquired = await rateLimiterService.acquireLock(lockKey, 20);
  if (!lockAcquired) {
    return next(new ApiError('A reversal operation is already in progress for this order. Please wait a moment.', 409));
  }

  try {
    const isObjectId = mongoose.Types.ObjectId.isValid(orderIdentifier) && /^[0-9a-fA-F]{24}$/.test(orderIdentifier);
    const query = isObjectId ? { $or: [{ _id: orderIdentifier }, { orderId: orderIdentifier }] } : { orderId: orderIdentifier };

    const order = await Order.findOne(query);

    if (!order) {
      return next(new ApiError('Order not found', 404));
    }

    // 2. Eligibility checks
    if (order.isDeleted) {
      return next(new ApiError('Cannot revert payment rejection for a deleted order', 400));
    }

    if (order.paymentStatus !== 'failed') {
      return next(new ApiError(
        `Payment is not in rejected/failed state (current payment status: "${order.paymentStatus}"). Only orders with rejected payments can be reverted.`,
        400
      ));
    }

    if (order.status !== 'cancelled') {
      return next(new ApiError(
        `Order is not cancelled (current status: "${order.status}"). Only cancelled orders whose payments were rejected can be reverted.`,
        400
      ));
    }

    if (!order.paymentReceipt || (!order.paymentReceipt.url && !order.paymentReceipt.imageUrl && !order.paymentReceipt.key)) {
      return next(new ApiError('Order does not have a payment receipt to revert verification for', 400));
    }

    // Verify cancellation was caused by payment rejection
    const statusHistory = Array.isArray(order.statusHistory) ? order.statusHistory : [];
    const hasRejectionEntry = statusHistory.some(
      (h) => h.status === 'cancelled' && (
        (h.note && /payment.*reject|reject.*payment|receipt.*reject/i.test(h.note))
      )
    );

    const lastCancellationWithNote = [...statusHistory]
      .reverse()
      .find((h) => h.status === 'cancelled' && h.note);

    if (lastCancellationWithNote && !/payment.*reject|reject.*payment|receipt.*reject/i.test(lastCancellationWithNote.note)) {
      return next(new ApiError(
        `Order was cancelled for an unrelated reason ("${lastCancellationWithNote.note}"). Reverting payment rejection is not allowed.`,
        400
      ));
    }

    if (!hasRejectionEntry && (!lastCancellationWithNote || !/payment.*reject|reject.*payment|receipt.*reject/i.test(lastCancellationWithNote.note))) {
      return next(new ApiError(
        'This order was not cancelled due to payment rejection and cannot be restored via this endpoint',
        400
      ));
    }

    // 3. Determine target pre-rejection status in order lifecycle
    let targetStatus = 'received';
    for (let i = statusHistory.length - 1; i >= 0; i--) {
      const entry = statusHistory[i];
      if (entry && entry.status && entry.status !== 'cancelled') {
        targetStatus = entry.status;
        break;
      }
    }
    // In order lifecycle, an awaiting-verification order cannot be confirmed, processing, shipped, etc.
    if (['confirmed', 'processing', 'shipped', 'remain_undelivered', 'delivered'].includes(targetStatus)) {
      targetStatus = 'received';
    }

    // 4. Inventory Handling
    // If stock was restored during rejection/cancellation, deduct it again to reserve it
    // If stock was not restored, do not deduct it again
    const stockWasRestored = Boolean(order.stockRestored);

    if (stockWasRestored) {
      const stockCheck = await verifySufficientStockForOrder(order);
      if (!stockCheck.ok) {
        return next(new ApiError(`Insufficient inventory to revert rejection: ${stockCheck.message}`, 400));
      }
    }

    // 5. Atomic execution with transaction support (where supported)
    let session = null;
    const useTransaction = supportsTransactions();
    if (useTransaction) {
      try {
        session = await mongoose.startSession();
        session.startTransaction();
      } catch (txStartErr) {
        if (session) {
          try { await session.endSession(); } catch (_) { }
          session = null;
        }
      }
    }

    const deductedItems = [];
    const touchedProductIds = new Set();

    try {
      if (stockWasRestored) {
        for (const item of order.items) {
          const pId = await deductOrderItem(item, session);
          deductedItems.push(item);
          if (pId) touchedProductIds.add(pId);
        }
        for (const productId of touchedProductIds) {
          await recomputeProductStock(productId, session);
        }
        order.stockRestored = false;
        order.stockDeducted = true;
      }

      // Restore payment and order status
      order.paymentStatus = 'pending';
      order.status = targetStatus;
      order.cancelledAt = null;

      // Add status history entry recording reversal
      order.statusHistory.push({
        status: targetStatus,
        timestamp: new Date(),
        note: `Payment rejection reverted: ${reason}`,
        updatedBy: req.admin?._id || req.admin?.id
      });

      const saveOpts = session ? { session } : {};
      await order.save(saveOpts);

      if (session && session.inTransaction()) {
        await session.commitTransaction();
      }
    } catch (saveError) {
      if (session && session.inTransaction()) {
        try { await session.abortTransaction(); } catch (_) { }
      } else if (!session && stockWasRestored && deductedItems.length > 0) {
        // Compensating rollback for standalone database
        try {
          for (const item of deductedItems) {
            await restoreOrderItem(item);
          }
          for (const productId of touchedProductIds) {
            await recomputeProductStock(productId);
          }
        } catch (compensateErr) {
          console.error('Failed to rollback deducted items on standalone db:', compensateErr);
        }
      }
      throw saveError;
    } finally {
      if (session) {
        try { await session.endSession(); } catch (_) { }
      }
    }

    // Flush cache so admin dashboard updates immediately
    cacheService.flushAll();

    // 6. Response
    res.status(200).json(
      new ApiResponse(200, {
        orderId: order.orderId,
        orderMongoId: order._id,
        paymentStatus: order.paymentStatus,
        status: order.status,
        inventoryReservation: {
          action: stockWasRestored ? 're_deducted' : 'unchanged',
          stockRestored: order.stockRestored,
          stockDeducted: order.stockDeducted,
          details: stockWasRestored
            ? 'Stock successfully re-deducted and reserved for this order'
            : 'Stock was not previously restored; inventory remained reserved'
        },
        order
      }, 'Payment rejection reverted successfully. Order returned to pending verification.')
    );
  } finally {
    await rateLimiterService.releaseLock(lockKey);
  }
});



