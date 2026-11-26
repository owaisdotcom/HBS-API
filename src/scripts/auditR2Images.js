import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Product from '../models/Product.js';
import r2Service from '../services/r2.service.js';
import { extractImageKey, getR2PublicUrl } from '../utils/imageUrl.js';

dotenv.config();

/**
 * Read-only audit script to scan all Products in MongoDB and verify every referenced
 * image exists in Cloudflare R2 (using HeadObjectCommand / HTTP HEAD).
 *
 * Usage: node src/scripts/auditR2Images.js
 */
async function auditR2ProductImages() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGODB_URI_LOCAL;
  if (!mongoUri) {
    console.error('Missing MONGODB_URI in .env');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB. Scanning products...');

  const products = await Product.find({}).select('name slug isDeleted images variants').lean();
  const baseUrl = getR2PublicUrl();
  const checkedKeys = new Map();
  const missing = [];
  const inconsistent = [];

  const checkKey = async (key) => {
    if (!key) return false;
    if (checkedKeys.has(key)) return checkedKeys.get(key);
    let exists = false;
    try {
      exists = await r2Service.checkObjectExists(key);
    } catch {
      try {
        const res = await fetch(`${baseUrl}/${key}`, { method: 'HEAD' });
        exists = res.ok;
      } catch {
        exists = false;
      }
    }
    checkedKeys.set(key, exists);
    return exists;
  };

  for (const prod of products) {
    const refs = [];
    (prod.images || []).forEach((img, idx) => {
      refs.push({ location: `images[${idx}]`, obj: img });
    });
    (prod.variants || []).forEach((v, vIdx) => {
      (v.images || []).forEach((img, iIdx) => {
        refs.push({ location: `variants[${vIdx}].images[${iIdx}]`, obj: img });
      });
      (v.sizes || []).forEach((s, sIdx) => {
        if (s?.sizeChartUrl || s?.sizeChartR2Url || s?.sizeChartObjectKey) {
          refs.push({
            location: `variants[${vIdx}].sizes[${sIdx}].sizeChart`,
            obj: { url: s.sizeChartUrl, r2Url: s.sizeChartR2Url, objectKey: s.sizeChartObjectKey }
          });
        }
      });
    });

    for (const ref of refs) {
      const key = extractImageKey(ref.obj);
      if (!key) continue;

      if (typeof ref.obj === 'object' && ref.obj.url && ref.obj.r2Url) {
        const k1 = extractImageKey(ref.obj.url);
        const k2 = extractImageKey(ref.obj.r2Url);
        if (k1 !== k2) {
          inconsistent.push({
            productId: prod._id,
            name: prod.name,
            location: ref.location,
            url: ref.obj.url,
            r2Url: ref.obj.r2Url
          });
        }
      }

      const exists = await checkKey(key);
      if (!exists) {
        missing.push({
          productId: prod._id,
          name: prod.name,
          slug: prod.slug,
          isDeleted: !!prod.isDeleted,
          location: ref.location,
          key,
          url: `${baseUrl}/${key}`
        });
      }
    }
  }

  console.log(`\nScanned ${products.length} products (${checkedKeys.size} unique R2 keys).`);
  console.log(`Missing (404) references: ${missing.length}`);
  if (missing.length > 0) {
    console.table(missing.slice(0, 50));
  }
  console.log(`Inconsistent url/r2Url pairs: ${inconsistent.length}`);
  if (inconsistent.length > 0) {
    console.table(inconsistent.slice(0, 50));
  }

  await mongoose.disconnect();
}

auditR2ProductImages().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
