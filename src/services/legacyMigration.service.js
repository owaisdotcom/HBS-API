import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import {
  R2_PUBLIC_BASE_URL,
  LEGACY_CUSTOM_DOMAIN,
  extractImageKey
} from '../utils/imageUrl.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKUPS_DIR = path.join(__dirname, '../../backups');

const R2_DEV_URL = R2_PUBLIC_BASE_URL;

/**
 * Checks if a URL or string uses the legacy custom domain.
 */
export function isLegacyUrl(url) {
  if (typeof url !== 'string') return false;
  return /^https?:\/\/images\.hijabsbyshiza\.com/i.test(url.trim());
}

/**
 * Converts a legacy custom domain URL to the canonical R2 public dev URL.
 * Preserves the exact object key, extension, query strings, and hashes.
 */
export function migrateUrlString(url) {
  if (!isLegacyUrl(url)) return url;
  const trimmed = url.trim();
  const withoutOrigin = trimmed.replace(/^https?:\/\/images\.hijabsbyshiza\.com\/?/i, '');
  return `${R2_DEV_URL}/${withoutOrigin.replace(/^\/+/, '')}`;
}

/**
 * Verifies if an object exists in Cloudflare R2 by issuing an HTTP HEAD request.
 */
const verificationCache = new Map();

export async function verifyObjectExistsInR2(cleanKey) {
  if (!cleanKey) return false;
  const pureKey = cleanKey.split('?')[0].split('#')[0];
  if (verificationCache.has(pureKey)) {
    return verificationCache.get(pureKey);
  }

  const url = `${R2_DEV_URL}/${pureKey}`;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const exists = res.status === 200;
    verificationCache.set(pureKey, exists);
    return exists;
  } catch (err) {
    verificationCache.set(pureKey, false);
    return false;
  }
}

/**
 * Core migration function to inspect, verify, and update all legacy R2 URLs across MongoDB.
 *
 * @param {object} options
 * @param {boolean} [options.dryRun=true] - If true, previews changes without writing to database.
 * @param {boolean} [options.verifyR2=true] - If true, verifies existence of object in R2 before migrating.
 * @param {boolean} [options.forceAll=false] - If true, migrates all legacy URLs regardless of R2 check.
 * @returns {Promise<object>} Detailed report of scanned, verified, migrated, and skipped URLs.
 */
export async function executeLegacyR2Migration({ dryRun = true, verifyR2 = true, forceAll = false } = {}) {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('MongoDB database connection is not active.');
  }

  const collections = await db.listCollections().toArray();

  const report = {
    timestamp: new Date().toISOString(),
    dryRun,
    verifyR2: forceAll ? false : verifyR2,
    forceAll,
    r2BaseUrl: R2_DEV_URL,
    legacyDomain: LEGACY_CUSTOM_DOMAIN,
    totalDocumentsScanned: 0,
    totalDocumentsModified: 0,
    totalLegacyUrlsFound: 0,
    totalUrlsMigrated: 0,
    totalUrlsSkipped: 0,
    collections: {},
    skippedItems: [],
    migratedItems: [],
    backupId: null,
    backupFile: null
  };

  const docsToUpdateByCollection = {};

  // Step 1: Scan and determine changes across all collections
  for (const colInfo of collections) {
    const colName = colInfo.name;
    // Skip internal/system collections and backup collections
    if (colName.startsWith('system.') || colName.startsWith('_migration_')) continue;

    const collection = db.collection(colName);
    const docs = await collection.find({}).toArray();
    report.totalDocumentsScanned += docs.length;

    const colStats = {
      scannedDocs: docs.length,
      modifiedDocs: 0,
      legacyUrlsFound: 0,
      urlsMigrated: 0,
      urlsSkipped: 0,
      affectedFields: new Set()
    };

    const updatesForCol = [];

    for (const doc of docs) {
      let docModified = false;
      const originalDocCopy = JSON.parse(JSON.stringify(doc));
      const processedPaths = new Set();

      // Helper to process a potential URL field
      async function processField(currentVal, fieldPath) {
        if (!isLegacyUrl(currentVal)) return currentVal;
        if (processedPaths.has(fieldPath)) return currentVal;
        processedPaths.add(fieldPath);

        colStats.legacyUrlsFound++;
        report.totalLegacyUrlsFound++;
        colStats.affectedFields.add(fieldPath);

        const key = extractImageKey(currentVal);
        let shouldMigrate = true;
        let skipReason = null;

        if (!forceAll && verifyR2) {
          const exists = await verifyObjectExistsInR2(key);
          if (!exists) {
            shouldMigrate = false;
            skipReason = 'Object does not exist in Cloudflare R2 bucket (HTTP 404)';
          }
        }

        if (shouldMigrate) {
          const newUrl = migrateUrlString(currentVal);
          colStats.urlsMigrated++;
          report.totalUrlsMigrated++;
          report.migratedItems.push({
            collection: colName,
            docId: doc._id,
            fieldPath,
            oldUrl: currentVal,
            newUrl,
            objectKey: key
          });
          docModified = true;
          return newUrl;
        } else {
          colStats.urlsSkipped++;
          report.totalUrlsSkipped++;
          report.skippedItems.push({
            collection: colName,
            docId: doc._id,
            fieldPath,
            url: currentVal,
            objectKey: key,
            reason: skipReason
          });
          return currentVal;
        }
      }

      // 1. Specialized handling for Orders
      if (colName === 'orders') {
        if (doc.paymentReceipt && typeof doc.paymentReceipt === 'object') {
          if (doc.paymentReceipt.url) {
            doc.paymentReceipt.url = await processField(doc.paymentReceipt.url, 'paymentReceipt.url');
          }
          if (doc.paymentReceipt.r2Url) {
            doc.paymentReceipt.r2Url = await processField(doc.paymentReceipt.r2Url, 'paymentReceipt.r2Url');
          }
          if (doc.paymentReceipt.imageUrl) {
            doc.paymentReceipt.imageUrl = await processField(doc.paymentReceipt.imageUrl, 'paymentReceipt.imageUrl');
          }
          if (doc.paymentReceipt.url && doc.paymentReceipt.url.startsWith(R2_DEV_URL)) {
            doc.paymentReceipt.r2Url = doc.paymentReceipt.url;
            doc.paymentReceipt.imageUrl = doc.paymentReceipt.url;
            doc.paymentReceipt.objectKey = doc.paymentReceipt.objectKey || extractImageKey(doc.paymentReceipt.url);
          }
        }

        if (doc.paymentReceiptUrl) {
          doc.paymentReceiptUrl = await processField(doc.paymentReceiptUrl, 'paymentReceiptUrl');
        }

        if (Array.isArray(doc.items)) {
          for (let i = 0; i < doc.items.length; i++) {
            const item = doc.items[i];
            if (item.productImage) {
              item.productImage = await processField(item.productImage, `items[${i}].productImage`);
            }
            if (item.productImageR2Url) {
              item.productImageR2Url = await processField(item.productImageR2Url, `items[${i}].productImageR2Url`);
            }
            if (item.variantImage) {
              item.variantImage = await processField(item.variantImage, `items[${i}].variantImage`);
            }
            if (item.variantImageR2Url) {
              item.variantImageR2Url = await processField(item.variantImageR2Url, `items[${i}].variantImageR2Url`);
            }
            if (item.orderedVariantImage) {
              item.orderedVariantImage = await processField(item.orderedVariantImage, `items[${i}].orderedVariantImage`);
            }
            if (item.orderedVariantImageR2Url) {
              item.orderedVariantImageR2Url = await processField(item.orderedVariantImageR2Url, `items[${i}].orderedVariantImageR2Url`);
            }
            if (item.productImage && item.productImage.startsWith(R2_DEV_URL)) {
              item.productImageR2Url = item.productImage;
            }
            if (item.variantImage && item.variantImage.startsWith(R2_DEV_URL)) {
              item.variantImageR2Url = item.variantImage;
            }
            if (item.orderedVariantImage && item.orderedVariantImage.startsWith(R2_DEV_URL)) {
              item.orderedVariantImageR2Url = item.orderedVariantImage;
            }
            if (Array.isArray(item.variantImages)) {
              for (let vi = 0; vi < item.variantImages.length; vi++) {
                item.variantImages[vi] = await processField(item.variantImages[vi], `items[${i}].variantImages[${vi}]`);
              }
            }
            if (Array.isArray(item.orderedVariantImages)) {
              for (let vi = 0; vi < item.orderedVariantImages.length; vi++) {
                item.orderedVariantImages[vi] = await processField(item.orderedVariantImages[vi], `items[${i}].orderedVariantImages[${vi}]`);
              }
            }
            if (item.variantSnapshot && typeof item.variantSnapshot === 'object') {
              if (item.variantSnapshot.image) {
                item.variantSnapshot.image = await processField(item.variantSnapshot.image, `items[${i}].variantSnapshot.image`);
              }
              if (Array.isArray(item.variantSnapshot.images)) {
                for (let si = 0; si < item.variantSnapshot.images.length; si++) {
                  item.variantSnapshot.images[si] = await processField(item.variantSnapshot.images[si], `items[${i}].variantSnapshot.images[${si}]`);
                }
              }
            }
          }
        }
      }

      // 2. Specialized handling for Products
      else if (colName === 'products') {
        if (doc.thumbnail) doc.thumbnail = await processField(doc.thumbnail, 'thumbnail');
        if (doc.thumbnailImageUrl) doc.thumbnailImageUrl = await processField(doc.thumbnailImageUrl, 'thumbnailImageUrl');
        if (doc.thumbnailR2Url) doc.thumbnailR2Url = await processField(doc.thumbnailR2Url, 'thumbnailR2Url');
        if (doc.image) doc.image = await processField(doc.image, 'image');
        if (doc.imageImageUrl) doc.imageImageUrl = await processField(doc.imageImageUrl, 'imageImageUrl');
        if (doc.imageR2Url) doc.imageR2Url = await processField(doc.imageR2Url, 'imageR2Url');

        if (Array.isArray(doc.images)) {
          for (let i = 0; i < doc.images.length; i++) {
            const img = doc.images[i];
            if (typeof img === 'string') {
              doc.images[i] = await processField(img, `images[${i}]`);
            } else if (img && typeof img === 'object') {
              if (img.url) img.url = await processField(img.url, `images[${i}].url`);
              if (img.imageUrl) img.imageUrl = await processField(img.imageUrl, `images[${i}].imageUrl`);
              if (img.r2Url) img.r2Url = await processField(img.r2Url, `images[${i}].r2Url`);
              if (img.url && img.url.startsWith(R2_DEV_URL)) {
                img.imageUrl = img.url;
                img.r2Url = img.url;
                img.objectKey = img.objectKey || extractImageKey(img.url);
              }
            }
          }
        }

        if (Array.isArray(doc.variants)) {
          for (let vi = 0; vi < doc.variants.length; vi++) {
            const variant = doc.variants[vi];
            if (Array.isArray(variant.images)) {
              for (let ii = 0; ii < variant.images.length; ii++) {
                const vImg = variant.images[ii];
                if (typeof vImg === 'string') {
                  variant.images[ii] = await processField(vImg, `variants[${vi}].images[${ii}]`);
                } else if (vImg && typeof vImg === 'object') {
                  if (vImg.url) vImg.url = await processField(vImg.url, `variants[${vi}].images[${ii}].url`);
                  if (vImg.imageUrl) vImg.imageUrl = await processField(vImg.imageUrl, `variants[${vi}].images[${ii}].imageUrl`);
                  if (vImg.r2Url) vImg.r2Url = await processField(vImg.r2Url, `variants[${vi}].images[${ii}].r2Url`);
                  if (vImg.url && vImg.url.startsWith(R2_DEV_URL)) {
                    vImg.imageUrl = vImg.url;
                    vImg.r2Url = vImg.url;
                    vImg.objectKey = vImg.objectKey || extractImageKey(vImg.url);
                  }
                }
              }
            }
            if (Array.isArray(variant.sizes)) {
              for (let si = 0; si < variant.sizes.length; si++) {
                const size = variant.sizes[si];
                if (size.sizeChartUrl) size.sizeChartUrl = await processField(size.sizeChartUrl, `variants[${vi}].sizes[${si}].sizeChartUrl`);
                if (size.sizeChartImageUrl) size.sizeChartImageUrl = await processField(size.sizeChartImageUrl, `variants[${vi}].sizes[${si}].sizeChartImageUrl`);
                if (size.sizeChartR2Url) size.sizeChartR2Url = await processField(size.sizeChartR2Url, `variants[${vi}].sizes[${si}].sizeChartR2Url`);
                if (size.sizeChartUrl && size.sizeChartUrl.startsWith(R2_DEV_URL)) {
                  size.sizeChartImageUrl = size.sizeChartUrl;
                  size.sizeChartR2Url = size.sizeChartUrl;
                  size.sizeChartObjectKey = size.sizeChartObjectKey || extractImageKey(size.sizeChartUrl);
                }
              }
            }
          }
        }
      }

      // 3. Categories & BundleCategories
      else if (colName === 'categories' || colName === 'bundlecategories') {
        if (doc.thumbnail) doc.thumbnail = await processField(doc.thumbnail, 'thumbnail');
        if (doc.thumbnailImageUrl) doc.thumbnailImageUrl = await processField(doc.thumbnailImageUrl, 'thumbnailImageUrl');
        if (doc.thumbnailR2Url) doc.thumbnailR2Url = await processField(doc.thumbnailR2Url, 'thumbnailR2Url');
        if (doc.coverImage) doc.coverImage = await processField(doc.coverImage, 'coverImage');
        if (doc.coverImageUrl) doc.coverImageUrl = await processField(doc.coverImageUrl, 'coverImageUrl');
        if (doc.coverImageR2Url) doc.coverImageR2Url = await processField(doc.coverImageR2Url, 'coverImageR2Url');
      }

      // 4. PreMadeBundles
      else if (colName === 'premadebundles') {
        if (Array.isArray(doc.images)) {
          for (let i = 0; i < doc.images.length; i++) {
            const img = doc.images[i];
            if (typeof img === 'string') {
              doc.images[i] = await processField(img, `images[${i}]`);
            } else if (img && typeof img === 'object') {
              if (img.url) img.url = await processField(img.url, `images[${i}].url`);
              if (img.imageUrl) img.imageUrl = await processField(img.imageUrl, `images[${i}].imageUrl`);
              if (img.r2Url) img.r2Url = await processField(img.r2Url, `images[${i}].r2Url`);
              if (img.url && img.url.startsWith(R2_DEV_URL)) {
                img.imageUrl = img.url;
                img.r2Url = img.url;
                img.objectKey = img.objectKey || extractImageKey(img.url);
              }
            }
          }
        }
      }

      // 5. Testimonials
      else if (colName === 'testimonials') {
        if (doc.customerImage) doc.customerImage = await processField(doc.customerImage, 'customerImage');
        if (doc.customerImageUrl) doc.customerImageUrl = await processField(doc.customerImageUrl, 'customerImageUrl');
        if (doc.customerImageR2Url) doc.customerImageR2Url = await processField(doc.customerImageR2Url, 'customerImageR2Url');
        if (doc.imageUrl) doc.imageUrl = await processField(doc.imageUrl, 'imageUrl');
        if (doc.r2Url) doc.r2Url = await processField(doc.r2Url, 'r2Url');
      }

      // 6. Reviews
      else if (colName === 'reviews') {
        if (Array.isArray(doc.images)) {
          for (let i = 0; i < doc.images.length; i++) {
            doc.images[i] = await processField(doc.images[i], `images[${i}]`);
          }
        }
        if (Array.isArray(doc.r2Images)) {
          for (let i = 0; i < doc.r2Images.length; i++) {
            doc.r2Images[i] = await processField(doc.r2Images[i], `r2Images[${i}]`);
          }
        }
        if (Array.isArray(doc.imageUrls)) {
          for (let i = 0; i < doc.imageUrls.length; i++) {
            doc.imageUrls[i] = await processField(doc.imageUrls[i], `imageUrls[${i}]`);
          }
        }
      }

      // 7. HeroSliders
      else if (colName === 'herosliders') {
        if (Array.isArray(doc.slides)) {
          for (let i = 0; i < doc.slides.length; i++) {
            if (doc.slides[i]?.imageUrl) {
              doc.slides[i].imageUrl = await processField(doc.slides[i].imageUrl, `slides[${i}].imageUrl`);
            }
          }
        }
      }

      // 8. Heroes
      else if (colName === 'heroes') {
        if (doc.imageUrl) doc.imageUrl = await processField(doc.imageUrl, 'imageUrl');
      }

      // 9. SiteSettings
      else if (colName === 'sitesettings') {
        if (doc.logo) doc.logo = await processField(doc.logo, 'logo');
        if (doc.favicon) doc.favicon = await processField(doc.favicon, 'favicon');
        if (doc.seo?.ogImage) doc.seo.ogImage = await processField(doc.seo.ogImage, 'seo.ogImage');
        if (doc.contentBlocks?.hijabNiqab?.image) {
          doc.contentBlocks.hijabNiqab.image = await processField(doc.contentBlocks.hijabNiqab.image, 'contentBlocks.hijabNiqab.image');
        }
        if (doc.contentBlocks?.elegance?.image) {
          doc.contentBlocks.elegance.image = await processField(doc.contentBlocks.elegance.image, 'contentBlocks.elegance.image');
        }
        if (doc.marketingBanner?.image) {
          doc.marketingBanner.image = await processField(doc.marketingBanner.image, 'marketingBanner.image');
        }
      }

      // 10. Carts
      else if (colName === 'carts') {
        if (Array.isArray(doc.items)) {
          for (let i = 0; i < doc.items.length; i++) {
            const item = doc.items[i];
            if (item.productImage) item.productImage = await processField(item.productImage, `items[${i}].productImage`);
            if (item.variantImage) item.variantImage = await processField(item.variantImage, `items[${i}].variantImage`);
            if (item.variantSnapshot?.image) {
              item.variantSnapshot.image = await processField(item.variantSnapshot.image, `items[${i}].variantSnapshot.image`);
            }
          }
        }
      }

      // Universal Deep Object Scanner: catch any unhandled fields in any collection
      async function deepScanAndReplace(obj, pathPrefix = '') {
        if (!obj || typeof obj !== 'object') return;
        for (const k of Object.keys(obj)) {
          const currentPath = pathPrefix ? `${pathPrefix}.${k}` : k;
          const val = obj[k];
          if (typeof val === 'string' && isLegacyUrl(val)) {
            obj[k] = await processField(val, currentPath);
          } else if (Array.isArray(val)) {
            for (let idx = 0; idx < val.length; idx++) {
              if (typeof val[idx] === 'string' && isLegacyUrl(val[idx])) {
                val[idx] = await processField(val[idx], `${currentPath}[${idx}]`);
              } else if (typeof val[idx] === 'object') {
                await deepScanAndReplace(val[idx], `${currentPath}[${idx}]`);
              }
            }
          } else if (typeof val === 'object' && val !== null && !(val instanceof Date) && !val._bsontype) {
            await deepScanAndReplace(val, currentPath);
          }
        }
      }

      await deepScanAndReplace(doc, '');

      if (docModified) {
        colStats.modifiedDocs++;
        report.totalDocumentsModified++;
        updatesForCol.push({
          docId: doc._id,
          originalDoc: originalDocCopy,
          updatedDoc: doc
        });
      }
    }

    if (updatesForCol.length > 0) {
      docsToUpdateByCollection[colName] = updatesForCol;
    }

    report.collections[colName] = {
      scannedDocs: colStats.scannedDocs,
      modifiedDocs: colStats.modifiedDocs,
      legacyUrlsFound: colStats.legacyUrlsFound,
      urlsMigrated: colStats.urlsMigrated,
      urlsSkipped: colStats.urlsSkipped,
      affectedFields: Array.from(colStats.affectedFields)
    };
  }

  // Step 2: In Live Mode, create backup and execute updates
  if (!dryRun && report.totalDocumentsModified > 0) {
    const backupId = `backup_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    report.backupId = backupId;

    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }

    const backupFilePath = path.join(BACKUPS_DIR, `legacy-url-migration-${backupId}.json`);
    const backupPayload = {
      backupId,
      timestamp: report.timestamp,
      totalDocumentsModified: report.totalDocumentsModified,
      totalUrlsMigrated: report.totalUrlsMigrated,
      collections: {}
    };

    for (const [colName, updateList] of Object.entries(docsToUpdateByCollection)) {
      backupPayload.collections[colName] = updateList.map(u => ({
        docId: u.docId,
        originalDoc: u.originalDoc
      }));
    }

    fs.writeFileSync(backupFilePath, JSON.stringify(backupPayload, null, 2), 'utf8');
    report.backupFile = backupFilePath;

    // Also persist backup record in MongoDB
    try {
      const backupCollection = db.collection('_migration_backups');
      await backupCollection.insertOne({
        backupId,
        createdAt: new Date(),
        type: 'legacy_r2_url_migration',
        summary: {
          totalDocumentsModified: report.totalDocumentsModified,
          totalUrlsMigrated: report.totalUrlsMigrated
        },
        data: backupPayload
      });
    } catch (bErr) {
      console.warn('Could not persist backup in MongoDB collection (disk backup succeeded):', bErr.message);
    }

    // Now execute atomic replacements per document
    for (const [colName, updateList] of Object.entries(docsToUpdateByCollection)) {
      const collection = db.collection(colName);
      for (const item of updateList) {
        const replacement = { ...item.updatedDoc };
        delete replacement._id;
        await collection.replaceOne({ _id: item.docId }, replacement);
      }
    }
  }

  return report;
}

/**
 * Rollback migration using a saved backup ID or file path.
 */
export async function rollbackLegacyR2Migration(backupIdOrPath) {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('MongoDB database connection is not active.');
  }

  let backupData = null;

  // 1. Try file path
  if (fs.existsSync(backupIdOrPath)) {
    backupData = JSON.parse(fs.readFileSync(backupIdOrPath, 'utf8'));
  } else {
    // 2. Try looking in BACKUPS_DIR
    const targetFile = path.join(BACKUPS_DIR, `legacy-url-migration-${backupIdOrPath}.json`);
    if (fs.existsSync(targetFile)) {
      backupData = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
    } else {
      // 3. Try MongoDB
      const backupCol = db.collection('_migration_backups');
      const bDoc = await backupCol.findOne({ backupId: backupIdOrPath });
      if (bDoc && bDoc.data) {
        backupData = bDoc.data;
      }
    }
  }

  if (!backupData || !backupData.collections) {
    throw new Error(`Migration backup not found for identifier: ${backupIdOrPath}`);
  }

  const rollbackReport = {
    timestamp: new Date().toISOString(),
    backupId: backupData.backupId,
    restoredCollections: {},
    totalRestoredDocs: 0
  };

  for (const [colName, items] of Object.entries(backupData.collections)) {
    const collection = db.collection(colName);
    let count = 0;
    for (const item of items) {
      const original = { ...item.originalDoc };
      delete original._id;
      const queryId = mongoose.Types.ObjectId.isValid(item.docId)
        ? new mongoose.Types.ObjectId(item.docId)
        : item.docId;
      await collection.replaceOne({ _id: queryId }, original);
      count++;
    }
    rollbackReport.restoredCollections[colName] = count;
    rollbackReport.totalRestoredDocs += count;
  }

  return rollbackReport;
}