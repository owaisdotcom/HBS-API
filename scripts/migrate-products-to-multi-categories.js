#!/usr/bin/env node
/**
 * Migration script: migrate existing products to support `categories` array.
 * - For products with `categoryId` but no `categories`, sets `categories = [categoryId]`.
 * - Recomputes `categoryPath` as the unique union of selected categories' paths + their _id.
 *
 * Usage: node migrate-products-to-multi-categories.js
 * Make sure MONGO_URI env var is set, e.g.:
 * MONGO_URI="mongodb://localhost:27017/hbs" node migrate-products-to-multi-categories.js
 */
import mongoose from 'mongoose';
import Product from '../src/models/Product.js';
import Category from '../src/models/Category.js';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/hbs';

async function migrate() {
  console.log('Connecting to', MONGO_URI);
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    const cursor = Product.find({ isDeleted: { $ne: true } }).cursor();
    let count = 0;
    for await (const prod of cursor) {
      let changed = false;

      // Backfill categories from legacy categoryId
      if ((!prod.categories || prod.categories.length === 0) && prod.categoryId) {
        prod.categories = [prod.categoryId];
        changed = true;
      }

      // If there are categories, recompute categoryPath from categories' path fields
      if (prod.categories && prod.categories.length > 0) {
        const cats = await Category.find({ _id: { $in: prod.categories }, isDeleted: { $ne: true } });
        const pathSet = new Set();
        cats.forEach(c => {
          (c.path || []).forEach(p => pathSet.add(p.toString()));
          pathSet.add(c._id.toString());
        });
        const newPath = Array.from(pathSet).map(id => mongoose.Types.ObjectId(id));
        // simple comparison
        const oldPathStr = (prod.categoryPath || []).map(p => p.toString()).sort().join(',');
        const newPathStr = newPath.map(p => p.toString()).sort().join(',');
        if (oldPathStr !== newPathStr) {
          prod.categoryPath = newPath;
          changed = true;
        }
      }

      if (changed) {
        await prod.save();
        count++;
        console.log(`Updated product ${prod._id}`);
      }
    }

    console.log(`Migration complete. Updated ${count} products.`);
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

if (require.main === module) {
  migrate();
}

