import Cart from '../models/Cart.js';
import Product from '../models/Product.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

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

  // Filter out products that no longer exist or are inactive
  const validItems = cart.items.filter(item => 
    item.productId && item.productId.status === 'active'
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
  const { productId, quantity = 1, selectedColor, selectedSize } = req.body;

  // Validate quantity
  if (quantity < 1) {
    return next(new ApiError('Quantity must be at least 1', 400));
  }

  // Check if product exists
  const product = await Product.findById(productId);
  if (!product) {
    return next(new ApiError('Product not found', 404));
  }

  // Check stock
  if (product.stockStatus === 'out_of_stock' || product.stock < quantity) {
    return next(new ApiError('Product is out of stock or insufficient quantity', 400));
  }

  let cart = await Cart.findOne({ userId: req.user.id });

  if (!cart) {
    cart = await Cart.create({
      userId: req.user.id,
      items: []
    });
  }

  // Check if product already in cart (with same variant)
  const existingItemIndex = cart.items.findIndex(
    item => item.productId.toString() === productId &&
            item.selectedColor === selectedColor &&
            item.selectedSize === selectedSize
  );

  if (existingItemIndex > -1) {
    // Update quantity if already in cart
    const newQuantity = cart.items[existingItemIndex].quantity + quantity;
    
    // Check if new quantity exceeds stock
    if (newQuantity > product.stock) {
      return next(new ApiError(`Only ${product.stock} items available in stock`, 400));
    }
    
    cart.items[existingItemIndex].quantity = newQuantity;
    cart.items[existingItemIndex].price = product.price; // Update price in case it changed
  } else {
    // Add new item to cart
    cart.items.push({
      productId,
      quantity,
      price: product.price,
      selectedColor: selectedColor || null,
      selectedSize: selectedSize || null,
      addedAt: new Date()
    });
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

  if (quantity > product.stock) {
    return next(new ApiError(`Only ${product.stock} items available in stock`, 400));
  }

  item.quantity = quantity;
  item.price = product.price; // Update price in case it changed
  
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
    const product = await Product.findById(localItem.productId);
    
    if (!product || product.status !== 'active') {
      continue; // Skip invalid products
    }

    // Check if item already exists in DB cart (with same variant)
    const existingItemIndex = cart.items.findIndex(
      item => item.productId.toString() === localItem.productId &&
              item.selectedColor === localItem.selectedColor &&
              item.selectedSize === localItem.selectedSize
    );

    if (existingItemIndex > -1) {
      // Merge quantities (take max to avoid losing items)
      cart.items[existingItemIndex].quantity = Math.max(
        cart.items[existingItemIndex].quantity,
        localItem.quantity
      );
      cart.items[existingItemIndex].price = product.price;
    } else {
      // Add new item from local cart
      cart.items.push({
        productId: localItem.productId,
        quantity: Math.min(localItem.quantity, product.stock), // Respect stock limits
        price: product.price,
        selectedColor: localItem.selectedColor || null,
        selectedSize: localItem.selectedSize || null
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

