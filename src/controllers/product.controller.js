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
  const {
    name,
    slug,
    description,
    shortDescription,
    categoryId,
    price,
    originalPrice,
    colors,
    sizes,
    stock,
    sku,
    features,
    careInstructions,
    isFeatured,
    isNewArrival,
    status,
    metaTitle,
    metaDescription,
    tags
  } = req.body;

  // Check if category exists
  const category = await Category.findById(categoryId);
  if (!category) {
    return next(new ApiError('Category not found', 404));
  }

  // Build category path
  const categoryPath = [...category.path, category._id];

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

  // Create product
  const product = await Product.create({
    name,
    slug,
    description,
    shortDescription,
    categoryId,
    categoryPath,
    price,
    originalPrice,
    images,
    colors: colors ? JSON.parse(colors) : [],
    sizes: sizes ? JSON.parse(sizes) : [],
    stock,
    sku,
    features: features ? JSON.parse(features) : [],
    careInstructions: careInstructions ? JSON.parse(careInstructions) : [],
    isFeatured: isFeatured === 'true',
    isNewArrival: isNewArrival === 'true',
    status: status || 'active',
    metaTitle,
    metaDescription,
    tags: tags ? JSON.parse(tags) : [],
    publishedAt: new Date()
  });

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

  // Handle image uploads if provided
  if (req.files && req.files.length > 0) {
    const imageUrls = await uploadService.uploadMultiple(req.files, 'hbs-products');
    const newImages = imageUrls.map((url, index) => ({
      url,
      isPrimary: product.images.length === 0 && index === 0,
      order: product.images.length + index
    }));
    product.images.push(...newImages);
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

  // Update category path if category changed
  if (updateFields.categoryId && updateFields.categoryId !== product.categoryId.toString()) {
    const category = await Category.findById(updateFields.categoryId);
    if (!category) {
      return next(new ApiError('Category not found', 404));
    }
    updateFields.categoryPath = [...category.path, category._id];
  }

  product = await Product.findByIdAndUpdate(id, updateFields, {
    new: true,
    runValidators: true
  });

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

