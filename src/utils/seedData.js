import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from '../config/database.js';
import Category from '../models/Category.js';
import Product from '../models/Product.js';
import PreMadeBundle from '../models/PreMadeBundle.js';

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
    const preMadeBundles = (data.preMadeBundles || []).map(convertOids);

    if (categories.length === 0) {

      process.exit(0);
      return;
    }

    const existingCat = await Category.countDocuments({ isDeleted: { $ne: true } });
    if (existingCat > 0) {

    } else {
      await Category.insertMany(categories);

    }

    const existingProd = await Product.countDocuments({ isDeleted: { $ne: true } });
    if (existingProd > 0) {

    } else {
      await Product.insertMany(products);

    }

    const existingBundles = await PreMadeBundle.countDocuments({ isDeleted: { $ne: true } });
    if (existingBundles > 0) {

    } else if (preMadeBundles.length > 0) {
      await PreMadeBundle.insertMany(preMadeBundles);

    }


    process.exit(0);
  } catch (error) {
    console.error('✗ Seed error:', error.message);
    process.exit(1);
  }
};

seedData();
