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

  const query = includeInactive ? { isDeleted: { $ne: true } } : { status, isDeleted: { $ne: true } };

  const categories = await Category.find(query)
    .sort('displayOrder level')
    .populate('parentId', 'name slug')
    .select('-__v');

  // Get product counts for all categories
  const categoryIds = categories.map(cat => cat._id);
  // Count products per category by combining product.categories and product.categoryPath
  const productCounts = await Product.aggregate([
    {
      $project: {
        categories: { $ifNull: ['$categories', []] },
        categoryPath: { $ifNull: ['$categoryPath', []] },
        status: 1,
        isDeleted: 1
      }
    },
    {
      $project: {
        matchCats: { $setUnion: ['$categories', '$categoryPath'] },
        status: 1,
        isDeleted: 1
      }
    },
    { $unwind: '$matchCats' },
    {
      $match: {
        matchCats: { $in: categoryIds },
        status: 'active',
        isDeleted: { $ne: true }
      }
    },
    {
      $group: {
        _id: '$matchCats',
        count: { $sum: 1 }
      }
    }
  ]);

  // Create a map of category ID to product count
  const productCountMap = {};
  productCounts.forEach(item => {
    // Skip null/undefined grouping keys (can happen when products have no categories)
    if (!item._id) return;
    productCountMap[item._id.toString()] = item.count;
  });

  // Build hierarchy
  const categoryMap = {};
  const rootCategories = [];

  categories.forEach(category => {
    categoryMap[category._id] = {
      ...category.toObject(),
      children: [],
      productCount: productCountMap[category._id.toString()] || 0
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

  const categories = await Category.find({ status, isDeleted: { $ne: true } })
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
    category = await Category.findOne({ _id: id, isDeleted: { $ne: true } })
      .populate('parentId', 'name slug')
      .populate('path', 'name slug');
  } else {
    category = await Category.findOne({ slug: id, isDeleted: { $ne: true } })
      .populate('parentId', 'name slug')
      .populate('path', 'name slug');
  }

  if (!category) {
    return next(new ApiError('Category not found', 404));
  }

  // Get subcategories
  const subcategories = await Category.find({
    parentId: category._id,
    status: 'active',
    isDeleted: { $ne: true }
  }).sort('displayOrder');

  // Get product count (match products that list this category or have it in their categoryPath)
  const productCount = await Product.countDocuments({
    $or: [
      { categories: category._id },
      { categoryPath: category._id }
    ],
    status: 'active',
    isDeleted: { $ne: true }
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
    maxPrice,
    search,
    status = 'active',
    isFeatured,
    isNewArrival,
    inStock
  } = req.query;

  let category;

  // Try to find by ID first, then by slug
  if (id.match(/^[0-9a-fA-F]{24}$/)) {
    category = await Category.findOne({ _id: id, isDeleted: { $ne: true } });
  } else {
    category = await Category.findOne({ slug: id, isDeleted: { $ne: true } });
  }

  if (!category) {
    return next(new ApiError('Category not found', 404));
  }

  // Build query for products in this category and subcategories
  const categoryClause = [
    { categories: category._id },
    { categoryPath: category._id }
  ];

  const query = {
    $or: categoryClause,
    status,
    isDeleted: { $ne: true }
  };

  if (isFeatured !== undefined) query.isFeatured = isFeatured === 'true';
  if (isNewArrival !== undefined) query.isNewArrival = isNewArrival === 'true';

  // Price range filter
  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) query.price.$gte = Number(minPrice);
    if (maxPrice) query.price.$lte = Number(maxPrice);
  }

  if (inStock === 'true') {
    query.stock = { $gt: 0 };
  }

  if (search) {
    const searchRegex = new RegExp(search, 'i');
    query.$and = [
      { $or: categoryClause },
      {
        $or: [
          { name: searchRegex },
          { slug: searchRegex },
          { sku: searchRegex },
          { description: searchRegex }
        ]
      }
    ];
    delete query.$or;
  }

  const skip = (page - 1) * limit;

  const products = await Product.find(query)
    .sort(sort)
    .skip(skip)
    .limit(Number(limit))
    .populate('categories', 'name slug')
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

  // Check if slug already exists (excluding soft-deleted)
  const existingCategory = await Category.findOne({ slug, isDeleted: { $ne: true } });
  if (existingCategory) {
    return next(new ApiError('Slug already exists', 400));
  }

  // Handle image uploads
  let thumbnail = null;
  let coverImage = null;
  
  if (req.files) {
    if (req.files.thumbnail && req.files.thumbnail[0]) {
      thumbnail = await uploadService.uploadSingle(req.files.thumbnail[0], 'hbs-categories');
    }
    if (req.files.coverImage && req.files.coverImage[0]) {
      coverImage = await uploadService.uploadSingle(req.files.coverImage[0], 'hbs-categories');
    }
  }

  // Create category
  const category = await Category.create({
    name,
    slug,
    description,
    parentId: parentId || null,
    thumbnail,
    coverImage,
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

  let category = await Category.findOne({ _id: id, isDeleted: { $ne: true } });

  if (!category) {
    return next(new ApiError('Category not found', 404));
  }

  // Handle image uploads
  if (req.files) {
    if (req.files.thumbnail && req.files.thumbnail[0]) {
      const thumbnail = await uploadService.uploadSingle(req.files.thumbnail[0], 'hbs-categories');
      req.body.thumbnail = thumbnail;
    }
    if (req.files.coverImage && req.files.coverImage[0]) {
      const coverImage = await uploadService.uploadSingle(req.files.coverImage[0], 'hbs-categories');
      req.body.coverImage = coverImage;
    }
  }

  // Check if slug is being changed and if it already exists (excluding soft-deleted)
  if (req.body.slug && req.body.slug !== category.slug) {
    const existingCategory = await Category.findOne({ slug: req.body.slug, isDeleted: { $ne: true } });
    if (existingCategory) {
      return next(new ApiError('Slug already exists', 400));
    }
  }

  // Update category (ensure it's not soft-deleted)
  Object.keys(req.body).forEach(key => {
    if (req.body[key] !== undefined) {
      category[key] = req.body[key];
    }
  });
  await category.save();

  res.json(
    new ApiResponse(200, { category }, 'Category updated successfully')
  );
});

// @route   DELETE /api/categories/:id
// @desc    Soft delete category
// @access  Private (Admin)
export const deleteCategory = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const category = await Category.findOne({ _id: id, isDeleted: { $ne: true } });

  if (!category) {
    return next(new ApiError('Category not found', 404));
  }

  // Check if category has active subcategories
  const subcategories = await Category.countDocuments({ 
    parentId: id, 
    isDeleted: { $ne: true } 
  });
  if (subcategories > 0) {
    return next(new ApiError('Cannot delete category with subcategories', 400));
  }

  // Check if category has active products (consider products linked to categories or categoryPath)
  const products = await Product.countDocuments({ 
    $or: [
      { categories: id },
      { categoryPath: id }
    ],
    isDeleted: { $ne: true } 
  });
  if (products > 0) {
    return next(new ApiError('Cannot delete category with products', 400));
  }

  // Soft delete
  category.isDeleted = true;
  category.deletedAt = new Date();
  await category.save();

  res.json(
    new ApiResponse(200, null, 'Category deleted successfully')
  );
});

// @route   GET /api/categories/:id/subcategories
// @desc    Get subcategories of a category
// @access  Public
export const getSubcategories = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const category = await Category.findOne({ _id: id, isDeleted: { $ne: true } });

  if (!category) {
    return next(new ApiError('Category not found', 404));
  }

  const subcategories = await Category.find({
    parentId: id,
    status: 'active',
    isDeleted: { $ne: true }
  }).sort('displayOrder');

  res.json(
    new ApiResponse(200, { subcategories }, 'Subcategories retrieved successfully')
  );
});

