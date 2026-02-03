import mongoose from 'mongoose';
import Cart from '../models/Cart.js';
import Product from '../models/Product.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

const RESERVATION_MINUTES = 10;

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
// @desc    Get user's cart
// @access  Private
export const getCart = asyncHandler(async (req, res) => {
  let cart = await Cart.findOne({ userId: req.user.id })
    .populate({
      path: 'items.productId',
      select: 'name slug price originalPrice compareAtPrice images stock stockStatus colors sizes status'
    });

  if (!cart) {
    cart = await Cart.create({
      userId: req.user.id,
      items: []
    });
  }

  // Filter out products that no longer exist, are inactive, or soft-deleted
  const validItems = cart.items.filter(item => 
    item.productId && 
    item.productId.status === 'active' &&
    !item.productId.isDeleted
  );
  
  // Update cart if items were filtered out
  if (validItems.length !== cart.items.length) {
    cart.items = validItems;
    await cart.save();
  }

  const totals = cart.calculateTotals();

  res.json(
    new ApiResponse(200, { 
      cart,
      ...totals
    }, 'Cart retrieved successfully')
  );
});

// @route   POST /api/cart/add
// @desc    Add product to cart
// @access  Private
export const addToCart = asyncHandler(async (req, res, next) => {
  const { productId, quantity = 1, selectedColor, selectedSize, variantId } = req.body;

  // Validate quantity
  if (quantity < 1) {
    return next(new ApiError('Quantity must be at least 1', 400));
  }

  // Check if product exists and is not soft-deleted
  const product = await Product.findOne({ _id: productId, isDeleted: { $ne: true } });
  if (!product) {
    return next(new ApiError('Product not found', 404));
  }

  // If variantId provided, validate variant stock/price
  // variantId format: `${colorId}-${sizeId}`
  let chosenColorVariant = null;
  let chosenSize = null;
  if (variantId && Array.isArray(product.variants)) {
    const [colorId, sizeId] = variantId.split('-');
    chosenColorVariant = product.variants.find(v => v.colorId === colorId && v.isActive !== false);
    if (!chosenColorVariant) {
      return next(new ApiError('Color variant not found', 404));
    }
    chosenSize = (chosenColorVariant.sizes || []).find(s => s.sizeId === sizeId && s.isActive !== false);
    if (!chosenSize) {
      return next(new ApiError('Size variant not found', 404));
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
            item.variantId === (variantId || null)
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
      addedAt: new Date(),
      reservedUntil: reservationUntil,
      variantId: variantId || null,
      variantSnapshot: (chosenColorVariant && chosenSize) ? {
        sku: chosenSize.sku || null,
        price: chosenSize.price || null,
        image: chosenColorVariant.images?.[0]?.url || null,
        color: chosenColorVariant.color || null,
        size: chosenSize.size || null,
        specs: chosenColorVariant.specs || null
      } : null
    };

    cart.items.push(itemToPush);
  }

  await cart.save();

  cart = await Cart.findById(cart._id)
    .populate({
      path: 'items.productId',
      select: 'name slug price originalPrice compareAtPrice images stock stockStatus colors sizes status'
    });

  const totals = cart.calculateTotals();

  res.status(201).json(
    new ApiResponse(201, { 
      cart,
      ...totals
    }, 'Product added to cart')
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

  // Check stock availability
  const product = await Product.findById(item.productId);
  if (!product) {
    return next(new ApiError('Product not found', 404));
  }

  const chosenVariant = item.variantId && Array.isArray(product.variants)
    ? product.variants.find(v => v.variantId === item.variantId && v.isActive !== false)
    : null;
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

  await cart.populate({
    path: 'items.productId',
    select: 'name slug price originalPrice compareAtPrice images stock stockStatus colors sizes status'
  });

  const totals = cart.calculateTotals();

  res.json(
    new ApiResponse(200, { 
      cart,
      ...totals
    }, 'Cart updated successfully')
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

  await cart.populate({
    path: 'items.productId',
    select: 'name slug price originalPrice compareAtPrice images stock stockStatus colors sizes status'
  });

  const totals = cart.calculateTotals();

  res.json(
    new ApiResponse(200, { 
      cart,
      ...totals
    }, 'Item removed from cart')
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

  const totals = cart.calculateTotals();

  res.json(
    new ApiResponse(200, { 
      cart,
      ...totals
    }, 'Cart cleared successfully')
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

  // Process each item from local cart
  for (const localItem of items) {
    const product = await Product.findOne({ _id: localItem.productId, isDeleted: { $ne: true } });
    
    if (!product || product.status !== 'active') {
      continue; // Skip invalid or soft-deleted products
    }

    const localVariantId = localItem.variantId || null;
    const chosenVariant = localVariantId && Array.isArray(product.variants)
      ? product.variants.find(v => v.variantId === localVariantId && v.isActive !== false)
      : null;
    if (localVariantId && !chosenVariant) {
      continue;
    }

    const reservedByOthers = await getReservedQuantity(product._id, req.user.id, localVariantId);
    const availableForUser = Math.max((chosenVariant?.stock ?? product.stock) - reservedByOthers, 0);
    const reservationUntil = new Date(Date.now() + RESERVATION_MINUTES * 60 * 1000);

    // Check if item already exists in DB cart (with same variant)
    const existingItemIndex = cart.items.findIndex(
      item => item.productId.toString() === localItem.productId &&
              item.selectedColor === localItem.selectedColor &&
              item.selectedSize === localItem.selectedSize &&
              item.variantId === (localVariantId || null)
    );

    if (existingItemIndex > -1) {
      // Merge quantities (take max to avoid losing items)
      const mergedQuantity = Math.max(
        cart.items[existingItemIndex].quantity,
        localItem.quantity
      );
      cart.items[existingItemIndex].quantity = Math.min(mergedQuantity, availableForUser);
      cart.items[existingItemIndex].price = chosenVariant ? (chosenVariant.price ?? product.price) : product.price;
      cart.items[existingItemIndex].reservedUntil = reservationUntil;
    } else {
      if (availableForUser <= 0) {
        continue;
      }
      // Add new item from local cart
      cart.items.push({
        productId: localItem.productId,
        quantity: Math.min(localItem.quantity, availableForUser), // Respect stock limits
        price: chosenVariant ? (chosenVariant.price ?? product.price) : product.price,
        selectedColor: localItem.selectedColor || null,
        selectedSize: localItem.selectedSize || null,
        reservedUntil: reservationUntil,
        variantId: localVariantId || null,
        variantSnapshot: chosenVariant ? {
          sku: chosenVariant.sku || null,
          price: chosenVariant.price || null,
          image: chosenVariant.images?.[0]?.url || null,
          color: chosenVariant.color || null,
          size: chosenVariant.size || null,
          specs: chosenVariant.specs || null
        } : null
      });
    }
  }

  await cart.save();

  cart = await Cart.findById(cart._id)
    .populate({
      path: 'items.productId',
      select: 'name slug price originalPrice compareAtPrice images stock stockStatus colors sizes status'
    });

  const totals = cart.calculateTotals();

  res.json(
    new ApiResponse(200, { 
      cart,
      ...totals
    }, 'Cart synced successfully')
  );
});

