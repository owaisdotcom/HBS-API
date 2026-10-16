import dotenv from 'dotenv';
dotenv.config();
import connectDB from './src/config/database.js';
import HomepageSection from './src/models/HomepageSection.js';
import Product from './src/models/Product.js';
import mongoose from 'mongoose';

await connectDB();

const hp = await HomepageSection.findOne({ isActive: true });
console.log('HomepageSection found:', hp ? 'YES' : 'NO');
if (hp) {
  console.log('Sections count:', hp.sections?.length);
  for (const s of (hp.sections || [])) {
    console.log('Section:', {
      id: s._id,
      title: s.title,
      type: s.type,
      productSelection: s.productSelection,
      categoryId: s.categoryId,
      categoryIds: s.categoryIds,
      productIdsCount: s.productIds?.length,
      productIds: s.productIds
    });
  }
}

const sampleProducts = await Product.find({ status: 'active', isDeleted: { $ne: true } }).limit(10);
console.log('Sample active products count:', sampleProducts.length);
for (const p of sampleProducts) {
  console.log('Product:', {
    id: p._id,
    name: p.name,
    slug: p.slug,
    imagesCount: p.images?.length,
    firstImage: p.images?.[0],
    variantsCount: p.variants?.length,
    firstVariantImages: p.variants?.[0]?.images
  });
}

// Let's check products where images is empty or variants has images
const productsWithoutImages = await Product.countDocuments({
  status: 'active',
  isDeleted: { $ne: true },
  $or: [
    { images: { $size: 0 } },
    { images: { $exists: false } }
  ]
});
console.log('Products without top-level images:', productsWithoutImages);

const productsWithVariantImages = await Product.countDocuments({
  status: 'active',
  isDeleted: { $ne: true },
  'variants.images.0': { $exists: true }
});
console.log('Products with variant images:', productsWithVariantImages);

await mongoose.disconnect();
