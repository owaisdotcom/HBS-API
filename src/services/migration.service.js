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
import { executeLegacyR2Migration } from './legacyMigration.service.js';
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

  if (urlField === 'thumbnail') {
    doc.thumbnailImageUrl = newR2Url;
    doc.thumbnailObjectKey = key;
  } else if (urlField === 'coverImage') {
    doc.coverImageUrl = newR2Url;
    doc.coverImageObjectKey = key;
  } else if (urlField === 'customerImage') {
    doc.customerImageUrl = newR2Url;
    doc.customerImageObjectKey = key;
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
    imgObj.imageUrl = newR2Url;
    imgObj.key = key;
    imgObj.objectKey = key;
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
export async function runDualR2UrlMigration({ dryRun = false, forceAll = false } = {}) {
  const result = await executeLegacyR2Migration({ dryRun, verifyR2: !forceAll, forceAll });

  // Map result to structure expected by R2Migration.jsx
  const details = {};
  for (const [col, s] of Object.entries(result.collections || {})) {
    details[col] = {
      scanned: s.scannedDocs,
      totalImages: s.legacyUrlsFound,
      migrated: s.urlsMigrated,
      alreadyMigrated: 0,
      skipped: s.urlsSkipped,
      failed: 0,
      updated: s.modifiedDocs
    };
  }

  return {
    dryRun: result.dryRun,
    customDomain: result.r2BaseUrl,
    r2DevDomain: result.r2BaseUrl,
    totalImagesFound: result.totalLegacyUrlsFound,
    migratedCount: result.totalUrlsMigrated,
    totalReplacedUrls: result.totalUrlsMigrated,
    alreadyMigratedCount: 0,
    skippedCount: result.totalUrlsSkipped,
    failedCount: 0,
    totalUpdatedDocs: result.totalDocumentsModified,
    details,
    backupFile: result.backupFile,
    backupId: result.backupId,
    skippedItems: result.skippedItems,
    migratedItems: result.migratedItems
  };
}
