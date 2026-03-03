import NavigationMenu from '../models/NavigationMenu.js';
import Hero from '../models/Hero.js';
import HomepageSection from '../models/HomepageSection.js';
import SiteSetting from '../models/SiteSetting.js';
import Product from '../models/Product.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import uploadService from '../services/upload.service.js';

// @route   GET /api/homepage/settings
// @desc    Get complete homepage configuration
// @access  Public
export const getHomepageSettings = asyncHandler(async (req, res) => {
  // Get navigation menu
  const navigation = await NavigationMenu.findOne({
    position: 'header',
    isActive: true
  }).populate('menuItems.categoryId', 'name slug')
    .populate('menuItems.megaMenuColumns.items.categoryId', 'name slug');

  // Get hero (single)
  const hero = await Hero.findOne({ isActive: true });

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

  res.json(
    new ApiResponse(200, {
      navigation,
      hero,
      homepageSections: sectionsWithProducts,
      siteSettings
    }, 'Homepage settings retrieved successfully')
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

  res.json(
    new ApiResponse(200, { navigation }, 'Navigation updated successfully')
  );
});

// @route   GET /api/homepage/hero
// @desc    Get hero (single)
// @access  Public
export const getHero = asyncHandler(async (req, res) => {
  let hero = await Hero.findOne({ isActive: true });
  if (!hero) {
    hero = await Hero.create({
      isActive: true
    });
  }
  res.json(
    new ApiResponse(200, { hero: hero.toObject ? hero.toObject() : hero }, 'Hero retrieved successfully')
  );
});

// @route   PUT /api/homepage/hero
// @desc    Update or create hero (upsert)
// @access  Private (Admin)
export const updateOrCreateHero = asyncHandler(async (req, res) => {
  let hero = await Hero.findOne({ isActive: true });

  if (!hero) {
    hero = await Hero.create({
      ...req.body,
      updatedBy: req.admin.id,
      isActive: true
    });
  } else {
    hero = await Hero.findByIdAndUpdate(
      hero._id,
      { ...req.body, updatedBy: req.admin.id },
      { new: true, runValidators: true }
    );
  }

  res.json(
    new ApiResponse(200, { hero: hero.toObject ? hero.toObject() : hero }, 'Hero updated successfully')
  );
});

// @route   GET /api/homepage/sections
// @desc    Get homepage sections
// @access  Public
export const getHomepageSections = asyncHandler(async (req, res) => {
  const homepageSections = await HomepageSection.findOne({ isActive: true })
    .populate('sections.categoryId', 'name slug image')
    .populate('sections.productIds', 'name slug price originalPrice images rating stock');

  res.json(
    new ApiResponse(200, { homepageSections }, 'Homepage sections retrieved successfully')
  );
});

// @route   PUT /api/homepage/sections
// @desc    Update or create homepage sections (upsert)
// @access  Private (Admin)
export const updateHomepageSections = asyncHandler(async (req, res, next) => {
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
      const logoUrl = await uploadService.uploadSingle(req.files.logo[0], 'hbs-settings');
      req.body.logo = logoUrl;
    }
    if (req.files.favicon) {
      const faviconUrl = await uploadService.uploadSingle(req.files.favicon[0], 'hbs-settings');
      req.body.favicon = faviconUrl;
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

  res.json(
    new ApiResponse(200, { siteSettings }, 'Site settings updated successfully')
  );
});

