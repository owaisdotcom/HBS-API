import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from '../config/database.js';
import Category from '../models/Category.js';
import Product from '../models/Product.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();

function convertOids(obj) {
  if (obj === null || obj === undefined) return obj;
  if (obj.$oid) return new mongoose.Types.ObjectId(obj.$oid);
  if (Array.isArray(obj)) return obj.map((item) => convertOids(item));
  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = convertOids(v);
    return out;
  }
  return obj;
}

const seedData = async () => {
  try {
    await connectDB();

    const seedPath = path.join(__dirname, '../../seed-data.json');
    const raw = fs.readFileSync(seedPath, 'utf8');
    const data = JSON.parse(raw);

    const categories = (data.categories || []).map(convertOids);
    const products = (data.products || []).map(convertOids);

    if (categories.length === 0) {
      console.log('No categories in seed file.');
      process.exit(0);
      return;
    }

    const existingCat = await Category.countDocuments({ isDeleted: { $ne: true } });
    if (existingCat > 0) {
      console.log('Categories already exist. Skipping category seed. Delete categories first to re-seed.');
    } else {
      await Category.insertMany(categories);
      console.log(`✓ Inserted ${categories.length} categories.`);
    }

    const existingProd = await Product.countDocuments({ isDeleted: { $ne: true } });
    if (existingProd > 0) {
      console.log('Products already exist. Skipping product seed. Delete products first to re-seed.');
    } else {
      await Product.insertMany(products);
      console.log(`✓ Inserted ${products.length} products.`);
    }

    console.log('✓ Seed completed.');
    process.exit(0);
  } catch (error) {
    console.error('✗ Seed error:', error.message);
    process.exit(1);
  }
};

seedData();
