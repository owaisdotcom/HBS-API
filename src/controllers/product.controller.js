import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import Wishlist from '../models/Wishlist.js';
import Cart from '../models/Cart.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import uploadService from '../services/upload.service.js';
import { sendWishlistRestockEmail } from '../services/email.service.js';

const getReservationMap = async (productIds = []) => {
  if (productIds.length === 0) return new Map();
  const now = new Date();
  const ids = productIds.map((id) => new mongoose.Types.ObjectId(id));
  const results = await Cart.aggregate([
    { $unwind: '$items' },
    {
      $match: {
        'items.productId': { $in: ids },
        'items.reservedUntil': { $gt: now }
      }
    },
    {
      $group: {
        _id: '$items.productId',
        total: { $sum: '$items.quantity' }
      }
    }
  ]);

  return new Map(results.map((row) => [row._id.toString(), row.total]));
};

// @route   GET /api/products
// @desc    Get all products with filters, search, and pagination
// @access  Public
export const getAllProducts = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    category,
    search,
    minPrice,
    maxPrice,
    sort = '-createdAt',
    status = 'active',
    isFeatured,
    isNewArrival,
    inStock
  } = req.query;

  // Build query
  const query = {
    isDeleted: { $ne: true } // Exclude soft-deleted products
  };

  if (status) query.status = status;
  if (category) query.categoryId = category;
  if (isFeatured !== undefined) query.isFeatured = isFeatured === 'true';
  if (isNewArrival !== undefined) query.isNewArrival = isNewArrival === 'true';

  // Price range filter
  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) query.price.$gte = Number(minPrice);
    if (maxPrice) query.price.$lte = Number(maxPrice);
  }

  // Stock filter
  if (inStock === 'true') {
    query.stock = { $gt: 0 };
  }

  // Text search (partial match)
  if (search) {
    const searchRegex = new RegExp(search, 'i');
    query.$or = [
      { name: searchRegex },
      { slug: searchRegex },
      { sku: searchRegex },
      { description: searchRegex }
    ];
  }

  const skip = (page - 1) * limit;

  // Execute query
  const products = await Product.find(query)
    .sort(sort)
    .skip(skip)
    .limit(Number(limit))
    .populate('categoryId', 'name slug')
    .select('-__v');

  const total = await Product.countDocuments(query);

  const reservationMap = await getReservationMap(products.map((p) => p._id));
  const productsWithAvailability = products.map((product) => {
    const reserved = reservationMap.get(product._id.toString()) || 0;
    const availableStock = Math.max(product.stock - reserved, 0);
    return {
      ...product.toObject(),
      availableStock,
      reservedStock: reserved
    };
  });

  res.json(
    new ApiResponse(200, {
      products: productsWithAvailability,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }, 'Products retrieved successfully')
  );
});

// @route   GET /api/products/:id
// @desc    Get single product by ID or slug
// @access  Public
export const getProduct = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  let product;

  // Try to find by ID first, then by slug
  if (id.match(/^[0-9a-fA-F]{24}$/)) {
    product = await Product.findOne({ _id: id, isDeleted: { $ne: true } })
      .populate('categoryId', 'name slug')
      .populate('categoryPath', 'name slug');
  } else {
    product = await Product.findOne({ slug: id, isDeleted: { $ne: true } })
      .populate('categoryId', 'name slug')
      .populate('categoryPath', 'name slug');
  }

  if (!product) {
    return next(new ApiError('Product not found', 404));
  }

  // Increment view count
  product.viewCount += 1;
  await product.save({ validateBeforeSave: false });

  const reservationMap = await getReservationMap([product._id]);
  const reserved = reservationMap.get(product._id.toString()) || 0;
  const availableStock = Math.max(product.stock - reserved, 0);

  res.json(
    new ApiResponse(200, {
      product: {
        ...product.toObject(),
        availableStock,
        reservedStock: reserved
      }
    }, 'Product retrieved successfully')
  );
});

// @route   POST /api/products
// @desc    Create new product
// @access  Private (Admin)
export const createProduct = asyncHandler(async (req, res, next) => {
  const productData = { ...req.body };

  // Parse JSON strings if present
  if (productData.colors && typeof productData.colors === 'string') {
    productData.colors = JSON.parse(productData.colors);
  }
  if (productData.sizes && typeof productData.sizes === 'string') {
    productData.sizes = JSON.parse(productData.sizes);
  }
  if (productData.features && typeof productData.features === 'string') {
    productData.features = JSON.parse(productData.features);
  }
  if (productData.careInstructions && typeof productData.careInstructions === 'string') {
    productData.careInstructions = JSON.parse(productData.careInstructions);
  }
  if (productData.tags && typeof productData.tags === 'string') {
    productData.tags = JSON.parse(productData.tags);
  }
  if (productData.dimensions && typeof productData.dimensions === 'string') {
    productData.dimensions = JSON.parse(productData.dimensions);
  }
  if (productData.shipping && typeof productData.shipping === 'string') {
    productData.shipping = JSON.parse(productData.shipping);
  }

  // Convert boolean strings from FormData
  if (typeof productData.isFeatured === 'string') {
    productData.isFeatured = productData.isFeatured === 'true';
  }
  if (typeof productData.isNewArrival === 'string') {
    productData.isNewArrival = productData.isNewArrival === 'true';
  }

  // Convert numeric strings from FormData
  const numericFields = ['price', 'originalPrice', 'costPrice', 'stock', 'lowStockThreshold', 'weight'];
  numericFields.forEach(field => {
    if (productData[field] && typeof productData[field] === 'string') {
      productData[field] = parseFloat(productData[field]);
    }
  });

  // Check if category exists and is not deleted
  const category = await Category.findOne({ _id: productData.categoryId, isDeleted: { $ne: true } });
  if (!category) {
    return next(new ApiError('Category not found', 404));
  }

  // Build category path
  productData.categoryPath = [...category.path, category._id];

  // Handle image uploads
  // Handle image uploads (product-level and variant-level)
  let images = [];
  let uploadedUrls = [];
  if (req.files && req.files.length > 0) {
    uploadedUrls = await uploadService.uploadMultiple(req.files, 'hbs-products');
    // Default product-level images if no variant mapping provided
    images = uploadedUrls.map((url, index) => ({
      url,
      isPrimary: index === 0,
      order: index
    }));
  }

  // If variants are provided as JSON string, parse
  if (productData.variants && typeof productData.variants === 'string') {
    try {
      productData.variants = JSON.parse(productData.variants);
    } catch (e) {
      productData.variants = [];
    }
  }

  // If a mapping of uploaded files to color variants is provided, consume it
  // Expect req.body.variantImageMap = JSON.stringify([{ colorId, fileIndexes: [0,1], existingUrls: [] }])
  if (req.body.variantImageMap && uploadedUrls.length > 0) {
    let variantImageMap = [];
    try {
      variantImageMap = JSON.parse(req.body.variantImageMap);
    } catch (e) {
      variantImageMap = [];
    }

    // Build image lists per color variant
    const variantImagesById = {};
    variantImageMap.forEach(mapping => {
      const { colorId, fileIndexes = [], existingUrls = [] } = mapping;
      if (!colorId) return;
      
      const imagesFromFiles = (fileIndexes || [])
        .map(idx => uploadedUrls[idx])
        .filter(Boolean);
      
      const allImages = [
        ...existingUrls.map((url, idx) => ({ url, isPrimary: idx === 0 && imagesFromFiles.length === 0, order: idx })),
        ...imagesFromFiles.map((url, idx) => ({ url, isPrimary: existingUrls.length === 0 && idx === 0, order: existingUrls.length + idx }))
      ];
      
      variantImagesById[colorId] = allImages;
    });

    // Attach images to corresponding color variants in productData
    if (Array.isArray(productData.variants)) {
      productData.variants = productData.variants.map(variant => {
        const imgs = variantImagesById[variant.colorId] || variant.images || [];
        return {
          ...variant,
          images: imgs
        };
      });
    }
  }

  // Derive product stock from all sizes across all color variants
  if (Array.isArray(productData.variants) && productData.variants.length > 0) {
    productData.stock = productData.variants.reduce((sum, colorVariant) => {
      const sizesStock = (colorVariant.sizes || []).reduce((sizeSum, size) => sizeSum + (Number(size.stock) || 0), 0);
      return sum + sizesStock;
    }, 0);
  }

  // If a thumbnail index is provided, use only that as product thumbnail
  const thumbnailFileIndex = req.body.thumbnailFileIndex !== undefined
    ? parseInt(req.body.thumbnailFileIndex, 10)
    : null;
  if (thumbnailFileIndex !== null && uploadedUrls[thumbnailFileIndex]) {
    productData.images = [{
      url: uploadedUrls[thumbnailFileIndex],
      isPrimary: true,
      order: 0
    }];
  } else {
    productData.images = images;
  }
  productData.publishedAt = new Date();
  if (!productData.status) {
    productData.status = 'active';
  }

  // Create product
  const product = await Product.create(productData);

  res.status(201).json(
    new ApiResponse(201, { product }, 'Product created successfully')
  );
});

// @route   PUT /api/products/:id
// @desc    Update product
// @access  Private (Admin)
export const updateProduct = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  let product = await Product.findOne({ _id: id, isDeleted: { $ne: true } });

  if (!product) {
    return next(new ApiError('Product not found', 404));
  }

  const previousStock = product.stock;

  // Handle existing images (images to keep) with order
  let existingImagesWithOrder = [];
  let newImagesOrder = [];
  let shouldUpdateImages = false;
  
  if (req.body.existingImages) {
    shouldUpdateImages = true;
    try {
      existingImagesWithOrder = JSON.parse(req.body.existingImages);
    } catch (e) {
      existingImagesWithOrder = [];
    }
  }

  if (req.body.newImagesOrder) {
    try {
      newImagesOrder = JSON.parse(req.body.newImagesOrder);
    } catch (e) {
      newImagesOrder = [];
    }
  }

  // Handle new image uploads
  let uploadedNewImages = [];
  if (req.files && req.files.length > 0) {
    shouldUpdateImages = true;
    const imageUrls = await uploadService.uploadMultiple(req.files, 'hbs-products');
    uploadedNewImages = imageUrls.map((url, index) => ({
      url,
      fileIndex: index
    }));
  }

  // Only update images if FormData was sent (not plain JSON)
  if (shouldUpdateImages) {
    // Create a map of all images with their final order
    const imageMap = [];

    // Add existing images with their order
    existingImagesWithOrder.forEach(img => {
      imageMap.push({ url: img.url, order: img.order, type: 'existing' });
    });

    // Add new images with their order
    newImagesOrder.forEach(orderInfo => {
      const newImage = uploadedNewImages.find(img => img.fileIndex === orderInfo.fileIndex);
      if (newImage) {
        imageMap.push({ url: newImage.url, order: orderInfo.order, type: 'new' });
      }
    });

    // Sort by order and format for DB
    const allImages = imageMap
      .sort((a, b) => a.order - b.order)
      .map((img, index) => ({
        url: img.url,
        isPrimary: index === 0,
        order: index
      }));

    console.log('📸 Final images order:', allImages);
    product.images = allImages;
  }

  // Thumbnail update (optional)
  if (req.body.thumbnailExistingUrl) {
    product.images = [{
      url: req.body.thumbnailExistingUrl,
      isPrimary: true,
      order: 0
    }];
  }
  if (req.body.thumbnailFileIndex !== undefined) {
    const idx = parseInt(req.body.thumbnailFileIndex, 10);
    const newThumb = uploadedNewImages.find(img => img.fileIndex === idx);
    if (newThumb) {
      product.images = [{
        url: newThumb.url,
        isPrimary: true,
        order: 0
      }];
    }
  }

  // If a mapping of uploaded files to color variants is provided on update, apply it
  // Expect req.body.variantImageMap = JSON.stringify([{ colorId, fileIndexes: [0,1], existingUrls: [] }])
  if (req.body.variantImageMap) {
    let variantImageMap = [];
    try {
      variantImageMap = JSON.parse(req.body.variantImageMap);
    } catch (e) {
      variantImageMap = [];
    }

    // Build newImagesByFileIndex map for uploadedNewImages
    const newImagesByFileIndex = {};
    uploadedNewImages.forEach(img => {
      newImagesByFileIndex[img.fileIndex] = img.url;
    });

    variantImageMap.forEach(mapping => {
      const { colorId, fileIndexes = [], existingUrls = [] } = mapping;
      const imagesForVariant = [];

      existingUrls.forEach((url, idx) => {
        imagesForVariant.push({ url, isPrimary: idx === 0 && fileIndexes.length === 0, order: imagesForVariant.length });
      });

      fileIndexes.forEach((fi) => {
        const url = newImagesByFileIndex[fi];
        if (url) imagesForVariant.push({ url, isPrimary: existingUrls.length === 0 && imagesForVariant.length === 0, order: imagesForVariant.length });
      });

      // Find color variant in product and replace its images
      const colorVariant = product.variants.find(v => v.colorId === colorId);
      if (colorVariant) {
        colorVariant.images = imagesForVariant;
      }
    });
  }

  // Update fields
  const updateFields = { ...req.body };

  // Parse JSON strings if present
  if (updateFields.colors && typeof updateFields.colors === 'string') {
    updateFields.colors = JSON.parse(updateFields.colors);
  }
  if (updateFields.sizes && typeof updateFields.sizes === 'string') {
    updateFields.sizes = JSON.parse(updateFields.sizes);
  }
  if (updateFields.features && typeof updateFields.features === 'string') {
    updateFields.features = JSON.parse(updateFields.features);
  }
  if (updateFields.careInstructions && typeof updateFields.careInstructions === 'string') {
    updateFields.careInstructions = JSON.parse(updateFields.careInstructions);
  }
  if (updateFields.tags && typeof updateFields.tags === 'string') {
    updateFields.tags = JSON.parse(updateFields.tags);
  }
  if (updateFields.dimensions && typeof updateFields.dimensions === 'string') {
    updateFields.dimensions = JSON.parse(updateFields.dimensions);
  }
  if (updateFields.shipping && typeof updateFields.shipping === 'string') {
    updateFields.shipping = JSON.parse(updateFields.shipping);
  }
  if (updateFields.variants && typeof updateFields.variants === 'string') {
    try {
      updateFields.variants = JSON.parse(updateFields.variants);
    } catch (e) {
      updateFields.variants = [];
    }
  }

  // Derive product stock from all sizes across all color variants
  if (Array.isArray(updateFields.variants) && updateFields.variants.length > 0) {
    updateFields.stock = updateFields.variants.reduce((sum, colorVariant) => {
      const sizesStock = (colorVariant.sizes || []).reduce((sizeSum, size) => sizeSum + (Number(size.stock) || 0), 0);
      return sum + sizesStock;
    }, 0);
  }

  // Convert boolean strings from FormData
  if (typeof updateFields.isFeatured === 'string') {
    updateFields.isFeatured = updateFields.isFeatured === 'true';
  }
  if (typeof updateFields.isNewArrival === 'string') {
    updateFields.isNewArrival = updateFields.isNewArrival === 'true';
  }

  // Convert numeric strings from FormData
  const numericFields = ['price', 'originalPrice', 'costPrice', 'stock', 'lowStockThreshold', 'weight'];
  numericFields.forEach(field => {
    if (updateFields[field] && typeof updateFields[field] === 'string') {
      updateFields[field] = parseFloat(updateFields[field]);
    }
  });

  // Update category path if category changed
  if (updateFields.categoryId && updateFields.categoryId !== product.categoryId.toString()) {
    const category = await Category.findOne({ _id: updateFields.categoryId, isDeleted: { $ne: true } });
    if (!category) {
      return next(new ApiError('Category not found', 404));
    }
    updateFields.categoryPath = [...category.path, category._id];
    product.categoryId = updateFields.categoryId;
    product.categoryPath = updateFields.categoryPath;
  }

  // Remove fields that shouldn't be directly updated
  delete updateFields.existingImages;
  delete updateFields._id;
  delete updateFields.__v;
  delete updateFields.createdAt;
  delete updateFields.updatedAt;

  // Apply all fields to product
  Object.keys(updateFields).forEach(key => {
    if (updateFields[key] !== undefined) {
      product[key] = updateFields[key];
    }
  });

  // Save product
  await product.save();

  // Wishlist restock notifications
  const nowInStock = product.stock > 0;
  const wasOutOfStock = previousStock <= 0;
  const becameOutOfStock = previousStock > 0 && product.stock <= 0;

  if (becameOutOfStock) {
    try {
      await Wishlist.updateMany(
        { 'items.productId': product._id },
        { $set: { 'items.$[item].notifyOnRestock': true } },
        { arrayFilters: [{ 'item.productId': product._id }] }
      );
    } catch (error) {
      console.error('Failed to flag wishlist items for restock notifications:', error);
    }
  }

  if (wasOutOfStock && nowInStock) {
    try {
      const wishlists = await Wishlist.find({
        'items.productId': product._id,
        'items.notifyOnRestock': true
      }).populate('userId', 'fullName email');

      for (const wishlist of wishlists) {
        const userEmail = wishlist.userId?.email;
        if (!userEmail) continue;

        const item = wishlist.items.find((entry) => (
          entry.productId.toString() === product._id.toString() && entry.notifyOnRestock
        ));

        if (!item) continue;

        try {
          await sendWishlistRestockEmail(userEmail, wishlist.userId?.fullName, product);
          await Wishlist.updateOne(
            { _id: wishlist._id },
            { $set: { 'items.$[item].notifyOnRestock': false } },
            { arrayFilters: [{ 'item.productId': product._id }] }
          );
        } catch (error) {
          console.error(`Failed to send restock email to ${userEmail}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to process wishlist restock notifications:', error);
    }
  }

  res.json(
    new ApiResponse(200, { product }, 'Product updated successfully')
  );
});

// @route   DELETE /api/products/:id
// @desc    Soft delete product
// @access  Private (Admin)
export const deleteProduct = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const product = await Product.findOne({ _id: id, isDeleted: { $ne: true } });

  if (!product) {
    return next(new ApiError('Product not found', 404));
  }

  // Soft delete
  product.isDeleted = true;
  product.deletedAt = new Date();
  await product.save();

  res.json(
    new ApiResponse(200, null, 'Product deleted successfully')
  );
});

// @route   DELETE /api/products/:id/images/:imageId
// @desc    Delete product image
// @access  Private (Admin)
export const deleteProductImage = asyncHandler(async (req, res, next) => {
  const { id, imageId } = req.params;

  const product = await Product.findOne({ _id: id, isDeleted: { $ne: true } });

  if (!product) {
    return next(new ApiError('Product not found', 404));
  }

  const imageIndex = product.images.findIndex(img => img._id.toString() === imageId);

  if (imageIndex === -1) {
    return next(new ApiError('Image not found', 404));
  }

  product.images.splice(imageIndex, 1);
  await product.save();

  res.json(
    new ApiResponse(200, { product }, 'Image deleted successfully')
  );
});

// @route   GET /api/products/featured
// @desc    Get featured products
// @access  Public
export const getFeaturedProducts = asyncHandler(async (req, res) => {
  const { limit = 8 } = req.query;

  const products = await Product.find({
    isFeatured: true,
    status: 'active',
    stock: { $gt: 0 },
    isDeleted: { $ne: true }
  })
    .sort('-createdAt')
    .limit(Number(limit))
    .populate('categoryId', 'name slug')
    .select('-__v');

  res.json(
    new ApiResponse(200, { products }, 'Featured products retrieved')
  );
});

// @route   GET /api/products/new-arrivals
// @desc    Get new arrival products
// @access  Public
export const getNewArrivals = asyncHandler(async (req, res) => {
  const { limit = 8 } = req.query;

  const products = await Product.find({
    isNewArrival: true,
    status: 'active',
    stock: { $gt: 0 },
    isDeleted: { $ne: true }
  })
    .sort('-publishedAt')
    .limit(Number(limit))
    .populate('categoryId', 'name slug')
    .select('-__v');

  res.json(
    new ApiResponse(200, { products }, 'New arrivals retrieved')
  );
});

// @route   GET /api/products/related/:id
// @desc    Get related products
// @access  Public
export const getRelatedProducts = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { limit = 8 } = req.query;

  const product = await Product.findOne({ _id: id, isDeleted: { $ne: true } });

  if (!product) {
    return next(new ApiError('Product not found', 404));
  }

  const relatedProducts = await Product.find({
    _id: { $ne: id },
    categoryId: product.categoryId,
    status: 'active',
    stock: { $gt: 0 },
    isDeleted: { $ne: true }
  })
    .sort('-rating -soldCount')
    .limit(Number(limit))
    .populate('categoryId', 'name slug')
    .select('-__v');

  res.json(
    new ApiResponse(200, { products: relatedProducts }, 'Related products retrieved')
  );
});

