import Category from '../models/Category.js';
import Product from '../models/Product.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import uploadService from '../services/upload.service.js';

// @route   GET /api/categories
// @desc    Get all categories (with hierarchy)
// @access  Public
export const getAllCategories = asyncHandler(async (req, res) => {
  const { status = 'active', includeInactive } = req.query;

  const query = includeInactive ? {} : { status };

  const categories = await Category.find(query)
    .sort('displayOrder level')
    .populate('parentId', 'name slug')
    .select('-__v');

  // Build hierarchy
  const categoryMap = {};
  const rootCategories = [];

  categories.forEach(category => {
    categoryMap[category._id] = {
      ...category.toObject(),
      children: []
    };
  });

  categories.forEach(category => {
    if (category.parentId) {
      const parent = categoryMap[category.parentId._id || category.parentId];
      if (parent) {
        parent.children.push(categoryMap[category._id]);
      }
    } else {
      rootCategories.push(categoryMap[category._id]);
    }
  });

  res.json(
    new ApiResponse(200, {
      categories: rootCategories,
      total: categories.length
    }, 'Categories retrieved successfully')
  );
});

// @route   GET /api/categories/flat
// @desc    Get all categories (flat list)
// @access  Public
export const getFlatCategories = asyncHandler(async (req, res) => {
  const { status = 'active' } = req.query;

  const categories = await Category.find({ status })
    .sort('level displayOrder')
    .populate('parentId', 'name slug')
    .select('-__v');

  res.json(
    new ApiResponse(200, { categories }, 'Categories retrieved successfully')
  );
});

// @route   GET /api/categories/:id
// @desc    Get single category by ID or slug
// @access  Public
export const getCategory = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  let category;

  // Try to find by ID first, then by slug
  if (id.match(/^[0-9a-fA-F]{24}$/)) {
    category = await Category.findById(id)
      .populate('parentId', 'name slug')
      .populate('path', 'name slug');
  } else {
    category = await Category.findOne({ slug: id })
      .populate('parentId', 'name slug')
      .populate('path', 'name slug');
  }

  if (!category) {
    return next(new ApiError('Category not found', 404));
  }

  // Get subcategories
  const subcategories = await Category.find({
    parentId: category._id,
    status: 'active'
  }).sort('displayOrder');

  // Get product count
  const productCount = await Product.countDocuments({
    categoryId: category._id,
    status: 'active'
  });

  res.json(
    new ApiResponse(200, {
      category,
      subcategories,
      productCount
    }, 'Category retrieved successfully')
  );
});

// @route   GET /api/categories/:id/products
// @desc    Get products in a category
// @access  Public
export const getCategoryProducts = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const {
    page = 1,
    limit = 20,
    sort = '-createdAt',
    minPrice,
    maxPrice
  } = req.query;

  let category;

  // Try to find by ID first, then by slug
  if (id.match(/^[0-9a-fA-F]{24}$/)) {
    category = await Category.findById(id);
  } else {
    category = await Category.findOne({ slug: id });
  }

  if (!category) {
    return next(new ApiError('Category not found', 404));
  }

  // Build query for products in this category and subcategories
  const query = {
    $or: [
      { categoryId: category._id },
      { categoryPath: category._id }
    ],
    status: 'active'
  };

  // Price range filter
  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) query.price.$gte = Number(minPrice);
    if (maxPrice) query.price.$lte = Number(maxPrice);
  }

  const skip = (page - 1) * limit;

  const products = await Product.find(query)
    .sort(sort)
    .skip(skip)
    .limit(Number(limit))
    .populate('categoryId', 'name slug')
    .select('-__v');

  const total = await Product.countDocuments(query);

  res.json(
    new ApiResponse(200, {
      category: {
        id: category._id,
        name: category.name,
        slug: category.slug
      },
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

// @route   POST /api/categories
// @desc    Create new category
// @access  Private (Admin)
export const createCategory = asyncHandler(async (req, res, next) => {
  const {
    name,
    slug,
    description,
    parentId,
    displayOrder,
    status,
    metaTitle,
    metaDescription
  } = req.body;

  // Check if slug already exists
  const existingCategory = await Category.findOne({ slug });
  if (existingCategory) {
    return next(new ApiError('Slug already exists', 400));
  }

  // Handle image upload
  let image = null;
  if (req.file) {
    image = await uploadService.uploadSingle(req.file, 'hbs-categories');
  }

  // Create category
  const category = await Category.create({
    name,
    slug,
    description,
    parentId: parentId || null,
    image,
    displayOrder,
    status: status || 'active',
    metaTitle,
    metaDescription
  });

  res.status(201).json(
    new ApiResponse(201, { category }, 'Category created successfully')
  );
});

// @route   PUT /api/categories/:id
// @desc    Update category
// @access  Private (Admin)
export const updateCategory = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  let category = await Category.findById(id);

  if (!category) {
    return next(new ApiError('Category not found', 404));
  }

  // Handle image upload
  if (req.file) {
    const image = await uploadService.uploadSingle(req.file, 'hbs-categories');
    req.body.image = image;
  }

  // Check if slug is being changed and if it already exists
  if (req.body.slug && req.body.slug !== category.slug) {
    const existingCategory = await Category.findOne({ slug: req.body.slug });
    if (existingCategory) {
      return next(new ApiError('Slug already exists', 400));
    }
  }

  category = await Category.findByIdAndUpdate(id, req.body, {
    new: true,
    runValidators: true
  });

  res.json(
    new ApiResponse(200, { category }, 'Category updated successfully')
  );
});

// @route   DELETE /api/categories/:id
// @desc    Delete category
// @access  Private (Admin)
export const deleteCategory = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const category = await Category.findById(id);

  if (!category) {
    return next(new ApiError('Category not found', 404));
  }

  // Check if category has subcategories
  const subcategories = await Category.countDocuments({ parentId: id });
  if (subcategories > 0) {
    return next(new ApiError('Cannot delete category with subcategories', 400));
  }

  // Check if category has products
  const products = await Product.countDocuments({ categoryId: id });
  if (products > 0) {
    return next(new ApiError('Cannot delete category with products', 400));
  }

  await category.deleteOne();

  res.json(
    new ApiResponse(200, null, 'Category deleted successfully')
  );
});

// @route   GET /api/categories/:id/subcategories
// @desc    Get subcategories of a category
// @access  Public
export const getSubcategories = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const category = await Category.findById(id);

  if (!category) {
    return next(new ApiError('Category not found', 404));
  }

  const subcategories = await Category.find({
    parentId: id,
    status: 'active'
  }).sort('displayOrder');

  res.json(
    new ApiResponse(200, { subcategories }, 'Subcategories retrieved successfully')
  );
});

