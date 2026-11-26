import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import PreMadeBundle from '../models/PreMadeBundle.js';
import Category from '../models/Category.js';
import BundleCategory from '../models/BundleCategory.js';
import HeroSlider from '../models/HeroSlider.js';
import Hero from '../models/Hero.js';
import SiteSetting from '../models/SiteSetting.js';
import Cart from '../models/Cart.js';
import Review from '../models/Review.js';
import Testimonial from '../models/Testimonial.js';
import { extractImageKey } from '../utils/imageUrl.js';

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks whether an R2 object key (or URL) is referenced by any document across all
 * media-bearing MongoDB collections (including soft-deleted products and historical orders).
 *
 * Fail-safe: If MongoDB is not connected, returns { referenced: true, collections: ['db_disconnected'] }
 * so deletion is blocked rather than risking accidental data loss.
 *
 * @param {string|object} keyOrUrl
 * @param {object} [options]
 * @param {string} [options.excludeProductId] - Optional product ID to exclude (only if intended)
 * @returns {Promise<{ referenced: boolean, key: string|null, collections: string[] }>}
 */
export async function isObjectReferencedInDatabase(keyOrUrl, options = {}) {
  const key = extractImageKey(keyOrUrl);
  if (!key) {
    return { referenced: false, key: null, collections: [] };
  }

  // Fail-safe: never allow deletion when database connection is unavailable
  if (mongoose.connection.readyState !== 1) {
    return { referenced: true, key, collections: ['db_disconnected'] };
  }

  const normalizedKey = key.replace(/^\/+/, '');
  // Match the exact key or any URL ending with /<key> (with optional ?query or #hash)
  const keyUrlRegex = new RegExp(`(^|/)${escapeRegExp(normalizedKey)}(\\?.*|#.*)?$`, 'i');
  const referencedIn = [];

  // 1. Products (including soft-deleted products so restoration never breaks)
  const productQuery = {
    $or: [
      { 'images.key': normalizedKey },
      { 'images.objectKey': normalizedKey },
      { 'images.url': keyUrlRegex },
      { 'images.imageUrl': keyUrlRegex },
      { 'images.r2Url': keyUrlRegex },
      { 'variants.images.key': normalizedKey },
      { 'variants.images.objectKey': normalizedKey },
      { 'variants.images.url': keyUrlRegex },
      { 'variants.images.imageUrl': keyUrlRegex },
      { 'variants.images.r2Url': keyUrlRegex },
      { 'variants.sizes.sizeChartObjectKey': normalizedKey },
      { 'variants.sizes.sizeChartUrl': keyUrlRegex },
      { 'variants.sizes.sizeChartImageUrl': keyUrlRegex },
      { 'variants.sizes.sizeChartR2Url': keyUrlRegex }
    ]
  };
  if (options.excludeProductId && mongoose.Types.ObjectId.isValid(options.excludeProductId)) {
    productQuery._id = { $ne: new mongoose.Types.ObjectId(options.excludeProductId) };
  }

  const checks = [
    { name: 'Product', fn: () => Product.exists(productQuery) },
    {
      name: 'Order',
      fn: () => Order.exists({
        $or: [
          { 'items.productImage': keyUrlRegex },
          { 'items.productImageR2Url': keyUrlRegex },
          { 'items.variantImage': keyUrlRegex },
          { 'items.variantImageR2Url': keyUrlRegex },
          { 'items.orderedVariantImage': keyUrlRegex },
          { 'items.orderedVariantImageR2Url': keyUrlRegex },
          { 'items.variantImages': keyUrlRegex },
          { 'items.variantR2Images': keyUrlRegex },
          { 'items.orderedVariantImages': keyUrlRegex },
          { 'items.orderedVariantR2Images': keyUrlRegex },
          { 'items.variantSnapshot.image': keyUrlRegex },
          { 'items.variantSnapshot.images': keyUrlRegex },
          { 'paymentReceipt.key': normalizedKey },
          { 'paymentReceipt.objectKey': normalizedKey },
          { 'paymentReceipt.url': keyUrlRegex }
        ]
      })
    },
    {
      name: 'PreMadeBundle',
      fn: () => PreMadeBundle.exists({
        $or: [
          { 'images.key': normalizedKey },
          { 'images.objectKey': normalizedKey },
          { 'images.url': keyUrlRegex },
          { 'images.r2Url': keyUrlRegex }
        ]
      })
    },
    {
      name: 'Category',
      fn: () => Category.exists({
        $or: [
          { thumbnailObjectKey: normalizedKey },
          { coverImageObjectKey: normalizedKey },
          { thumbnail: keyUrlRegex },
          { thumbnailImageUrl: keyUrlRegex },
          { coverImage: keyUrlRegex },
          { coverImageUrl: keyUrlRegex }
        ]
      })
    },
    {
      name: 'BundleCategory',
      fn: () => BundleCategory.exists({
        $or: [
          { thumbnailObjectKey: normalizedKey },
          { coverImageObjectKey: normalizedKey },
          { thumbnail: keyUrlRegex },
          { thumbnailImageUrl: keyUrlRegex },
          { coverImage: keyUrlRegex },
          { coverImageUrl: keyUrlRegex }
        ]
      })
    },
    {
      name: 'HeroSlider',
      fn: () => HeroSlider.exists({
        $or: [
          { 'slides.imageUrl': keyUrlRegex },
          { 'slides.image.desktop': keyUrlRegex },
          { 'slides.image.tablet': keyUrlRegex },
          { 'slides.image.mobile': keyUrlRegex }
        ]
      })
    },
    {
      name: 'Hero',
      fn: () => Hero.exists({
        $or: [
          { imageUrl: keyUrlRegex },
          { desktopImage: keyUrlRegex },
          { mobileImage: keyUrlRegex }
        ]
      })
    },
    {
      name: 'SiteSetting',
      fn: () => SiteSetting.exists({
        $or: [
          { logo: keyUrlRegex },
          { favicon: keyUrlRegex },
          { 'seo.ogImage': keyUrlRegex },
          { 'contentBlocks.hijabNiqab.image': keyUrlRegex },
          { 'contentBlocks.elegance.image': keyUrlRegex },
          { 'marketingBanner.image': keyUrlRegex },
          { 'footer.paymentMethodImages': keyUrlRegex }
        ]
      })
    },
    {
      name: 'Cart',
      fn: () => Cart.exists({
        $or: [
          { 'items.selectedImage': keyUrlRegex },
          { 'items.variantSnapshot.image': keyUrlRegex }
        ]
      })
    },
    {
      name: 'Review',
      fn: () => Review.exists({ images: keyUrlRegex })
    },
    {
      name: 'Testimonial',
      fn: () => Testimonial.exists({
        $or: [
          { customerImage: keyUrlRegex },
          { customerImageUrl: keyUrlRegex },
          { customerImageObjectKey: normalizedKey },
          { image: keyUrlRegex }
        ]
      })
    }
  ];

  const results = await Promise.all(
    checks.map(async ({ name, fn }) => {
      try {
        const found = await fn();
        return found ? name : null;
      } catch (err) {
        console.error(`[R2][REF_CHECK_ERROR] collection=${name} key=${normalizedKey}:`, err.message);
        // Fail-safe: treat query error as potentially referenced
        return `${name}_error`;
      }
    })
  );

  for (const r of results) {
    if (r) referencedIn.push(r);
  }

  return {
    referenced: referencedIn.length > 0,
    key: normalizedKey,
    collections: referencedIn
  };
}
