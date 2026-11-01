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
import cacheService from '../services/cache.service.js';
import { generateR2Url, generateCustomDomainUrl, resolveImageUrl } from '../utils/imageUrl.js';

const LISTING_PROJECTION = '_id name slug price originalPrice images categories stock availableStock status rating reviewCount isFeatured isNewArrival createdAt publishedAt variants';

export const calculateVariantCount = (variants) => {
  if (!Array.isArray(variants) || variants.length === 0) return 0;
  // Backward compatibility for old flat format without colorId:
  if (variants[0]?.variantId && !variants[0]?.colorId) {
    return new Set(variants.map((v) => v.color || 'Default')).size;
  }
  return variants.length;
};

const getReservationMap = async (productIds = []) => {
  if (productIds.length === 0) return new Map();
  const now = new Date();
  const ids = productIds.map((id) => new mongoose.Types.ObjectId(id));

  // Fast pre-check: Skip aggregate query if no active cart reservations exist for target products
  const hasReservations = await Cart.exists({
    'items.productId': { $in: ids },
    'items.reservedUntil': { $gt: now }
  });

  if (!hasReservations) {
    return new Map();
  }

  const results = await Cart.aggregate([
    // Stage 1: Filter cart documents using compound index IXSCAN BEFORE unwinding
    {
      $match: {
        'items.productId': { $in: ids },
        'items.reservedUntil': { $gt: now }
      }
    },
    // Stage 2: Unwind items array ONLY for matching cart documents
    { $unwind: '$items' },
    // Stage 3: Filter unwound items strictly matching product IDs and unexpired reservations
    {
      $match: {
        'items.productId': { $in: ids },
        'items.reservedUntil': { $gt: now }
      }
    },
    // Stage 4: Sum reserved quantities per product ID
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
    inStock,
    ids
  } = req.query;

  const isBypassCache = Boolean(
    req.query._t ||
    req.query.fresh === 'true' ||
    req.headers['cache-control']?.includes('no-cache') ||
    req.headers['cache-control']?.includes('no-store') ||
    req.headers['pragma']?.includes('no-cache')
  );

  const cleanQuery = { ...req.query };
  delete cleanQuery._t;
  delete cleanQuery._fresh;
  delete cleanQuery.fresh;

  const cacheKey = `products_${JSON.stringify(cleanQuery)}`;
  if (!isBypassCache) {
    const cachedResult = cacheService.get(cacheKey);
    if (cachedResult) {
      return res.json(new ApiResponse(200, cachedResult, 'Products retrieved successfully (cached)'));
    }
  }

  // Build query
  const query = {
    isDeleted: { $ne: true } // Exclude soft-deleted products
  };

  if (status) query.status = status;

  if (ids) {
    const idArray = (Array.isArray(ids) ? ids : ids.split(','))
      .map(id => id.trim())
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));
    if (idArray.length > 0) {
      query._id = { $in: idArray };
    }
  }

  const categoryParam = category || req.query.categories;
  if (categoryParam) {
    if (Array.isArray(categoryParam)) {
      query.categories = { $in: categoryParam };
    } else if (typeof categoryParam === 'string' && categoryParam.includes(',')) {
      query.categories = { $in: categoryParam.split(',').map(c => c.trim()).filter(Boolean) };
    } else {
      query.categories = categoryParam;
    }
  }

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

  // Bounded pagination: protect against unbounded limit queries causing CPU/memory spikes
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 20), 100);

  // Text search (safe sanitized regex preventing ReDoS)
  if (search && typeof search === 'string') {
    const trimmed = search.trim().slice(0, 80);
    if (trimmed) {
      const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escaped, 'i');
      query.$or = [
        { name: searchRegex },
        { slug: searchRegex },
        { sku: searchRegex },
        { description: searchRegex }
      ];
    }
  }

  const skip = (safePage - 1) * safeLimit;

  let sortOption = sort;
  if (req.query.sortBy) {
    sortOption = `${req.query.sortOrder === 'desc' ? '-' : ''}${req.query.sortBy}`;
  }

  // Execute query with lightweight listing projection
  const products = await Product.find(query)
    .sort(sortOption)
    .skip(skip)
    .limit(safeLimit)
    .populate('categories', 'name slug')
    .select(LISTING_PROJECTION);

  const total = await Product.countDocuments(query);

  const reservationMap = await getReservationMap(products.map((p) => p._id));
  const productsWithAvailability = products.map((product) => {
    const reserved = reservationMap.get(product._id.toString()) || 0;
    const availableStock = Math.max(product.stock - reserved, 0);
    const prodObj = product.toObject ? product.toObject() : product;
    return {
      ...prodObj,
      availableStock,
      reservedStock: reserved,
      variantCount: calculateVariantCount(prodObj.variants)
    };
  });

  const responseData = {
    products: productsWithAvailability,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  };

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (!isBypassCache) {
    cacheService.set(cacheKey, responseData, 60);
  }

  res.json(
    new ApiResponse(200, responseData, 'Products retrieved successfully')
  );
});

// @route   GET /api/products/:id
// @desc    Get single product by ID or slug
// @access  Public
export const getProduct = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  // Prevent browser caching for product details so client always receives live availability state
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');

  const cacheKey = `product_detail_${id}`;
  let product = cacheService.get(cacheKey);

  if (!product) {
    // Try to find by ID first, then by slug
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      product = await Product.findOne({ _id: id, isDeleted: { $ne: true } })
        .populate('categories', 'name slug')
        .populate('categoryPath', 'name slug')
        .lean();
    } else {
      product = await Product.findOne({ slug: id, isDeleted: { $ne: true } })
        .populate('categories', 'name slug')
        .populate('categoryPath', 'name slug')
        .lean();
    }

    if (!product) {
      return next(new ApiError('Product not found', 404));
    }

    cacheService.set(cacheKey, product, 120);
  }

  const reservationMap = await getReservationMap([product._id]);
  const reserved = reservationMap.get(product._id.toString()) || 0;
  const availableStock = Math.max((product.stock || 0) - reserved, 0);

  res.json(
    new ApiResponse(200, {
      product: {
        ...product,
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
  if (typeof productData.isOnSale === 'string') {
    productData.isOnSale = productData.isOnSale === 'true';
  }
  if (productData.onSale !== undefined) {
    productData.isOnSale = productData.onSale === true || productData.onSale === 'true';
  }

  // Convert numeric strings from FormData
  const numericFields = ['price', 'originalPrice', 'costPrice', 'stock', 'lowStockThreshold', 'weight'];
  numericFields.forEach(field => {
    if (productData[field] && typeof productData[field] === 'string') {
      productData[field] = parseFloat(productData[field]);
    }
  });

  // Normalize incoming category(s). Accept either `categories` (array) or legacy `categoryId` (single)
  if (!productData.categories && productData.categoryId) {
    productData.categories = [productData.categoryId];
  }
  // Normalize categories if sent as JSON string or double-wrapped
  if (productData.categories && typeof productData.categories === 'string') {
    try {
      productData.categories = JSON.parse(productData.categories);
    } catch (e) {
      // fallback
    }
  }
  if (Array.isArray(productData.categories) && productData.categories.length === 1 && typeof productData.categories[0] === 'string' && productData.categories[0].trim().startsWith('[')) {
    try {
      productData.categories = JSON.parse(productData.categories[0]);
    } catch (e) {
      // ignore
    }
  }
  if (!Array.isArray(productData.categories)) {
    productData.categories = [];
  }

  // Validate categories exist and are not deleted
  if (productData.categories.length === 0) {
    return next(new ApiError('Category is required', 404));
  }
  const selectedCategories = await Category.find({ _id: { $in: productData.categories }, isDeleted: { $ne: true } });
  if (selectedCategories.length !== productData.categories.length) {
    return next(new ApiError('One or more categories not found', 404));
  }
  // Build a unioned categoryPath from all selected categories
  const categoryPathSet = new Set();
  selectedCategories.forEach(cat => {
    (cat.path || []).forEach(p => categoryPathSet.add(p.toString()));
    categoryPathSet.add(cat._id.toString());
  });
  productData.categoryPath = Array.from(categoryPathSet).map(id => new mongoose.Types.ObjectId(id));
  productData.categories = selectedCategories.map(c => c._id);

  // Handle image uploads (product-level and variant-level)
  let images = [];
  let uploadedUrls = [];
  let uploadedItems = [];
  if (req.files && req.files.length > 0) {
    const uploadResults = await uploadService.uploadMultiple(req.files, 'hbs-products');
    uploadedItems = uploadResults;
    uploadedUrls = uploadResults.map(item => {
      const raw = typeof item === 'string' ? item : item.url;
      return resolveImageUrl(raw) || raw;
    });
    images = uploadResults.map((item, index) => {
      const rawUrl = typeof item === 'string' ? item : item.url;
      const url = resolveImageUrl(rawUrl) || rawUrl;
      const r2Url = typeof item === 'object' && item.r2Url ? (resolveImageUrl(item.r2Url) || item.r2Url) : url;
      const provider = typeof item === 'object' && item.provider ? item.provider : 'r2';
      const key = typeof item === 'object' ? item.key : undefined;
      const publicId = typeof item === 'object' ? item.publicId : undefined;
      return {
        provider,
        key,
        publicId,
        url,
        r2Url,
        isPrimary: index === 0,
        order: index
      };
    });
  }

  // Parse variants if they come as string or double-wrapped
  if (productData.variants && typeof productData.variants === 'string') {
    try {
      productData.variants = JSON.parse(productData.variants);
    } catch (e) {
      productData.variants = [];
    }
  }
  if (Array.isArray(productData.variants) && productData.variants.length === 1 && typeof productData.variants[0] === 'string' && productData.variants[0].trim().startsWith('[')) {
    try {
      productData.variants = JSON.parse(productData.variants[0]);
    } catch (e) {
      // ignore
    }
  }
  if (!Array.isArray(productData.variants)) {
    productData.variants = [];
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
        .map(idx => {
          const item = uploadedItems[idx];
          if (!item) return null;
          const rawUrl = typeof item === 'string' ? item : item.url;
          const url = resolveImageUrl(rawUrl) || rawUrl;
          const r2Url = typeof item === 'object' && item.r2Url ? (resolveImageUrl(item.r2Url) || item.r2Url) : url;
          return { url, r2Url };
        })
        .filter(Boolean);

      const allImages = [
        ...existingUrls.map((entry, idx) => {
          const rawUrl = typeof entry === 'string' ? entry : entry.url;
          const url = resolveImageUrl(rawUrl) || rawUrl;
          const r2Url = typeof entry === 'object' && entry.r2Url ? (resolveImageUrl(entry.r2Url) || entry.r2Url) : url;
          return { url, r2Url, isPrimary: idx === 0 && imagesFromFiles.length === 0, order: idx };
        }),
        ...imagesFromFiles.map((entry, idx) => ({
          url: entry.url,
          r2Url: entry.r2Url || entry.url,
          isPrimary: existingUrls.length === 0 && idx === 0,
          order: existingUrls.length + idx
        }))
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

  // If a mapping of uploaded files to size charts is provided, consume it
  // Expect req.body.sizeChartMap = JSON.stringify([{ colorId, sizeId, fileIndex, existingUrl }])
  if (req.body.sizeChartMap && uploadedUrls.length > 0) {
    let sizeChartMap = [];
    try {
      sizeChartMap = JSON.parse(req.body.sizeChartMap);
    } catch (e) {
      sizeChartMap = [];
    }

    if (Array.isArray(sizeChartMap) && Array.isArray(productData.variants)) {
      sizeChartMap.forEach(mapping => {
        const { colorId, sizeId, fileIndex, existingUrl } = mapping || {};
        if (!colorId || !sizeId) return;
        const url = (fileIndex != null && uploadedUrls[fileIndex]) ? uploadedUrls[fileIndex] : existingUrl;
        if (!url) return;
        const colorVariant = productData.variants.find(v => v.colorId === colorId);
        if (colorVariant && Array.isArray(colorVariant.sizes)) {
          const size = colorVariant.sizes.find(s => s.sizeId === sizeId);
          if (size) {
            const resolvedSizeUrl = resolveImageUrl(url) || url;
            size.sizeChartUrl = resolvedSizeUrl;
            size.sizeChartR2Url = resolvedSizeUrl;
          }
        }
      });
    }
  }

  // Derive product stock from all sizes across all color variants (calculating variant stock = tieStock + elasticStock + bridalStock when customization enabled)
  if (Array.isArray(productData.variants) && productData.variants.length > 0) {
    productData.stock = productData.variants.reduce((sum, colorVariant) => {
      const sizesStock = (colorVariant.sizes || []).reduce((sizeSum, size) => {
        const tie = Number(size.tieStock) || 0;
        const elastic = Number(size.elasticStock) || 0;
        const bridal = Number(size.bridalStock) || 0;
        if (size.hasTieElastic || size.hasBridalLength || tie > 0 || elastic > 0 || bridal > 0) {
          size.stock = tie + elastic + bridal;
        } else {
          size.stock = Number(size.stock) || 0;
        }
        return sizeSum + size.stock;
      }, 0);
      return sum + sizesStock;
    }, 0);
  }

  // Use newImagesOrder or existingImages/images for product images
  if (req.body.existingImages) {
    let existingImages = [];
    try {
      existingImages = typeof req.body.existingImages === 'string' ? JSON.parse(req.body.existingImages) : req.body.existingImages;
    } catch (e) { }
    if (Array.isArray(existingImages) && existingImages.length > 0) {
      productData.images = existingImages.map((img, index) => {
        const rawUrl = img.url || img;
        const url = resolveImageUrl(rawUrl) || rawUrl;
        const r2Url = img.r2Url ? (resolveImageUrl(img.r2Url) || img.r2Url) : url;
        return {
          url,
          r2Url,
          publicId: img.publicId || undefined,
          isPrimary: (img.order ?? index) === 0,
          order: img.order ?? index
        };
      });
    }
  } else if (req.body.newImagesOrder && uploadedUrls.length > 0) {
    let newImagesOrder = [];
    try {
      newImagesOrder = JSON.parse(req.body.newImagesOrder);
    } catch (e) { }
    if (newImagesOrder.length > 0) {
      productData.images = newImagesOrder.map(orderInfo => {
        const uploadedItem = uploadedItems[orderInfo.fileIndex];
        const rawUrl = uploadedUrls[orderInfo.fileIndex];
        const url = resolveImageUrl(rawUrl) || rawUrl;
        const r2Url = typeof uploadedItem === 'object' && uploadedItem?.r2Url
          ? (resolveImageUrl(uploadedItem.r2Url) || uploadedItem.r2Url)
          : url;
        return {
          url,
          r2Url,
          isPrimary: orderInfo.order === 0,
          order: orderInfo.order
        };
      }).filter(img => img.url);
    } else {
      productData.images = images;
    }
  } else if (req.body.images && (!req.files || req.files.length === 0)) {
    let imgs = req.body.images;
    if (typeof imgs === 'string') {
      try { imgs = JSON.parse(imgs); } catch (e) { }
    }
    if (Array.isArray(imgs) && imgs.length > 0) {
      productData.images = imgs.map((img, index) => {
        const url = typeof img === 'string' ? img : img.url;
        return {
          url,
          r2Url: (typeof img === 'object' && img.r2Url) ? img.r2Url : generateR2Url(url),
          publicId: typeof img === 'object' ? img.publicId || undefined : undefined,
          isPrimary: typeof img === 'object' && img.isPrimary !== undefined ? img.isPrimary : index === 0,
          order: typeof img === 'object' && img.order !== undefined ? img.order : index
        };
      });
    }
  } else {
    // If a thumbnail index is provided (legacy), use only that as product thumbnail
    const thumbnailFileIndex = req.body.thumbnailFileIndex !== undefined
      ? parseInt(req.body.thumbnailFileIndex, 10)
      : null;
    if (thumbnailFileIndex !== null && uploadedUrls[thumbnailFileIndex]) {
      const url = uploadedUrls[thumbnailFileIndex];
      productData.images = [{
        url,
        r2Url: generateR2Url(url),
        isPrimary: true,
        order: 0
      }];
    } else if (req.files && req.files.length > 0) {
      productData.images = images;
    } else if (!productData.images) {
      productData.images = [];
    }
  }
  productData.publishedAt = new Date();
  if (!productData.status) {
    productData.status = 'active';
  }

  // Create product
  const product = await Product.create(productData);

  // Invalidate cached product listings and homepage sections
  cacheService.delPattern('products_');
  cacheService.delPattern('homepage_');

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
  const previousImages = (product.images || []).map(img => (
    typeof img === 'string' ? { url: img } : { url: img?.url, key: img?.key, publicId: img?.publicId }
  ));

  // Handle existing images (images to keep) with order
  let existingImagesWithOrder = [];
  let newImagesOrder = [];
  let shouldUpdateImages = false;

  if (req.body.existingImages) {
    shouldUpdateImages = true;
    try {
      existingImagesWithOrder = typeof req.body.existingImages === 'string'
        ? JSON.parse(req.body.existingImages)
        : (Array.isArray(req.body.existingImages) ? req.body.existingImages : []);
    } catch (e) {
      existingImagesWithOrder = [];
    }
  }

  if (req.body.newImagesOrder) {
    try {
      newImagesOrder = typeof req.body.newImagesOrder === 'string'
        ? JSON.parse(req.body.newImagesOrder)
        : (Array.isArray(req.body.newImagesOrder) ? req.body.newImagesOrder : []);
    } catch (e) {
      newImagesOrder = [];
    }
  }

  // Handle new image uploads
  let uploadedNewImages = [];
  if (req.files && req.files.length > 0) {
    shouldUpdateImages = true;
    const uploadResults = await uploadService.uploadMultiple(req.files, 'hbs-products', {
      requestId: req.requestId,
      productId: product._id.toString()
    });
    uploadedNewImages = uploadResults.map((item, index) => {
      const url = typeof item === 'string' ? item : item.url;
      const r2Url = typeof item === 'object' && item.r2Url ? item.r2Url : generateR2Url(url);
      const provider = typeof item === 'object' && item.provider ? item.provider : 'r2';
      const key = typeof item === 'object' ? item.key : undefined;
      const publicId = typeof item === 'object' ? item.publicId : undefined;
      return {
        provider,
        key,
        publicId,
        url,
        r2Url,
        fileIndex: index
      };
    });
  }

  // Build updated image map if images were provided via FormData or JSON
  if (shouldUpdateImages) {
    const imageMap = [];

    // Add existing images with their order
    existingImagesWithOrder.forEach(img => {
      const rawUrl = typeof img === 'string' ? img : img.url;
      const url = resolveImageUrl(rawUrl) || rawUrl;
      const r2Url = typeof img === 'object' && img.r2Url ? (resolveImageUrl(img.r2Url) || img.r2Url) : url;
      const provider = typeof img === 'object' && img.provider ? img.provider : 'r2';
      const key = typeof img === 'object' ? img.key : undefined;
      const publicId = typeof img === 'object' ? img.publicId : undefined;
      imageMap.push({ provider, key, publicId, url, r2Url, order: img.order, type: 'existing' });
    });

    // Add new images with their order
    newImagesOrder.forEach(orderInfo => {
      const newImage = uploadedNewImages.find(img => img.fileIndex === orderInfo.fileIndex);
      if (newImage) {
        const url = resolveImageUrl(newImage.url) || newImage.url;
        const r2Url = newImage.r2Url ? (resolveImageUrl(newImage.r2Url) || newImage.r2Url) : url;
        imageMap.push({
          provider: newImage.provider,
          key: newImage.key,
          publicId: newImage.publicId,
          url,
          r2Url,
          order: orderInfo.order,
          type: 'new'
        });
      }
    });

    // Sort by order and format for DB
    const allImages = imageMap
      .sort((a, b) => a.order - b.order)
      .map((img, index) => {
        const url = resolveImageUrl(img.url) || img.url;
        const r2Url = img.r2Url ? (resolveImageUrl(img.r2Url) || img.r2Url) : url;
        return {
          provider: img.provider,
          key: img.key,
          publicId: img.publicId,
          url,
          r2Url,
          isPrimary: index === 0,
          order: index
        };
      });

product.images = allImages;
  }

// Thumbnail update (optional)
if (req.body.thumbnailExistingUrl) {
  const rawThumb = req.body.thumbnailExistingUrl;
  const thumbUrl = resolveImageUrl(rawThumb) || rawThumb;
  product.images = [{
    url: thumbUrl,
    r2Url: thumbUrl,
    isPrimary: true,
    order: 0
  }];
}
if (req.body.thumbnailFileIndex !== undefined) {
  const idx = parseInt(req.body.thumbnailFileIndex, 10);
  const newThumb = uploadedNewImages.find(img => img.fileIndex === idx);
  if (newThumb) {
    const thumbUrl = resolveImageUrl(newThumb.url) || newThumb.url;
    product.images = [{
      url: thumbUrl,
      r2Url: newThumb.r2Url ? (resolveImageUrl(newThumb.r2Url) || newThumb.r2Url) : thumbUrl,
      isPrimary: true,
      order: 0
    }];
  }
}

// Update fields (variant images applied after so they are not overwritten by request variants)
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
    const sizesStock = (colorVariant.sizes || []).reduce((sizeSum, size) => {
      const tie = Number(size.tieStock) || 0;
      const elastic = Number(size.elasticStock) || 0;
      const bridal = Number(size.bridalStock) || 0;
      if (size.hasTieElastic || size.hasBridalLength || tie > 0 || elastic > 0 || bridal > 0) {
        size.stock = tie + elastic + bridal;
      } else {
        size.stock = Number(size.stock) || 0;
      }
      return sizeSum + size.stock;
    }, 0);
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
if (typeof updateFields.isOnSale === 'string') {
  updateFields.isOnSale = updateFields.isOnSale === 'true';
}
if (updateFields.onSale !== undefined) {
  updateFields.isOnSale = updateFields.onSale === true || updateFields.onSale === 'true';
}

// Convert numeric strings from FormData
const numericFields = ['price', 'originalPrice', 'costPrice', 'stock', 'lowStockThreshold', 'weight'];
numericFields.forEach(field => {
  if (updateFields[field] && typeof updateFields[field] === 'string') {
    updateFields[field] = parseFloat(updateFields[field]);
  }
});

// Handle category(s) update - accept legacy categoryId or new categories array
if (updateFields.categoryId && !updateFields.categories) {
  updateFields.categories = [updateFields.categoryId];
}
// Normalize categories if sent as JSON string or double-wrapped (FormData quirks)
if (updateFields.categories && typeof updateFields.categories === 'string') {
  try {
    updateFields.categories = JSON.parse(updateFields.categories);
  } catch (e) {
    // leave as-is; validation will catch it later
  }
}
// Handle case where categories is an array but contains a single JSON-stringified array element
if (Array.isArray(updateFields.categories) && updateFields.categories.length === 1 && typeof updateFields.categories[0] === 'string' && updateFields.categories[0].trim().startsWith('[')) {
  try {
    updateFields.categories = JSON.parse(updateFields.categories[0]);
  } catch (e) {
    // ignore, keep original
  }
}
if (updateFields.categories && Array.isArray(updateFields.categories)) {
  const selectedCategories = await Category.find({ _id: { $in: updateFields.categories }, isDeleted: { $ne: true } });
  if (selectedCategories.length !== updateFields.categories.length) {
    return next(new ApiError('One or more categories not found', 404));
  }
  const categoryPathSet = new Set();
  selectedCategories.forEach(cat => {
    (cat.path || []).forEach(p => categoryPathSet.add(p.toString()));
    categoryPathSet.add(cat._id.toString());
  });
  updateFields.categoryPath = Array.from(categoryPathSet).map(id => new mongoose.Types.ObjectId(id));
  product.categories = selectedCategories.map(c => c._id);
  product.categoryPath = updateFields.categoryPath;
}

// Remove fields that shouldn't be directly updated
delete updateFields.existingImages;
delete updateFields.newImagesOrder;
if (shouldUpdateImages) {
  delete updateFields.images;
}
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

// Apply variant images after updateFields so request variants don't overwrite them
// Expect req.body.variantImageMap = JSON.stringify([{ colorId, fileIndexes: [0,1], existingUrls: [] }])
if (req.body.variantImageMap && Array.isArray(product.variants) && product.variants.length > 0) {
  let variantImageMap = [];
  try {
    variantImageMap = JSON.parse(req.body.variantImageMap);
  } catch (e) {
    variantImageMap = [];
  }
  const newImagesByFileIndex = {};
  const newR2ImagesByFileIndex = {};
  (uploadedNewImages || []).forEach(img => {
    newImagesByFileIndex[img.fileIndex] = img.url;
    newR2ImagesByFileIndex[img.fileIndex] = img.r2Url;
  });
  variantImageMap.forEach(mapping => {
    const { colorId, fileIndexes = [], existingUrls = [] } = mapping;
    const imagesForVariant = [];
    existingUrls.forEach((entry, idx) => {
      const rawUrl = typeof entry === 'string' ? entry : entry.url;
      const url = resolveImageUrl(rawUrl) || rawUrl;
      const r2Url = typeof entry === 'object' && entry.r2Url ? (resolveImageUrl(entry.r2Url) || entry.r2Url) : url;
      imagesForVariant.push({ url, r2Url, isPrimary: idx === 0 && fileIndexes.length === 0, order: imagesForVariant.length });
    });
    (fileIndexes || []).forEach((fi) => {
      const rawUrl = newImagesByFileIndex[fi];
      if (rawUrl) {
        const url = resolveImageUrl(rawUrl) || rawUrl;
        const r2Url = newR2ImagesByFileIndex[fi] ? (resolveImageUrl(newR2ImagesByFileIndex[fi]) || newR2ImagesByFileIndex[fi]) : url;
        imagesForVariant.push({ url, r2Url, isPrimary: existingUrls.length === 0 && imagesForVariant.length === 0, order: imagesForVariant.length });
      }
    });
    const colorVariant = product.variants.find(v => v.colorId === colorId);
    if (colorVariant) {
      colorVariant.images = imagesForVariant;
    }
  });
}

// Handle size chart mapping for updates (req.body.sizeChartMap)
if (req.body.sizeChartMap && Array.isArray(product.variants) && product.variants.length > 0) {
  let sizeChartMap = [];
  try {
    sizeChartMap = JSON.parse(req.body.sizeChartMap);
  } catch (e) {
    sizeChartMap = [];
  }

  const newImagesByFileIndex = {};
  const newR2ImagesByFileIndex = {};
  (uploadedNewImages || []).forEach(img => {
    newImagesByFileIndex[img.fileIndex] = img.url;
    newR2ImagesByFileIndex[img.fileIndex] = img.r2Url;
  });

  sizeChartMap.forEach(mapping => {
    const { colorId, sizeId, fileIndex, existingUrl } = mapping || {};
    if (!colorId || !sizeId) return;
    const rawUrl = (fileIndex != null && newImagesByFileIndex[fileIndex]) ? newImagesByFileIndex[fileIndex] : existingUrl;
    if (!rawUrl) return;
    const resolvedUrl = resolveImageUrl(rawUrl) || rawUrl;
    const r2Url = (fileIndex != null && newR2ImagesByFileIndex[fileIndex])
      ? (resolveImageUrl(newR2ImagesByFileIndex[fileIndex]) || newR2ImagesByFileIndex[fileIndex])
      : resolvedUrl;
    const colorVariant = product.variants.find(v => v.colorId === colorId);
    if (colorVariant && Array.isArray(colorVariant.sizes)) {
      const size = colorVariant.sizes.find(s => s.sizeId === sizeId);
      if (size) {
        size.sizeChartUrl = resolvedUrl;
        size.sizeChartR2Url = r2Url;
      }
    }
  });
}

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

// Invalidate cached product listings and homepage sections
cacheService.delPattern('products_');
cacheService.delPattern('homepage_');

// Safe post-save storage cleanup: only executed AFTER product.save() succeeds
// and verifies image is not used by variants, size charts, or other products
if (shouldUpdateImages && previousImages && previousImages.length > 0) {
  try {
    const currentProductUrls = new Set();
    (product.images || []).forEach(img => img?.url && currentProductUrls.add(img.url));
    (product.variants || []).forEach(v => {
      (v.images || []).forEach(img => img?.url && currentProductUrls.add(img.url));
      (v.sizes || []).forEach(s => s?.sizeChartUrl && currentProductUrls.add(s.sizeChartUrl));
    });

    const candidateRemovedImages = previousImages.filter(
      prevImg => prevImg && prevImg.url && !currentProductUrls.has(prevImg.url)
    );

    for (const removed of candidateRemovedImages) {
      const queryConditions = [
        { 'images.url': removed.url },
        { 'variants.images.url': removed.url },
        { 'variants.sizes.sizeChartUrl': removed.url }
      ];
      if (removed.key) {
        queryConditions.push({ 'images.key': removed.key });
        queryConditions.push({ 'variants.images.key': removed.key });
      }

      const isShared = await Product.countDocuments({
        _id: { $ne: product._id },
        isDeleted: { $ne: true },
        $or: queryConditions
      });

      if (isShared === 0) {
        await uploadService.deleteImage(removed, {
          productId: product._id.toString(),
          requestId: req.requestId
        });
      } else {
        console.log(`[UpdateProduct] Preserved shared image: ${removed.url}`);
      }
    }
  } catch (cleanupErr) {
    console.error('[UpdateProduct] Safe storage cleanup error:', cleanupErr.message);
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

  // Invalidate cached product listings and homepage sections
  cacheService.delPattern('products_');
  cacheService.delPattern('homepage_');

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

  cacheService.delPattern('products_');
  cacheService.delPattern('homepage_');

  res.json(
    new ApiResponse(200, { product }, 'Image deleted successfully')
  );
});

// @route   GET /api/products/featured
// @desc    Get featured products
// @access  Public
export const getFeaturedProducts = asyncHandler(async (req, res) => {
  const { limit = 8 } = req.query;

  const isBypassCache = Boolean(
    req.query._t ||
    req.query.fresh === 'true' ||
    req.headers['cache-control']?.includes('no-cache') ||
    req.headers['cache-control']?.includes('no-store') ||
    req.headers['pragma']?.includes('no-cache')
  );

  const cacheKey = `products_featured_${limit}`;
  if (!isBypassCache) {
    const cached = cacheService.get(cacheKey);
    if (cached) {
      return res.json(new ApiResponse(200, { products: cached }, 'Featured products retrieved (cached)'));
    }
  }

  const products = await Product.find({
    isFeatured: true,
    status: 'active',
    stock: { $gt: 0 },
    isDeleted: { $ne: true }
  })
    .sort('-createdAt')
    .limit(Number(limit))
    .populate('categories', 'name slug')
    .select(LISTING_PROJECTION);

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (!isBypassCache) {
    cacheService.set(cacheKey, products, 60);
  }

  res.json(
    new ApiResponse(200, { products }, 'Featured products retrieved')
  );
});

// @route   GET /api/products/new-arrivals
// @desc    Get new arrival products
// @access  Public
export const getNewArrivals = asyncHandler(async (req, res) => {
  const { limit = 8 } = req.query;

  const isBypassCache = Boolean(
    req.query._t ||
    req.query.fresh === 'true' ||
    req.headers['cache-control']?.includes('no-cache') ||
    req.headers['cache-control']?.includes('no-store') ||
    req.headers['pragma']?.includes('no-cache')
  );

  const cacheKey = `products_new_arrivals_${limit}`;
  if (!isBypassCache) {
    const cached = cacheService.get(cacheKey);
    if (cached) {
      return res.json(new ApiResponse(200, { products: cached }, 'New arrivals retrieved (cached)'));
    }
  }

  const products = await Product.find({
    isNewArrival: true,
    status: 'active',
    stock: { $gt: 0 },
    isDeleted: { $ne: true }
  })
    .sort('-publishedAt')
    .limit(Number(limit))
    .populate('categories', 'name slug')
    .select(LISTING_PROJECTION);

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (!isBypassCache) {
    cacheService.set(cacheKey, products, 60);
  }

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

  const cacheKey = `products_related_${id}_${limit}`;
  const cached = cacheService.get(cacheKey);
  if (cached) {
    return res.json(new ApiResponse(200, { products: cached }, 'Related products retrieved (cached)'));
  }

  const product = await Product.findOne({ _id: id, isDeleted: { $ne: true } });

  if (!product) {
    return res.status(200).json(
      new ApiResponse(200, { products: [] }, 'Product not found')
    );
  }

  // Build a robust category match list (support legacy categoryId, categories array, and categoryPath)
  const categoryIds = new Set();
  if (Array.isArray(product.categories)) product.categories.forEach(c => c && categoryIds.add(c.toString()));
  if (product.categoryId) categoryIds.add(product.categoryId.toString());
  if (Array.isArray(product.categoryPath)) product.categoryPath.forEach(c => c && categoryIds.add(c.toString()));

  const categoryIdArray = Array.from(categoryIds).map(id => new mongoose.Types.ObjectId(id));

  const relatedProducts = await Product.find({
    _id: { $ne: id },
    $or: [
      { categories: { $in: categoryIdArray } },
      { categoryPath: { $in: categoryIdArray } }
    ],
    status: 'active',
    stock: { $gt: 0 },
    isDeleted: { $ne: true }
  })
    .sort('-rating -soldCount')
    .limit(Number(limit))
    .populate('categories', 'name slug')
    .select(LISTING_PROJECTION);

  cacheService.set(cacheKey, relatedProducts, 120);

  res.json(
    new ApiResponse(200, { products: relatedProducts }, 'Related products retrieved')
  );
});

// @route   GET /api/products/check-availability
// @desc    Check slug and SKU availability
// @access  Public
export const checkProductAvailability = asyncHandler(async (req, res) => {
  const { slug, sku, excludeId } = req.query;

  const results = {
    slugAvailable: true,
    skuAvailable: true
  };

  // Build exclude query for edit mode (exclude the current product being edited)
  const excludeQuery = excludeId && mongoose.Types.ObjectId.isValid(excludeId)
    ? { _id: { $ne: new mongoose.Types.ObjectId(excludeId) } }
    : {};

  // Check ALL documents (including soft-deleted) because the schema-level unique
  // index on slug/sku applies to every document, not just active ones.
  // This ensures the availability check matches what the DB will actually reject.
  if (slug) {
    const cleanSlug = slug.trim().toLowerCase();
    const existingSlug = await Product.findOne({
      slug: cleanSlug,
      ...excludeQuery
    });
    if (existingSlug) {
      results.slugAvailable = false;
    }
  }

  if (sku) {
    const cleanSku = sku.trim();
    const existingSku = await Product.findOne({
      $or: [
        { sku: cleanSku },
        { 'variants.sizes.sku': cleanSku }
      ],
      ...excludeQuery
    });
    if (existingSku) {
      results.skuAvailable = false;
    }
  }

  res.json(
    new ApiResponse(200, results, 'Availability checked successfully')
  );
});


