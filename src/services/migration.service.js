import Product from '../models/Product.js';
import Category from '../models/Category.js';
import BundleCategory from '../models/BundleCategory.js';
import PreMadeBundle from '../models/PreMadeBundle.js';
import Order from '../models/Order.js';
import SiteSetting from '../models/SiteSetting.js';
import HeroSlider from '../models/HeroSlider.js';
import Hero from '../models/Hero.js';
import Testimonial from '../models/Testimonial.js';
import Review from '../models/Review.js';
import {
  getR2PublicUrl,
  getCustomDomain,
  getR2DevDomain,
  extractImageKey,
  resolveImageUrl,
  generateR2Url,
  generateCustomDomainUrl
} from '../utils/imageUrl.js';

/**
 * Transforms any Cloudinary image URL to the corresponding R2 public URL.
 */
export function transformUrl(url, r2PublicUrl) {
  if (!url || typeof url !== 'string') return url;
  if (!url.includes('res.cloudinary.com')) return url;

  // Match Cloudinary domain + optional transform params + optional version prefix
  const match = url.match(/https?:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/(?:[a-z0-9_,]+\/)*(?:v\d+\/)?(.+)/i);
  if (match && match[1]) {
    const key = match[1];
    return `${r2PublicUrl}/${key}`;
  }
  return url;
}

/**
 * Extracts object key from Cloudinary or R2 URL.
 */
export function extractKey(url, r2PublicUrl) {
  if (!url || typeof url !== 'string') return undefined;
  if (url.startsWith(r2PublicUrl)) {
    return url.replace(`${r2PublicUrl}/`, '');
  }
  const match = url.match(/https?:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/(?:[a-z0-9_,]+\/)*(?:v\d+\/)?(.+)/i);
  if (match && match[1]) {
    return match[1];
  }
  return undefined;
}

/**
 * Executes Cloudinary to Cloudflare R2 Database URL Migration
 * @param {object} options
 * @param {boolean} [options.dryRun=false] - If true, previews changes without saving to MongoDB.
 * @returns {Promise<object>} Summary of migration results
 */
export async function runCloudinaryToR2Migration({ dryRun = false } = {}) {
  const r2PublicUrl = getR2PublicUrl();

  let totalUpdatedDocs = 0;
  let totalReplacedUrls = 0;

  const details = {
    products: { scanned: 0, updated: 0 },
    categories: { scanned: 0, updated: 0 },
    bundleCategories: { scanned: 0, updated: 0 },
    preMadeBundles: { scanned: 0, updated: 0 },
    orders: { scanned: 0, updated: 0 },
    siteSettings: { scanned: 0, updated: 0 },
    heroSliders: { scanned: 0, updated: 0 },
    heroes: { scanned: 0, updated: 0 },
    testimonials: { scanned: 0, updated: 0 },
    reviews: { scanned: 0, updated: 0 }
  };

  // 1. Products
  const products = await Product.find({});
  details.products.scanned = products.length;
  for (const product of products) {
    let isModified = false;

    if (Array.isArray(product.images) && product.images.length > 0) {
      product.images.forEach((img) => {
        if (img.url && img.url.includes('res.cloudinary.com')) {
          const oldUrl = img.url;
          img.url = transformUrl(oldUrl, r2PublicUrl);
          img.provider = 'r2';
          img.key = extractKey(oldUrl, r2PublicUrl) || img.key;
          isModified = true;
          totalReplacedUrls++;
        } else if (img.url && img.url.startsWith(r2PublicUrl) && img.provider !== 'r2') {
          img.provider = 'r2';
          img.key = extractKey(img.url, r2PublicUrl) || img.key;
          isModified = true;
        }
      });
    }

    if (Array.isArray(product.variants) && product.variants.length > 0) {
      product.variants.forEach((variant) => {
        if (Array.isArray(variant.images) && variant.images.length > 0) {
          variant.images.forEach((vImg) => {
            if (vImg.url && vImg.url.includes('res.cloudinary.com')) {
              const oldUrl = vImg.url;
              vImg.url = transformUrl(oldUrl, r2PublicUrl);
              vImg.provider = 'r2';
              vImg.key = extractKey(oldUrl, r2PublicUrl) || vImg.key;
              isModified = true;
              totalReplacedUrls++;
            }
          });
        }
        if (Array.isArray(variant.sizes)) {
          variant.sizes.forEach((size) => {
            if (size.sizeChartUrl && size.sizeChartUrl.includes('res.cloudinary.com')) {
              size.sizeChartUrl = transformUrl(size.sizeChartUrl, r2PublicUrl);
              isModified = true;
              totalReplacedUrls++;
            }
          });
        }
      });
    }

    if (isModified) {
      details.products.updated++;
      if (!dryRun) await product.save();
    }
  }

  // 2. Categories
  const categories = await Category.find({});
  details.categories.scanned = categories.length;
  for (const cat of categories) {
    let isModified = false;
    if (cat.thumbnail && cat.thumbnail.includes('res.cloudinary.com')) {
      cat.thumbnail = transformUrl(cat.thumbnail, r2PublicUrl);
      isModified = true;
      totalReplacedUrls++;
    }
    if (cat.coverImage && cat.coverImage.includes('res.cloudinary.com')) {
      cat.coverImage = transformUrl(cat.coverImage, r2PublicUrl);
      isModified = true;
      totalReplacedUrls++;
    }
    if (isModified) {
      details.categories.updated++;
      if (!dryRun) await cat.save();
    }
  }

  // 3. Bundle Categories
  const bundleCategories = await BundleCategory.find({});
  details.bundleCategories.scanned = bundleCategories.length;
  for (const bCat of bundleCategories) {
    let isModified = false;
    if (bCat.thumbnail && bCat.thumbnail.includes('res.cloudinary.com')) {
      bCat.thumbnail = transformUrl(bCat.thumbnail, r2PublicUrl);
      isModified = true;
      totalReplacedUrls++;
    }
    if (bCat.coverImage && bCat.coverImage.includes('res.cloudinary.com')) {
      bCat.coverImage = transformUrl(bCat.coverImage, r2PublicUrl);
      isModified = true;
      totalReplacedUrls++;
    }
    if (isModified) {
      details.bundleCategories.updated++;
      if (!dryRun) await bCat.save();
    }
  }

  // 4. PreMadeBundles
  const bundles = await PreMadeBundle.find({});
  details.preMadeBundles.scanned = bundles.length;
  for (const bundle of bundles) {
    let isModified = false;
    if (Array.isArray(bundle.images) && bundle.images.length > 0) {
      bundle.images.forEach((img) => {
        if (img.url && img.url.includes('res.cloudinary.com')) {
          const oldUrl = img.url;
          img.url = transformUrl(oldUrl, r2PublicUrl);
          img.provider = 'r2';
          img.key = extractKey(oldUrl, r2PublicUrl) || img.key;
          isModified = true;
          totalReplacedUrls++;
        }
      });
    }
    if (isModified) {
      details.preMadeBundles.updated++;
      if (!dryRun) await bundle.save();
    }
  }

  // 5. Orders
  const orders = await Order.find({});
  details.orders.scanned = orders.length;
  for (const order of orders) {
    let isModified = false;
    if (order.paymentReceipt && order.paymentReceipt.url && order.paymentReceipt.url.includes('res.cloudinary.com')) {
      const oldUrl = order.paymentReceipt.url;
      order.paymentReceipt.url = transformUrl(oldUrl, r2PublicUrl);
      order.paymentReceipt.provider = 'r2';
      order.paymentReceipt.key = extractKey(oldUrl, r2PublicUrl) || order.paymentReceipt.key;
      isModified = true;
      totalReplacedUrls++;
    }
    if (isModified) {
      details.orders.updated++;
      if (!dryRun) await order.save();
    }
  }

  // 6. SiteSettings
  const settings = await SiteSetting.find({});
  details.siteSettings.scanned = settings.length;
  for (const setting of settings) {
    let isModified = false;
    ['logo', 'favicon'].forEach((f) => {
      if (setting[f] && setting[f].includes('res.cloudinary.com')) {
        setting[f] = transformUrl(setting[f], r2PublicUrl);
        isModified = true;
        totalReplacedUrls++;
      }
    });

    if (setting.seo && setting.seo.ogImage && setting.seo.ogImage.includes('res.cloudinary.com')) {
      setting.seo.ogImage = transformUrl(setting.seo.ogImage, r2PublicUrl);
      isModified = true;
      totalReplacedUrls++;
    }

    if (setting.contentBlocks) {
      ['hijabNiqab', 'elegance'].forEach((blockKey) => {
        if (setting.contentBlocks[blockKey] && setting.contentBlocks[blockKey].image && setting.contentBlocks[blockKey].image.includes('res.cloudinary.com')) {
          setting.contentBlocks[blockKey].image = transformUrl(setting.contentBlocks[blockKey].image, r2PublicUrl);
          isModified = true;
          totalReplacedUrls++;
        }
      });
    }

    if (setting.marketingBanner && setting.marketingBanner.image && setting.marketingBanner.image.includes('res.cloudinary.com')) {
      setting.marketingBanner.image = transformUrl(setting.marketingBanner.image, r2PublicUrl);
      isModified = true;
      totalReplacedUrls++;
    }

    if (setting.footer && Array.isArray(setting.footer.paymentMethodImages)) {
      setting.footer.paymentMethodImages = setting.footer.paymentMethodImages.map((img) => {
        if (img && img.includes('res.cloudinary.com')) {
          isModified = true;
          totalReplacedUrls++;
          return transformUrl(img, r2PublicUrl);
        }
        return img;
      });
    }

    if (isModified) {
      details.siteSettings.updated++;
      if (!dryRun) await setting.save();
    }
  }

  // 7. HeroSliders
  const sliders = await HeroSlider.find({});
  details.heroSliders.scanned = sliders.length;
  for (const slider of sliders) {
    let isModified = false;
    if (Array.isArray(slider.slides)) {
      slider.slides.forEach((slide) => {
        if (slide.imageUrl && slide.imageUrl.includes('res.cloudinary.com')) {
          slide.imageUrl = transformUrl(slide.imageUrl, r2PublicUrl);
          isModified = true;
          totalReplacedUrls++;
        }
        if (slide.image) {
          ['desktop', 'tablet', 'mobile'].forEach((device) => {
            if (slide.image[device] && slide.image[device].includes('res.cloudinary.com')) {
              slide.image[device] = transformUrl(slide.image[device], r2PublicUrl);
              isModified = true;
              totalReplacedUrls++;
            }
          });
        }
      });
    }
    if (isModified) {
      details.heroSliders.updated++;
      if (!dryRun) await slider.save();
    }
  }

  // 8. Heroes
  const heroes = await Hero.find({});
  details.heroes.scanned = heroes.length;
  for (const hero of heroes) {
    let isModified = false;
    ['imageUrl', 'desktopImage', 'mobileImage'].forEach((f) => {
      if (hero[f] && hero[f].includes('res.cloudinary.com')) {
        hero[f] = transformUrl(hero[f], r2PublicUrl);
        isModified = true;
        totalReplacedUrls++;
      }
    });
    if (isModified) {
      details.heroes.updated++;
      if (!dryRun) await hero.save();
    }
  }

  // 9. Testimonials
  const testimonials = await Testimonial.find({});
  details.testimonials.scanned = testimonials.length;
  for (const item of testimonials) {
    let isModified = false;
    if (item.customerImage && item.customerImage.includes('res.cloudinary.com')) {
      item.customerImage = transformUrl(item.customerImage, r2PublicUrl);
      isModified = true;
      totalReplacedUrls++;
    }
    if (item.image && item.image.includes('res.cloudinary.com')) {
      item.image = transformUrl(item.image, r2PublicUrl);
      isModified = true;
      totalReplacedUrls++;
    }
    if (isModified) {
      details.testimonials.updated++;
      if (!dryRun) await item.save();
    }
  }

  // 10. Reviews
  const reviews = await Review.find({});
  details.reviews.scanned = reviews.length;
  for (const review of reviews) {
    let isModified = false;
    if (Array.isArray(review.images) && review.images.length > 0) {
      review.images = review.images.map((img) => {
        if (typeof img === 'string' && img.includes('res.cloudinary.com')) {
          isModified = true;
          totalReplacedUrls++;
          return transformUrl(img, r2PublicUrl);
        }
        return img;
      });
    }
    if (isModified) {
      details.reviews.updated++;
      if (!dryRun) await review.save();
    }
  }

  totalUpdatedDocs = Object.values(details).reduce((sum, item) => sum + item.updated, 0);

  return {
    dryRun,
    r2PublicUrl,
    totalUpdatedDocs,
    totalReplacedUrls,
    details
  };
}

/**
 * Migration helper to process a single URL field and its corresponding r2Url field.
 */
function processDualUrlField(doc, urlField, r2UrlField, stats, colStats) {
  const currentUrl = doc[urlField];
  const currentR2Url = doc[r2UrlField];

  if (!currentUrl && !currentR2Url) return false;

  stats.totalImagesFound++;
  colStats.totalImages++;

  const devDomain = getR2DevDomain();
  const customDomain = getCustomDomain();

  // If already migrated with valid dev URL
  if (currentR2Url && typeof currentR2Url === 'string' && currentR2Url.startsWith(devDomain)) {
    stats.alreadyMigratedCount++;
    colStats.alreadyMigrated++;
    return false;
  }

  const key = extractImageKey(currentUrl || currentR2Url);
  if (!key) {
    stats.skippedCount++;
    colStats.skipped++;
    return false;
  }

  const newR2Url = `${devDomain}/${key}`;
  const newCustomUrl = (currentUrl && currentUrl.startsWith(customDomain))
    ? currentUrl
    : `${customDomain}/${key}`;

  doc[r2UrlField] = newR2Url;
  if (!doc[urlField] || !doc[urlField].startsWith(customDomain)) {
    doc[urlField] = newCustomUrl;
  }

  stats.migratedCount++;
  colStats.migrated++;
  return true;
}

/**
 * Migration helper for image objects ({ url, r2Url, key, provider, ... })
 */
function processDualImageObject(imgObj, stats, colStats) {
  if (!imgObj) return false;

  const currentUrl = typeof imgObj === 'string' ? imgObj : imgObj.url;
  const currentR2Url = typeof imgObj === 'object' ? imgObj.r2Url : null;

  if (!currentUrl && !currentR2Url) return false;

  stats.totalImagesFound++;
  colStats.totalImages++;

  const devDomain = getR2DevDomain();
  const customDomain = getCustomDomain();

  if (currentR2Url && typeof currentR2Url === 'string' && currentR2Url.startsWith(devDomain)) {
    stats.alreadyMigratedCount++;
    colStats.alreadyMigrated++;
    return false;
  }

  const key = extractImageKey(currentUrl || currentR2Url);
  if (!key) {
    stats.skippedCount++;
    colStats.skipped++;
    return false;
  }

  const newR2Url = `${devDomain}/${key}`;
  const newCustomUrl = (currentUrl && currentUrl.startsWith(customDomain))
    ? currentUrl
    : `${customDomain}/${key}`;

  if (typeof imgObj === 'object') {
    imgObj.r2Url = newR2Url;
    imgObj.url = newCustomUrl;
    imgObj.key = key;
    imgObj.provider = 'r2';
  }

  stats.migratedCount++;
  colStats.migrated++;
  return true;
}

/**
 * Migration helper for arrays of image strings (e.g. variantImages -> variantR2Images)
 */
function processDualStringArray(doc, arrayField, r2ArrayField, stats, colStats) {
  const currentArr = doc[arrayField];
  if (!Array.isArray(currentArr) || currentArr.length === 0) return false;

  if (!Array.isArray(doc[r2ArrayField])) {
    doc[r2ArrayField] = [];
  }

  const devDomain = getR2DevDomain();
  let modified = false;

  currentArr.forEach((strUrl, idx) => {
    if (!strUrl || typeof strUrl !== 'string' || !strUrl.trim()) return;

    stats.totalImagesFound++;
    colStats.totalImages++;

    const existingR2 = doc[r2ArrayField][idx];
    if (existingR2 && typeof existingR2 === 'string' && existingR2.startsWith(devDomain)) {
      stats.alreadyMigratedCount++;
      colStats.alreadyMigrated++;
      return;
    }

    const key = extractImageKey(strUrl);
    if (!key) {
      stats.skippedCount++;
      colStats.skipped++;
      return;
    }

    doc[r2ArrayField][idx] = `${devDomain}/${key}`;
    stats.migratedCount++;
    colStats.migrated++;
    modified = true;
  });

  return modified;
}

/**
 * Executes Database-Level Dual R2 Image URLs Migration
 *
 * Scans all collections, assigns r2Url pointing to Cloudflare R2 development public domain,
 * preserves custom domain url, skips already migrated images, handles missing/invalid URLs safely,
 * and maintains idempotency.
 *
 * @param {object} options
 * @param {boolean} [options.dryRun=false] - If true, previews changes without writing to database.
 * @returns {Promise<object>} Detailed migration result and statistics
 */
export async function runDualR2UrlMigration({ dryRun = false } = {}) {
  const customDomain = getCustomDomain();
  const r2DevDomain = getR2DevDomain();

  const stats = {
    totalImagesFound: 0,
    migratedCount: 0,
    alreadyMigratedCount: 0,
    skippedCount: 0,
    failedCount: 0
  };

  const createColStat = () => ({
    scanned: 0,
    totalImages: 0,
    migrated: 0,
    alreadyMigrated: 0,
    skipped: 0,
    failed: 0,
    updated: 0
  });

  const details = {
    products: createColStat(),
    categories: createColStat(),
    bundleCategories: createColStat(),
    preMadeBundles: createColStat(),
    orders: createColStat(),
    siteSettings: createColStat(),
    heroSliders: createColStat(),
    heroes: createColStat(),
    testimonials: createColStat(),
    reviews: createColStat()
  };

  // 1. Products
  try {
    const products = await Product.find({});
    details.products.scanned = products.length;
    for (const product of products) {
      let isModified = false;
      try {
        if (Array.isArray(product.images)) {
          product.images.forEach(img => {
            if (processDualImageObject(img, stats, details.products)) {
              isModified = true;
            }
          });
        }

        if (Array.isArray(product.variants)) {
          product.variants.forEach(variant => {
            if (Array.isArray(variant.images)) {
              variant.images.forEach(vImg => {
                if (processDualImageObject(vImg, stats, details.products)) {
                  isModified = true;
                }
              });
            }
            if (Array.isArray(variant.sizes)) {
              variant.sizes.forEach(size => {
                if (processDualUrlField(size, 'sizeChartUrl', 'sizeChartR2Url', stats, details.products)) {
                  isModified = true;
                }
              });
            }
          });
        }

        if (isModified) {
          details.products.updated++;
          if (!dryRun) await product.save();
        }
      } catch (err) {
        console.error(`Error migrating product ${product._id}:`, err);
        details.products.failed++;
        stats.failedCount++;
      }
    }
  } catch (err) {
    console.error('Error querying products for migration:', err);
  }

  // 2. Categories
  try {
    const categories = await Category.find({});
    details.categories.scanned = categories.length;
    for (const cat of categories) {
      let isModified = false;
      try {
        if (processDualUrlField(cat, 'thumbnail', 'thumbnailR2Url', stats, details.categories)) {
          isModified = true;
        }
        if (processDualUrlField(cat, 'coverImage', 'coverImageR2Url', stats, details.categories)) {
          isModified = true;
        }
        if (isModified) {
          details.categories.updated++;
          if (!dryRun) await cat.save();
        }
      } catch (err) {
        console.error(`Error migrating category ${cat._id}:`, err);
        details.categories.failed++;
        stats.failedCount++;
      }
    }
  } catch (err) {
    console.error('Error querying categories for migration:', err);
  }

  // 3. Bundle Categories
  try {
    const bundleCategories = await BundleCategory.find({});
    details.bundleCategories.scanned = bundleCategories.length;
    for (const bCat of bundleCategories) {
      let isModified = false;
      try {
        if (processDualUrlField(bCat, 'thumbnail', 'thumbnailR2Url', stats, details.bundleCategories)) {
          isModified = true;
        }
        if (processDualUrlField(bCat, 'coverImage', 'coverImageR2Url', stats, details.bundleCategories)) {
          isModified = true;
        }
        if (isModified) {
          details.bundleCategories.updated++;
          if (!dryRun) await bCat.save();
        }
      } catch (err) {
        console.error(`Error migrating bundleCategory ${bCat._id}:`, err);
        details.bundleCategories.failed++;
        stats.failedCount++;
      }
    }
  } catch (err) {
    console.error('Error querying bundleCategories for migration:', err);
  }

  // 4. PreMadeBundles
  try {
    const bundles = await PreMadeBundle.find({});
    details.preMadeBundles.scanned = bundles.length;
    for (const bundle of bundles) {
      let isModified = false;
      try {
        if (Array.isArray(bundle.images)) {
          bundle.images.forEach(img => {
            if (processDualImageObject(img, stats, details.preMadeBundles)) {
              isModified = true;
            }
          });
        }
        if (isModified) {
          details.preMadeBundles.updated++;
          if (!dryRun) await bundle.save();
        }
      } catch (err) {
        console.error(`Error migrating preMadeBundle ${bundle._id}:`, err);
        details.preMadeBundles.failed++;
        stats.failedCount++;
      }
    }
  } catch (err) {
    console.error('Error querying preMadeBundles for migration:', err);
  }

  // 5. Orders
  try {
    const orders = await Order.find({});
    details.orders.scanned = orders.length;
    for (const order of orders) {
      let isModified = false;
      try {
        if (order.paymentReceipt && processDualUrlField(order.paymentReceipt, 'url', 'r2Url', stats, details.orders)) {
          isModified = true;
        }
        if (Array.isArray(order.items)) {
          order.items.forEach(item => {
            if (processDualUrlField(item, 'productImage', 'productImageR2Url', stats, details.orders)) {
              isModified = true;
            }
            if (processDualUrlField(item, 'variantImage', 'variantImageR2Url', stats, details.orders)) {
              isModified = true;
            }
            if (processDualUrlField(item, 'orderedVariantImage', 'orderedVariantImageR2Url', stats, details.orders)) {
              isModified = true;
            }
            if (processDualStringArray(item, 'variantImages', 'variantR2Images', stats, details.orders)) {
              isModified = true;
            }
            if (processDualStringArray(item, 'orderedVariantImages', 'orderedVariantR2Images', stats, details.orders)) {
              isModified = true;
            }
          });
        }
        if (isModified) {
          details.orders.updated++;
          if (!dryRun) await order.save();
        }
      } catch (err) {
        console.error(`Error migrating order ${order._id}:`, err);
        details.orders.failed++;
        stats.failedCount++;
      }
    }
  } catch (err) {
    console.error('Error querying orders for migration:', err);
  }

  // 6. SiteSettings
  try {
    const settings = await SiteSetting.find({});
    details.siteSettings.scanned = settings.length;
    for (const setting of settings) {
      let isModified = false;
      try {
        if (processDualUrlField(setting, 'logo', 'logoR2Url', stats, details.siteSettings)) {
          isModified = true;
        }
        if (processDualUrlField(setting, 'favicon', 'faviconR2Url', stats, details.siteSettings)) {
          isModified = true;
        }
        if (setting.seo && processDualUrlField(setting.seo, 'ogImage', 'ogImageR2Url', stats, details.siteSettings)) {
          isModified = true;
        }
        if (setting.contentBlocks) {
          if (setting.contentBlocks.hijabNiqab && processDualUrlField(setting.contentBlocks.hijabNiqab, 'image', 'imageR2Url', stats, details.siteSettings)) {
            isModified = true;
          }
          if (setting.contentBlocks.elegance && processDualUrlField(setting.contentBlocks.elegance, 'image', 'imageR2Url', stats, details.siteSettings)) {
            isModified = true;
          }
        }
        if (setting.marketingBanner && processDualUrlField(setting.marketingBanner, 'image', 'imageR2Url', stats, details.siteSettings)) {
          isModified = true;
        }
        if (setting.footer && processDualStringArray(setting.footer, 'paymentMethodImages', 'paymentMethodR2Images', stats, details.siteSettings)) {
          isModified = true;
        }
        if (isModified) {
          details.siteSettings.updated++;
          if (!dryRun) await setting.save();
        }
      } catch (err) {
        console.error(`Error migrating siteSetting ${setting._id}:`, err);
        details.siteSettings.failed++;
        stats.failedCount++;
      }
    }
  } catch (err) {
    console.error('Error querying siteSettings for migration:', err);
  }

  // 7. HeroSliders
  try {
    const sliders = await HeroSlider.find({});
    details.heroSliders.scanned = sliders.length;
    for (const slider of sliders) {
      let isModified = false;
      try {
        if (Array.isArray(slider.slides)) {
          slider.slides.forEach(slide => {
            if (processDualUrlField(slide, 'imageUrl', 'imageUrlR2Url', stats, details.heroSliders)) {
              slide.r2Url = slide.imageUrlR2Url;
              isModified = true;
            }
            if (slide.image) {
              ['desktop', 'tablet', 'mobile'].forEach(dev => {
                if (processDualUrlField(slide.image, dev, `${dev}R2Url`, stats, details.heroSliders)) {
                  isModified = true;
                }
              });
            }
          });
        }
        if (isModified) {
          details.heroSliders.updated++;
          if (!dryRun) await slider.save();
        }
      } catch (err) {
        console.error(`Error migrating heroSlider ${slider._id}:`, err);
        details.heroSliders.failed++;
        stats.failedCount++;
      }
    }
  } catch (err) {
    console.error('Error querying heroSliders for migration:', err);
  }

  // 8. Heroes
  try {
    const heroes = await Hero.find({});
    details.heroes.scanned = heroes.length;
    for (const hero of heroes) {
      let isModified = false;
      try {
        if (processDualUrlField(hero, 'imageUrl', 'imageUrlR2Url', stats, details.heroes)) {
          hero.r2Url = hero.imageUrlR2Url;
          isModified = true;
        }
        if (isModified) {
          details.heroes.updated++;
          if (!dryRun) await hero.save();
        }
      } catch (err) {
        console.error(`Error migrating hero ${hero._id}:`, err);
        details.heroes.failed++;
        stats.failedCount++;
      }
    }
  } catch (err) {
    console.error('Error querying heroes for migration:', err);
  }

  // 9. Testimonials
  try {
    const testimonials = await Testimonial.find({});
    details.testimonials.scanned = testimonials.length;
    for (const item of testimonials) {
      let isModified = false;
      try {
        if (processDualUrlField(item, 'customerImage', 'customerImageR2Url', stats, details.testimonials)) {
          item.r2Url = item.customerImageR2Url;
          isModified = true;
        }
        if (isModified) {
          details.testimonials.updated++;
          if (!dryRun) await item.save();
        }
      } catch (err) {
        console.error(`Error migrating testimonial ${item._id}:`, err);
        details.testimonials.failed++;
        stats.failedCount++;
      }
    }
  } catch (err) {
    console.error('Error querying testimonials for migration:', err);
  }

  // 10. Reviews
  try {
    const reviews = await Review.find({});
    details.reviews.scanned = reviews.length;
    for (const review of reviews) {
      let isModified = false;
      try {
        if (processDualStringArray(review, 'images', 'r2Images', stats, details.reviews)) {
          isModified = true;
        }
        if (isModified) {
          details.reviews.updated++;
          if (!dryRun) await review.save();
        }
      } catch (err) {
        console.error(`Error migrating review ${review._id}:`, err);
        details.reviews.failed++;
        stats.failedCount++;
      }
    }
  } catch (err) {
    console.error('Error querying reviews for migration:', err);
  }

  const totalUpdatedDocs = Object.values(details).reduce((sum, col) => sum + col.updated, 0);

  return {
    dryRun,
    customDomain,
    r2DevDomain,
    totalImagesFound: stats.totalImagesFound,
    migratedCount: stats.migratedCount,
    alreadyMigratedCount: stats.alreadyMigratedCount,
    skippedCount: stats.skippedCount,
    failedCount: stats.failedCount,
    totalUpdatedDocs,
    details
  };
}
