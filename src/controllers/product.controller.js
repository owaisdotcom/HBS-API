import Product from '../models/Product.js';
import Category from '../models/Category.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import uploadService from '../services/upload.service.js';

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
  const query = {};

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

  // Text search
  if (search) {
    query.$text = { $search: search };
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

  res.json(
    new ApiResponse(200, {
      products,
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
    product = await Product.findById(id)
      .populate('categoryId', 'name slug')
      .populate('categoryPath', 'name slug');
  } else {
    product = await Product.findOne({ slug: id })
      .populate('categoryId', 'name slug')
      .populate('categoryPath', 'name slug');
  }

  if (!product) {
    return next(new ApiError('Product not found', 404));
  }

  // Increment view count
  product.viewCount += 1;
  await product.save({ validateBeforeSave: false });

  res.json(
    new ApiResponse(200, { product }, 'Product retrieved successfully')
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

  // Check if category exists
  const category = await Category.findById(productData.categoryId);
  if (!category) {
    return next(new ApiError('Category not found', 404));
  }

  // Build category path
  productData.categoryPath = [...category.path, category._id];

  // Handle image uploads
  let images = [];
  if (req.files && req.files.length > 0) {
    const imageUrls = await uploadService.uploadMultiple(req.files, 'hbs-products');
    images = imageUrls.map((url, index) => ({
      url,
      isPrimary: index === 0,
      order: index
    }));
  }

  productData.images = images;
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

  let product = await Product.findById(id);

  if (!product) {
    return next(new ApiError('Product not found', 404));
  }

  // Handle existing images (images to keep)
  let existingImages = [];
  if (req.body.existingImages) {
    try {
      existingImages = JSON.parse(req.body.existingImages);
    } catch (e) {
      existingImages = [];
    }
  }

  // Handle new image uploads
  let newImages = [];
  if (req.files && req.files.length > 0) {
    const imageUrls = await uploadService.uploadMultiple(req.files, 'hbs-products');
    newImages = imageUrls.map((url, index) => ({
      url,
      isPrimary: existingImages.length === 0 && index === 0,
      order: existingImages.length + index
    }));
  }

  // Combine existing and new images, maintaining order
  const allImages = [...existingImages, ...newImages].map((img, index) => ({
    url: img.url,
    isPrimary: index === 0,
    order: index
  }));

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
    const category = await Category.findById(updateFields.categoryId);
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

  // Set images (already processed above)
  product.images = allImages;

  // Save product
  await product.save();

  res.json(
    new ApiResponse(200, { product }, 'Product updated successfully')
  );
});

// @route   DELETE /api/products/:id
// @desc    Delete product
// @access  Private (Admin)
export const deleteProduct = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const product = await Product.findById(id);

  if (!product) {
    return next(new ApiError('Product not found', 404));
  }

  await product.deleteOne();

  res.json(
    new ApiResponse(200, null, 'Product deleted successfully')
  );
});

// @route   DELETE /api/products/:id/images/:imageId
// @desc    Delete product image
// @access  Private (Admin)
export const deleteProductImage = asyncHandler(async (req, res, next) => {
  const { id, imageId } = req.params;

  const product = await Product.findById(id);

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
    stock: { $gt: 0 }
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
    stock: { $gt: 0 }
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

  const product = await Product.findById(id);

  if (!product) {
    return next(new ApiError('Product not found', 404));
  }

  const relatedProducts = await Product.find({
    _id: { $ne: id },
    categoryId: product.categoryId,
    status: 'active',
    stock: { $gt: 0 }
  })
    .sort('-rating -soldCount')
    .limit(Number(limit))
    .populate('categoryId', 'name slug')
    .select('-__v');

  res.json(
    new ApiResponse(200, { products: relatedProducts }, 'Related products retrieved')
  );
});

