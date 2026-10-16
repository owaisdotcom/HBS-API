import dotenv from 'dotenv';
dotenv.config();
import connectDB from './src/config/database.js';
import Product from './src/models/Product.js';
import mongoose from 'mongoose';

await connectDB();

const prods = await Product.find({
  status: 'active',
  isDeleted: { $ne: true },
  $or: [
    { images: { $size: 0 } },
    { images: { $exists: false } }
  ]
}).select('name slug images variants');

console.log('Count of products without top-level images:', prods.length);
let countWithVariantImages = 0;
for (const p of prods) {
  const varImages = (p.variants || []).flatMap(v => v.images || []);
  if (varImages.length > 0) {
    countWithVariantImages++;
    console.log('Product with variant images:', p.name, 'variants count:', p.variants.length, 'first variant image:', varImages[0]?.url);
  }
}
console.log('Total with variant images:', countWithVariantImages);

await mongoose.disconnect();
