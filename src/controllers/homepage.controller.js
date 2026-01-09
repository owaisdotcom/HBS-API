import NavigationMenu from '../models/NavigationMenu.js';
import HeroSlider from '../models/HeroSlider.js';
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

  // Get hero slider
  const heroSlider = await HeroSlider.findOne({ isActive: true });

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
            ? { categoryId: section.categoryId, status: 'active' }
            : { status: 'active' };
          products = await Product.find(query)
            .sort('-createdAt')
            .limit(section.productLimit);
        } else if (section.productSelection === 'bestselling') {
          const query = section.categoryId
            ? { categoryId: section.categoryId, status: 'active' }
            : { status: 'active' };
          products = await Product.find(query)
            .sort('-soldCount')
            .limit(section.productLimit);
        } else if (section.productSelection === 'featured') {
          const query = section.categoryId
            ? { categoryId: section.categoryId, isFeatured: true, status: 'active' }
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
      heroSlider,
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
    .populate('menuItems.megaMenuColumns.items.categoryId', 'name slug');

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
  );

  res.json(
    new ApiResponse(200, { navigation }, 'Navigation updated successfully')
  );
});

// @route   GET /api/homepage/hero-slider
// @desc    Get hero slider
// @access  Public
export const getHeroSlider = asyncHandler(async (req, res) => {
  const heroSlider = await HeroSlider.findOne({ isActive: true });

  res.json(
    new ApiResponse(200, { heroSlider }, 'Hero slider retrieved successfully')
  );
});

// @route   PUT /api/homepage/hero-slider/:id
// @desc    Update hero slider
// @access  Private (Admin)
export const updateHeroSlider = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  let heroSlider = await HeroSlider.findById(id);

  if (!heroSlider) {
    return next(new ApiError('Hero slider not found', 404));
  }

  // Handle image uploads for slides
  if (req.files && req.files.length > 0) {
    // Process uploaded images - implementation depends on your needs
  }

  heroSlider = await HeroSlider.findByIdAndUpdate(
    id,
    { ...req.body, updatedBy: req.admin.id },
    { new: true, runValidators: true }
  );

  res.json(
    new ApiResponse(200, { heroSlider }, 'Hero slider updated successfully')
  );
});

// @route   POST /api/homepage/hero-slider/:id/slides
// @desc    Add slide to hero slider
// @access  Private (Admin)
export const addSlide = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const heroSlider = await HeroSlider.findById(id);

  if (!heroSlider) {
    return next(new ApiError('Hero slider not found', 404));
  }

  // Handle image upload
  let slideImage = {};
  if (req.file) {
    const imageUrl = await uploadService.uploadSingle(req.file, 'hbs-hero');
    slideImage.desktop = imageUrl;
    slideImage.tablet = imageUrl;
    slideImage.mobile = imageUrl;
  }

  const newSlide = {
    ...req.body,
    image: slideImage,
    displayOrder: heroSlider.slides.length
  };

  heroSlider.slides.push(newSlide);
  heroSlider.updatedBy = req.admin.id;
  await heroSlider.save();

  res.status(201).json(
    new ApiResponse(201, { heroSlider }, 'Slide added successfully')
  );
});

// @route   DELETE /api/homepage/hero-slider/:id/slides/:slideId
// @desc    Delete slide from hero slider
// @access  Private (Admin)
export const deleteSlide = asyncHandler(async (req, res, next) => {
  const { id, slideId } = req.params;

  const heroSlider = await HeroSlider.findById(id);

  if (!heroSlider) {
    return next(new ApiError('Hero slider not found', 404));
  }

  heroSlider.slides = heroSlider.slides.filter(
    slide => slide._id.toString() !== slideId
  );

  heroSlider.updatedBy = req.admin.id;
  await heroSlider.save();

  res.json(
    new ApiResponse(200, { heroSlider }, 'Slide deleted successfully')
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

// @route   PUT /api/homepage/sections/:id
// @desc    Update homepage sections
// @access  Private (Admin)
export const updateHomepageSections = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  let homepageSections = await HomepageSection.findById(id);

  if (!homepageSections) {
    return next(new ApiError('Homepage sections not found', 404));
  }

  homepageSections = await HomepageSection.findByIdAndUpdate(
    id,
    { ...req.body, updatedBy: req.admin.id },
    { new: true, runValidators: true }
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

// @route   PUT /api/homepage/site-settings/:id
// @desc    Update site settings
// @access  Private (Admin)
export const updateSiteSettings = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  let siteSettings = await SiteSetting.findById(id);

  if (!siteSettings) {
    return next(new ApiError('Site settings not found', 404));
  }

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

  siteSettings = await SiteSetting.findByIdAndUpdate(
    id,
    { ...req.body, updatedBy: req.admin.id },
    { new: true, runValidators: true }
  );

  res.json(
    new ApiResponse(200, { siteSettings }, 'Site settings updated successfully')
  );
});

