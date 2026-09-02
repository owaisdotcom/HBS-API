import NavigationMenu from '../models/NavigationMenu.js';
import Hero from '../models/Hero.js';
import HeroSlider from '../models/HeroSlider.js';
import HomepageSection from '../models/HomepageSection.js';
import SiteSetting from '../models/SiteSetting.js';
import Product from '../models/Product.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import uploadService from '../services/upload.service.js';
import cacheService from '../services/cache.service.js';

// @route   GET /api/homepage/settings
// @desc    Get complete homepage configuration
// @access  Public
export const getHomepageSettings = asyncHandler(async (req, res) => {
  const cacheKey = 'homepage_settings';
  const cached = cacheService.get(cacheKey);
  if (cached) {
    return res.json(new ApiResponse(200, cached, 'Homepage settings retrieved successfully (cached)'));
  }

  // Get navigation menu
  const navigation = await NavigationMenu.findOne({
    position: 'header',
    isActive: true
  }).populate('menuItems.categoryId', 'name slug')
    .populate('menuItems.megaMenuColumns.items.categoryId', 'name slug');

  // Prefer hero slider (multiple slides) if present, otherwise fallback to single hero
  let hero = await HeroSlider.findOne({ isActive: true });
  if (!hero) {
    hero = await Hero.findOne({ isActive: true });
  }

  // Get homepage sections
  const homepageSections = await HomepageSection.findOne({ isActive: true })
    .populate('sections.categoryId', 'name slug image')
    .populate('sections.productIds', 'name slug price originalPrice images rating stock');

  // Get site settings
  const siteSettings = await SiteSetting.findOne({ key: 'general_settings' });

  // Build sections with products
  const sectionsWithProducts = await Promise.all(
    (homepageSections?.sections || []).map(async (section) => {
      let products = [];

      if (section.type === 'category_grid' || section.type === 'product_slider') {
        if (section.productSelection === 'manual') {
          products = await Product.find({
            _id: { $in: section.productIds },
            status: 'active'
          }).limit(section.productLimit);
        } else if (section.productSelection === 'newest') {
          const query = section.categoryId
            ? { $or: [{ categories: section.categoryId }, { categoryPath: section.categoryId }], status: 'active' }
            : { status: 'active' };
          products = await Product.find(query)
            .sort('-createdAt')
            .limit(section.productLimit);
        } else if (section.productSelection === 'bestselling') {
          const query = section.categoryId
            ? { $or: [{ categories: section.categoryId }, { categoryPath: section.categoryId }], status: 'active' }
            : { status: 'active' };
          products = await Product.find(query)
            .sort('-soldCount')
            .limit(section.productLimit);
        } else if (section.productSelection === 'featured') {
          const query = section.categoryId
            ? { $or: [{ categories: section.categoryId }, { categoryPath: section.categoryId }], isFeatured: true, status: 'active' }
            : { isFeatured: true, status: 'active' };
          products = await Product.find(query)
            .sort('-createdAt')
            .limit(section.productLimit);
        }
      }

      return {
        ...section.toObject(),
        products
      };
    })
  );

  const responseData = {
    navigation,
    hero,
    homepageSections: sectionsWithProducts,
    siteSettings
  };

  cacheService.set(cacheKey, responseData, 300);

  res.json(
    new ApiResponse(200, responseData, 'Homepage settings retrieved successfully')
  );
});

// @route   GET /api/homepage/navigation
// @desc    Get navigation menu
// @access  Public
export const getNavigation = asyncHandler(async (req, res) => {
  const { position = 'header' } = req.query;

  const navigation = await NavigationMenu.findOne({
    position,
    isActive: true
  }).populate('menuItems.categoryId', 'name slug')
    .populate('menuItems.children.categoryId', 'name slug')
    .populate('menuItems.children.children.categoryId', 'name slug'); // Third level

  // Transform menu items to include label from category if category-based
  if (navigation && navigation.menuItems) {
    navigation.menuItems = navigation.menuItems.map(item => {
      const itemObj = item.toObject();
      if (itemObj.itemType === 'category' && itemObj.categoryId) {
        itemObj.label = itemObj.categoryId.name;
        itemObj.link = `/category/${itemObj.categoryId.slug}`;
      }
      
      // Transform children (level 2)
      if (itemObj.children && itemObj.children.length > 0) {
        itemObj.children = itemObj.children.map(child => {
          const processedChild = { ...child };
          if (processedChild.itemType === 'category' && processedChild.categoryId) {
            processedChild.label = processedChild.categoryId.name;
            processedChild.link = `/category/${processedChild.categoryId.slug}`;
          }
          
          // Transform grandchildren (level 3)
          if (processedChild.children && processedChild.children.length > 0) {
            processedChild.children = processedChild.children.map(grandchild => {
              if (grandchild.itemType === 'category' && grandchild.categoryId) {
                return {
                  ...grandchild,
                  label: grandchild.categoryId.name,
                  link: `/category/${grandchild.categoryId.slug}`
                };
              }
              return grandchild;
            });
          }
          
          return processedChild;
        });
      }
      
      return itemObj;
    });
  }

  res.json(
    new ApiResponse(200, { navigation }, 'Navigation retrieved successfully')
  );
});

// @route   PUT /api/homepage/navigation/:id
// @desc    Update navigation menu
// @access  Private (Admin)
export const updateNavigation = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  let navigation = await NavigationMenu.findById(id);

  if (!navigation) {
    return next(new ApiError('Navigation not found', 404));
  }

  navigation = await NavigationMenu.findByIdAndUpdate(
    id,
    { ...req.body, updatedBy: req.admin.id },
    { new: true, runValidators: true }
  ).populate('menuItems.categoryId', 'name slug')
   .populate('menuItems.children.categoryId', 'name slug');

  cacheService.delPattern('homepage_');

  res.json(
    new ApiResponse(200, { navigation }, 'Navigation updated successfully')
  );
});

// @route   PUT /api/homepage/navigation
// @desc    Update or create navigation menu (simplified endpoint)
// @access  Private (Admin)
export const updateOrCreateNavigation = asyncHandler(async (req, res) => {
  const { position = 'header', menuItems } = req.body;

  let navigation = await NavigationMenu.findOne({ position });

  if (!navigation) {
    // Create new navigation
    navigation = await NavigationMenu.create({
      position,
      menuItems,
      updatedBy: req.admin.id,
      isActive: true
    });
  } else {
    // Update existing navigation
    navigation.menuItems = menuItems;
    navigation.updatedBy = req.admin.id;
    await navigation.save();
  }

  // Populate categories
  await navigation.populate('menuItems.categoryId', 'name slug');
  await navigation.populate('menuItems.children.categoryId', 'name slug');

  cacheService.delPattern('homepage_');

  res.json(
    new ApiResponse(200, { navigation }, 'Navigation updated successfully')
  );
});

// @route   GET /api/homepage/hero
// @desc    Get hero (single)
// @access  Public
export const getHero = asyncHandler(async (req, res) => {
  // Return the hero slider if available, otherwise the single hero
  let hero = await HeroSlider.findOne({ isActive: true });
  if (!hero) {
    hero = await Hero.findOne({ isActive: true });
    if (!hero) {
      hero = await Hero.create({ isActive: true });
    }
  }
  res.json(
    new ApiResponse(200, { hero: hero.toObject ? hero.toObject() : hero }, 'Hero retrieved successfully')
  );
});

// @route   PUT /api/homepage/hero
// @desc    Update or create hero (upsert)
// @access  Private (Admin)
export const updateOrCreateHero = asyncHandler(async (req, res) => {
  // Helper: clone and sanitize incoming payload to avoid immutable _id updates
  const sanitizePayload = (body) => {
    const update = JSON.parse(JSON.stringify(body || {}));
    // Remove top-level immutable fields if present
    delete update._id;
    delete update.__v;
    delete update.createdAt;
    delete update.updatedAt;
    return update;
  };

  // If payload contains slides, persist to HeroSlider; otherwise persist to Hero
  if (Array.isArray(req.body.slides)) {
    const clean = sanitizePayload(req.body);
    let heroSlider = await HeroSlider.findOne({ isActive: true });
    if (!heroSlider) {
      heroSlider = await HeroSlider.create({
        ...clean,
        updatedBy: req.admin.id,
        isActive: true
      });
    } else {
      heroSlider = await HeroSlider.findByIdAndUpdate(
        heroSlider._id,
        { ...clean, updatedBy: req.admin.id },
        { new: true, runValidators: true }
      );
    }

    res.json(
      new ApiResponse(200, { hero: heroSlider.toObject ? heroSlider.toObject() : heroSlider }, 'Hero slider updated successfully')
    );
    return;
  }

  // Legacy single-hero behavior
  const clean = sanitizePayload(req.body);
  let hero = await Hero.findOne({ isActive: true });
  if (!hero) {
    hero = await Hero.create({
      ...clean,
      updatedBy: req.admin.id,
      isActive: true
    });
  } else {
    hero = await Hero.findByIdAndUpdate(
      hero._id,
      { ...clean, updatedBy: req.admin.id },
      { new: true, runValidators: true }
    );
  }

  cacheService.delPattern('homepage_');

  res.json(
    new ApiResponse(200, { hero: hero.toObject ? hero.toObject() : hero }, 'Hero updated successfully')
  );
});

// @route   GET /api/homepage/sections
// @desc    Get homepage sections
// @access  Public
export const getHomepageSections = asyncHandler(async (req, res) => {
  const cacheKey = 'homepage_sections';
  const cached = cacheService.get(cacheKey);
  if (cached) {
    return res.json(new ApiResponse(200, { homepageSections: cached }, 'Homepage sections retrieved successfully (cached)'));
  }

  const homepageSections = await HomepageSection.findOne({ isActive: true })
    .populate('sections.categoryId', 'name slug image')
    .populate('sections.productIds', 'name slug price originalPrice images rating stock');

  cacheService.set(cacheKey, homepageSections, 300);

  res.json(
    new ApiResponse(200, { homepageSections }, 'Homepage sections retrieved successfully')
  );
});

// @route   PUT /api/homepage/sections
// @desc    Update or create homepage sections (upsert)
// @access  Private (Admin)
export const updateHomepageSections = asyncHandler(async (req, res, next) => {
  cacheService.delPattern('homepage_');
  // Upsert: Find the active homepage sections and update or create
  const homepageSections = await HomepageSection.findOneAndUpdate(
    { isActive: true },
    { 
      ...req.body, 
      isActive: true,
      updatedBy: req.admin.id 
    },
    { 
      new: true, 
      upsert: true, 
      runValidators: true,
      setDefaultsOnInsert: true
    }
  );

  res.json(
    new ApiResponse(200, { homepageSections }, 'Homepage sections updated successfully')
  );
});

// @route   GET /api/homepage/site-settings
// @desc    Get site settings
// @access  Public
export const getSiteSettings = asyncHandler(async (req, res) => {
  const siteSettings = await SiteSetting.findOne({ key: 'general_settings' });

  res.json(
    new ApiResponse(200, { siteSettings }, 'Site settings retrieved successfully')
  );
});

// @route   PUT /api/homepage/site-settings/:id?
// @desc    Update or create site settings (upsert)
// @access  Private (Admin)
export const updateSiteSettings = asyncHandler(async (req, res, next) => {
  // Handle logo/favicon uploads
  if (req.files) {
    if (req.files.logo) {
      const resLogo = await uploadService.uploadSingle(req.files.logo[0], 'hbs-settings');
      req.body.logo = typeof resLogo === 'string' ? resLogo : resLogo?.url;
    }
    if (req.files.favicon) {
      const resFav = await uploadService.uploadSingle(req.files.favicon[0], 'hbs-settings');
      req.body.favicon = typeof resFav === 'string' ? resFav : resFav?.url;
    }
  }

  // Upsert: Find by key 'general_settings' and update or create
  const siteSettings = await SiteSetting.findOneAndUpdate(
    { key: 'general_settings' },
    { 
      ...req.body, 
      key: 'general_settings', // Ensure key is set
      updatedBy: req.admin.id 
    },
    { 
      new: true, 
      upsert: true, 
      runValidators: true,
      setDefaultsOnInsert: true
    }
  );

  cacheService.delPattern('homepage_');

  res.json(
    new ApiResponse(200, { siteSettings }, 'Site settings updated successfully')
  );
});

