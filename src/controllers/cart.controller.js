import mongoose from 'mongoose';
import Cart from '../models/Cart.js';
import Product from '../models/Product.js';
import PreMadeBundle from '../models/PreMadeBundle.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { getBundleRule, computeLineWithBundle } from '../utils/bundlePricing.js';

const RESERVATION_MINUTES = 10;

async function buildCartResponse(cart) {
  if (!cart) return { cart: null, subtotal: 0, subtotalIfBoughtSeparately: 0, shipping: 0, total: 0, totalIfBoughtSeparately: 0, itemCount: 0 };
  let subtotal = 0;
  let subtotalIfBoughtSeparately = 0;
  const itemsWithBundle = [];
  for (const item of cart.items) {
    const quantity = item.quantity || 1;
    if (item.preMadeBundleId) {
      const price = item.price ?? item.preMadeBundleId?.price ?? 0;
      const lineTotal = price * quantity;
      subtotal += lineTotal;
      subtotalIfBoughtSeparately += lineTotal;
      itemsWithBundle.push({
        ...item.toObject(),
        itemType: 'preMadeBundle',
        originalPrice: price,
        originalLineTotal: lineTotal,
        effectiveLineTotal: lineTotal,
        savings: 0,
        bundleRule: null
      });
      continue;
    }
    const baseUnitPrice = item.price ?? item.productId?.price ?? 0;
    const bridalExtra = (item.selectedBridalLength === 'bridal') ? (Number(item.bridalLengthPrice) || 0) : 0;
    const unitPrice = baseUnitPrice + bridalExtra;
    const productIdForRule = item.productId && (item.productId._id ?? item.productId);
    const variantIdForRule = item.variantId != null && String(item.variantId).trim() !== '' ? item.variantId : null;
    const rule = productIdForRule && variantIdForRule
      ? await getBundleRule(productIdForRule, variantIdForRule)
      : null;
    const computed = computeLineWithBundle(unitPrice, quantity, rule);
    subtotal += computed.effectiveLineTotal;
    subtotalIfBoughtSeparately += computed.originalLineTotal;
    itemsWithBundle.push({
      ...item.toObject(),
      itemType: 'product',
      originalPrice: unitPrice,
      originalLineTotal: computed.originalLineTotal,
      effectiveLineTotal: computed.effectiveLineTotal,
      savings: computed.savings,
      bundleRule: rule && computed.bundleApplied ? { ruleQuantity: rule.ruleQuantity, ruleDiscountAmount: rule.ruleDiscountAmount } : null
    });
  }
  const shipping = subtotal > 5000 ? 0 : 250;
  const shippingIfBoughtSeparately = subtotalIfBoughtSeparately > 5000 ? 0 : 250;
  const total = subtotal + shipping;
  const totalIfBoughtSeparately = subtotalIfBoughtSeparately + shippingIfBoughtSeparately;
  const itemCount = cart.items.reduce((s, i) => s + (i.quantity || 1), 0);
  return {
    cart: { ...cart.toObject(), items: itemsWithBundle },
    subtotal,
    subtotalIfBoughtSeparately,
    shipping,
    total,
    totalIfBoughtSeparately,
    itemCount
  };
}

const getReservedQuantity = async (productId, excludeUserId, variantId = null) => {
  const now = new Date();
  const match = {
    'items.productId': new mongoose.Types.ObjectId(productId),
    'items.reservedUntil': { $gt: now }
  };
  if (variantId) {
    match['items.variantId'] = variantId;
  } else {
    match.$or = [
      { 'items.variantId': null },
      { 'items.variantId': { $exists: false } }
    ];
  }

  if (excludeUserId) {
    match.userId = { $ne: new mongoose.Types.ObjectId(excludeUserId) };
  }

  const results = await Cart.aggregate([
    { $unwind: '$items' },
    { $match: match },
    { $group: { _id: null, total: { $sum: '$items.quantity' } } }
  ]);

  return results[0]?.total || 0;
};

// @route   GET /api/cart
// @desc    Get user's cart (with bundle discount applied per item when rule conditions met)
// @access  Private
export const getCart = asyncHandler(async (req, res) => {
  let cart = await Cart.findOne({ userId: req.user.id })
    .populate({
      path: 'items.productId',
      select: 'name slug price originalPrice compareAtPrice images stock stockStatus colors sizes variants status'
    })
    .populate({
      path: 'items.preMadeBundleId',
      select: 'name slug price compareAtPrice images status'
    });

  if (!cart) {
    cart = await Cart.create({
      userId: req.user.id,
      items: []
    });
  }

  const validItems = cart.items.filter(item => {
    if (item.preMadeBundleId) {
      return item.preMadeBundleId.status === 'active';
    }
    return item.productId && item.productId.status === 'active' && !item.productId.isDeleted;
  });

  if (validItems.length !== cart.items.length) {
    cart.items = validItems;
    await cart.save();
  }

  const payload = await buildCartResponse(cart);
  res.json(
    new ApiResponse(200, payload, 'Cart retrieved successfully')
  );
});

// @route   POST /api/cart/add
// @desc    Add product or pre-made bundle to cart
// @access  Private
export const addToCart = asyncHandler(async (req, res, next) => {
  const { productId, preMadeBundleId, quantity = 1, selectedColor, selectedSize, variantId, selectedTieElastic, selectedBridalLength, bridalLengthPrice } = req.body;

  if (quantity < 1) {
    return next(new ApiError('Quantity must be at least 1', 400));
  }

  if (preMadeBundleId) {
    const bundle = await PreMadeBundle.findOne({ _id: preMadeBundleId, status: 'active' });
    if (!bundle) {
      return next(new ApiError('Pre-made bundle not found or inactive', 404));
    }
    const bundleStock = Number(bundle.stock) ?? 0;
    let cart = await Cart.findOne({ userId: req.user.id });
    if (!cart) {
      cart = await Cart.create({ userId: req.user.id, items: [] });
    }
    const existingIndex = cart.items.findIndex(item => item.preMadeBundleId?.toString() === preMadeBundleId);
    const newQty = existingIndex > -1 ? cart.items[existingIndex].quantity + quantity : quantity;
    if (bundleStock < newQty) {
      return next(new ApiError(`Insufficient stock for ${bundle.name}. Available: ${bundleStock}, requested: ${newQty}`, 400));
    }
    if (existingIndex > -1) {
      cart.items[existingIndex].quantity += quantity;
    } else {
      cart.items.push({
        productId: null,
        preMadeBundleId: bundle._id,
        quantity,
        price: bundle.price,
        addedAt: new Date()
      });
    }
    await cart.save();
    cart = await Cart.findById(cart._id)
      .populate('items.productId', 'name slug price originalPrice compareAtPrice images stock stockStatus colors sizes variants status')
      .populate('items.preMadeBundleId', 'name slug price compareAtPrice images status');
    const payload = await buildCartResponse(cart);
    return res.status(201).json(
      new ApiResponse(201, payload, 'Added to cart')
    );
  }

  if (!productId) {
    return next(new ApiError('productId or preMadeBundleId is required', 400));
  }

  const product = await Product.findOne({ _id: productId, isDeleted: { $ne: true } });
  if (!product) {
    return next(new ApiError('Product not found', 404));
  }

  // If variantId provided, validate variant stock/price
  // variantId format: `${colorId}-${sizeId}` (colorId/sizeId may contain hyphens, e.g. dusty-rose, one-size)
  let chosenColorVariant = null;
  let chosenSize = null;
  if (variantId && Array.isArray(product.variants)) {
    for (const v of product.variants) {
      if (v.isActive === false) continue;
      const size = (v.sizes || []).find(s => `${v.colorId}-${s.sizeId}` === variantId && s.isActive !== false);
      if (size) {
        chosenColorVariant = v;
        chosenSize = size;
        break;
      }
    }
    if (!chosenColorVariant || !chosenSize) {
      return next(new ApiError('Color variant not found', 404));
    }
    if (chosenSize.stock < quantity || chosenSize.stock === 0) {
      return next(new ApiError('Variant is out of stock or insufficient quantity', 400));
    }
  } else {
    // Check stock for product-level (fallback)
    if (product.stockStatus === 'out_of_stock' || product.stock < quantity) {
      return next(new ApiError('Product is out of stock or insufficient quantity', 400));
    }
  }

  let cart = await Cart.findOne({ userId: req.user.id });

  if (!cart) {
    cart = await Cart.create({
      userId: req.user.id,
      items: []
    });
  }

  const reservedByOthers = await getReservedQuantity(productId, req.user.id, variantId || null);
  const availableForUser = Math.max((chosenSize?.stock ?? product.stock) - reservedByOthers, 0);
  const reservationUntil = new Date(Date.now() + RESERVATION_MINUTES * 60 * 1000);

  // Check if product already in cart (with same variant)
  const existingItemIndex = cart.items.findIndex(
    item => item.productId.toString() === productId &&
            item.selectedColor === selectedColor &&
            item.selectedSize === selectedSize &&
            item.variantId === (variantId || null) &&
            (item.selectedTieElastic || null) === (selectedTieElastic || null) &&
            (item.selectedBridalLength || null) === (selectedBridalLength || null)
  );

  if (existingItemIndex > -1) {
    // Update quantity if already in cart
    const newQuantity = cart.items[existingItemIndex].quantity + quantity;
    
    // Check if new quantity exceeds stock
    if (newQuantity > availableForUser) {
      return next(new ApiError(`Only ${availableForUser} items available in stock`, 400));
    }
    
    cart.items[existingItemIndex].quantity = newQuantity;
    // Update price from size variant if present, else product price
    cart.items[existingItemIndex].price = chosenSize ? (chosenSize.price ?? product.price) : product.price;
    cart.items[existingItemIndex].selectedTieElastic = selectedTieElastic || null;
    cart.items[existingItemIndex].selectedBridalLength = selectedBridalLength || null;
    cart.items[existingItemIndex].bridalLengthPrice = Number(bridalLengthPrice) || 0;
    cart.items[existingItemIndex].reservedUntil = reservationUntil;
  } else {
    if (quantity > availableForUser) {
      return next(new ApiError(`Only ${availableForUser} items available in stock`, 400));
    }
    // Add new item to cart (include variant snapshot if applicable)
    const itemToPush = {
      productId,
      quantity,
      price: chosenSize ? (chosenSize.price ?? product.price) : product.price,
      selectedColor: selectedColor || (chosenColorVariant?.color || null),
      selectedSize: selectedSize || (chosenSize?.size || null),
      selectedTieElastic: selectedTieElastic || null,
      selectedBridalLength: selectedBridalLength || null,
      bridalLengthPrice: Number(bridalLengthPrice) || 0,
      addedAt: new Date(),
      reservedUntil: reservationUntil,
      variantId: variantId || null,
      variantSnapshot: (chosenColorVariant && chosenSize) ? {
        sku: chosenSize.sku || null,
        price: chosenSize.price || null,
        image: chosenColorVariant.images?.[0]?.url || null,
        color: chosenColorVariant.color || null,
        size: chosenSize.size || null,
        specs: chosenColorVariant.specs || null,
        hasTieElastic: chosenSize.hasTieElastic || false,
        hasBridalLength: chosenSize.hasBridalLength || false,
        bridalLengthPrice: chosenSize.bridalLengthPrice || 0
      } : null
    };

    cart.items.push(itemToPush);
  }

  await cart.save();

  cart = await Cart.findById(cart._id)
    .populate('items.productId', 'name slug price originalPrice compareAtPrice images stock stockStatus colors sizes variants status')
    .populate('items.preMadeBundleId', 'name slug price compareAtPrice images status');
  const payload = await buildCartResponse(cart);
  res.status(201).json(
    new ApiResponse(201, payload, 'Product added to cart')
  );
});

// @route   PUT /api/cart/update/:itemId
// @desc    Update cart item quantity
// @access  Private
export const updateCartItem = asyncHandler(async (req, res, next) => {
  const { itemId } = req.params;
  const { quantity } = req.body;

  if (quantity < 1) {
    return next(new ApiError('Quantity must be at least 1', 400));
  }

  const cart = await Cart.findOne({ userId: req.user.id });

  if (!cart) {
    return next(new ApiError('Cart not found', 404));
  }

  const item = cart.items.id(itemId);

  if (!item) {
    return next(new ApiError('Item not found in cart', 404));
  }

  if (item.preMadeBundleId) {
    const bundle = await PreMadeBundle.findOne({ _id: item.preMadeBundleId, status: 'active' });
    if (!bundle) {
      return next(new ApiError('Pre-made bundle not found or inactive', 404));
    }
    const bundleStock = Number(bundle.stock) ?? 0;
    if (bundleStock < quantity) {
      return next(new ApiError(`Insufficient stock for ${bundle.name}. Available: ${bundleStock}, requested: ${quantity}`, 400));
    }
    item.quantity = quantity;
    await cart.save();
    const populatedCart = await Cart.findById(cart._id)
      .populate('items.productId', 'name slug price originalPrice compareAtPrice images stock stockStatus colors sizes variants status')
      .populate('items.preMadeBundleId', 'name slug price compareAtPrice images status stock');
    const payload = await buildCartResponse(populatedCart);
    return res.json(new ApiResponse(200, payload, 'Cart updated successfully'));
  }

  // Check stock availability (product)
  const product = await Product.findById(item.productId);
  if (!product) {
    return next(new ApiError('Product not found', 404));
  }

  let colorV = null;
  let sizeV = null;
  if (item.variantId && (product.variants || []).length) {
    for (const v of product.variants || []) {
      const s = (v.sizes || []).find(sz => `${v.colorId}-${sz.sizeId}` === item.variantId);
      if (s) {
        colorV = v;
        sizeV = s;
        break;
      }
    }
  }
  const chosenVariant = sizeV ? { ...sizeV, price: sizeV.price, stock: sizeV.stock } : null;
  if (item.variantId && !chosenVariant) {
    return next(new ApiError('Variant not found', 404));
  }

  const reservedByOthers = await getReservedQuantity(item.productId, req.user.id, item.variantId || null);
  const availableForUser = Math.max((chosenVariant?.stock ?? product.stock) - reservedByOthers, 0);
  if (quantity > availableForUser) {
    return next(new ApiError(`Only ${availableForUser} items available in stock`, 400));
  }

  item.quantity = quantity;
  item.price = chosenVariant ? (chosenVariant.price ?? product.price) : product.price;
  item.reservedUntil = new Date(Date.now() + RESERVATION_MINUTES * 60 * 1000);
  await cart.save();

  const populatedCart = await Cart.findById(cart._id)
    .populate('items.productId', 'name slug price originalPrice compareAtPrice images stock stockStatus colors sizes variants status')
    .populate('items.preMadeBundleId', 'name slug price compareAtPrice images status');
  const payload = await buildCartResponse(populatedCart);
  res.json(
    new ApiResponse(200, payload, 'Cart updated successfully')
  );
});

// @route   DELETE /api/cart/remove/:itemId
// @desc    Remove item from cart
// @access  Private
export const removeFromCart = asyncHandler(async (req, res, next) => {
  const { itemId } = req.params;

  const cart = await Cart.findOne({ userId: req.user.id });

  if (!cart) {
    return next(new ApiError('Cart not found', 404));
  }

  const itemIndex = cart.items.findIndex(item => item._id.toString() === itemId);

  if (itemIndex === -1) {
    return next(new ApiError('Item not found in cart', 404));
  }

  cart.items.splice(itemIndex, 1);
  await cart.save();

  const populatedCart = await Cart.findById(cart._id)
    .populate('items.productId', 'name slug price originalPrice compareAtPrice images stock stockStatus colors sizes variants status')
    .populate('items.preMadeBundleId', 'name slug price compareAtPrice images status');
  const payload = await buildCartResponse(populatedCart);
  res.json(
    new ApiResponse(200, payload, 'Item removed from cart')
  );
});

// @route   DELETE /api/cart/clear
// @desc    Clear entire cart
// @access  Private
export const clearCart = asyncHandler(async (req, res, next) => {
  const cart = await Cart.findOne({ userId: req.user.id });

  if (!cart) {
    return next(new ApiError('Cart not found', 404));
  }

  cart.items = [];
  await cart.save();
  const payload = await buildCartResponse(cart);
  res.json(
    new ApiResponse(200, payload, 'Cart cleared successfully')
  );
});

// @route   POST /api/cart/sync
// @desc    Sync local cart with database cart (when user logs in)
// @access  Private
export const syncCart = asyncHandler(async (req, res, next) => {
  const { items } = req.body;

  if (!Array.isArray(items)) {
    return next(new ApiError('Items must be an array', 400));
  }

  let cart = await Cart.findOne({ userId: req.user.id });

  if (!cart) {
    cart = await Cart.create({
      userId: req.user.id,
      items: []
    });
  }

  for (const localItem of items) {
    if (localItem.preMadeBundleId) {
      const bundle = await PreMadeBundle.findOne({ _id: localItem.preMadeBundleId, status: 'active' });
      if (!bundle) continue;
      const existingIdx = cart.items.findIndex(i => i.preMadeBundleId?.toString() === localItem.preMadeBundleId);
      if (existingIdx > -1) {
        cart.items[existingIdx].quantity = Math.max(cart.items[existingIdx].quantity, localItem.quantity || 1);
      } else {
        cart.items.push({
          productId: null,
          preMadeBundleId: bundle._id,
          quantity: localItem.quantity || 1,
          price: bundle.price,
          addedAt: new Date()
        });
      }
      continue;
    }
    if (!localItem.productId) continue;

    const product = await Product.findOne({ _id: localItem.productId, isDeleted: { $ne: true } });
    if (!product || product.status !== 'active') continue;

    const localVariantId = localItem.variantId || null;
    let colorV = null;
    let sizeV = null;
    if (localVariantId && (product.variants || []).length) {
      for (const v of product.variants || []) {
        const s = (v.sizes || []).find(sz => `${v.colorId}-${sz.sizeId}` === localVariantId);
        if (s) {
          colorV = v;
          sizeV = s;
          break;
        }
      }
    }
    const chosenVariant = sizeV ? { ...sizeV, stock: sizeV.stock } : null;
    if (localVariantId && !chosenVariant) continue;

    const reservedByOthers = await getReservedQuantity(product._id, req.user.id, localVariantId);
    const availableForUser = Math.max((chosenVariant?.stock ?? product.stock) - reservedByOthers, 0);
    const reservationUntil = new Date(Date.now() + RESERVATION_MINUTES * 60 * 1000);

    const existingItemIndex = cart.items.findIndex(
      item => item.productId?.toString() === localItem.productId &&
              item.selectedColor === localItem.selectedColor &&
              item.selectedSize === localItem.selectedSize &&
              item.variantId === (localVariantId || null)
    );

    if (existingItemIndex > -1) {
      const mergedQuantity = Math.max(cart.items[existingItemIndex].quantity, localItem.quantity);
      cart.items[existingItemIndex].quantity = Math.min(mergedQuantity, availableForUser);
      cart.items[existingItemIndex].price = chosenVariant ? (chosenVariant.price ?? product.price) : product.price;
      cart.items[existingItemIndex].reservedUntil = reservationUntil;
    } else {
      if (availableForUser <= 0) continue;
      cart.items.push({
        productId: localItem.productId,
        quantity: Math.min(localItem.quantity, availableForUser),
        price: chosenVariant ? (chosenVariant.price ?? product.price) : product.price,
        selectedColor: localItem.selectedColor || colorV?.color || null,
        selectedSize: localItem.selectedSize || sizeV?.size || null,
        reservedUntil: reservationUntil,
        variantId: localVariantId || null,
        variantSnapshot: colorV && sizeV ? {
          sku: sizeV.sku || null,
          price: sizeV.price || null,
          image: colorV.images?.[0]?.url || null,
          color: colorV.color || null,
          size: sizeV.size || null,
          specs: colorV.specs || null
        } : null
      });
    }
  }

  await cart.save();

  cart = await Cart.findById(cart._id)
    .populate('items.productId', 'name slug price originalPrice compareAtPrice images stock stockStatus colors sizes variants status')
    .populate('items.preMadeBundleId', 'name slug price compareAtPrice images status');
  const payload = await buildCartResponse(cart);
  res.json(
    new ApiResponse(200, payload, 'Cart synced successfully')
  );
});

