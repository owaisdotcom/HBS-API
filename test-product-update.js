import dotenv from 'dotenv';
dotenv.config({ path: 'c:/hbs/API/.env' });

import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import app from './src/app.js';
import connectDB from './src/config/database.js';
import Admin from './src/models/Admin.js';
import Product from './src/models/Product.js';
import Category from './src/models/Category.js';
import { extractImageKey, resolveImageUrl } from './src/utils/imageUrl.js';

let server;
let baseUrl;
let adminToken;
let testAdmin;
let testProduct;
let testCategory;

const apiPut = async (path, body, token = adminToken) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'PUT',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
};

const runTests = async () => {
  console.log('--- STARTING COMPREHENSIVE PRODUCT UPDATE API TESTS ---');

  await connectDB();
  console.log('✓ Database connected');

  testAdmin = await Admin.findOne({ role: 'super_admin' });
  if (!testAdmin) {
    // Fallback to any admin
    testAdmin = await Admin.findOne();
  }
  if (!testAdmin) {
    throw new Error('No admin found in DB');
  }

  adminToken = jwt.sign({ id: testAdmin._id }, process.env.ADMIN_JWT_SECRET, { expiresIn: '1d' });
  console.log('✓ Generated admin auth token');

  // Start ephemeral test server
  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`✓ Test server running on port ${port}\n`);

  let passed = 0;
  let failed = 0;

  const assert = (condition, description) => {
    if (condition) {
      console.log(`  ✓ PASS: ${description}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${description}`);
      failed++;
    }
  };

  try {
    // Find or create test category
    testCategory = await Category.findOne();
    if (!testCategory) {
      testCategory = await Category.create({
        name: 'Test Update Category',
        slug: `test-update-cat-${Date.now()}`,
        status: 'active'
      });
    }

    // Create an ephemeral test product with initial images and variants
    const initialSlug = `test-product-update-${Date.now()}`;
    testProduct = await Product.create({
      name: 'Initial Test Product',
      slug: initialSlug,
      description: 'Product for update API validation',
      categories: [testCategory._id],
      categoryPath: [testCategory._id],
      price: 1200,
      originalPrice: 1500,
      stock: 25,
      status: 'active',
      images: [
        {
          provider: 'r2',
          key: 'hbs-products/initial-1.jpg',
          objectKey: 'hbs-products/initial-1.jpg',
          url: 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/initial-1.jpg',
          r2Url: 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/initial-1.jpg',
          isPrimary: true,
          order: 0
        },
        {
          provider: 'r2',
          key: 'hbs-products/initial-2.jpg',
          objectKey: 'hbs-products/initial-2.jpg',
          url: 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/initial-2.jpg',
          r2Url: 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/initial-2.jpg',
          isPrimary: false,
          order: 1
        }
      ],
      variants: [
        {
          colorId: 'c1',
          color: 'Rose Gold',
          images: [
            {
              provider: 'r2',
              key: 'hbs-products/variant-rose.jpg',
              objectKey: 'hbs-products/variant-rose.jpg',
              url: 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/variant-rose.jpg',
              r2Url: 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/variant-rose.jpg',
              isPrimary: true,
              order: 0
            }
          ],
          sizes: [
            {
              sizeId: 's1',
              size: 'Standard',
              price: 1200,
              stock: 25
            }
          ]
        }
      ]
    });
    console.log(`✓ Created test product ID: ${testProduct._id}\n`);

    // ----------------------------------------------------
    // TEST 1: Update product without changing images
    // ----------------------------------------------------
    console.log('TEST 1: Update product without changing images');
    {
      const res = await apiPut(`/api/products/${testProduct._id}`, {
        name: 'Updated Title Only',
        price: 1350
      });
      assert(res.status === 200, `Returns HTTP 200 (got ${res.status})`);
      assert(res.data.success === true, 'Response indicates success');
      assert(res.data.data.product.name === 'Updated Title Only', 'Product name was updated');
      assert(res.data.data.product.price === 1350, 'Product price was updated');
      assert(res.data.data.product.images?.length === 2, 'Existing images preserved (length = 2)');
      assert(res.data.data.product.images[0].key === 'hbs-products/initial-1.jpg', 'Primary image key intact');
      assert(res.data.data.product.images[1].key === 'hbs-products/initial-2.jpg', 'Secondary image key intact');
    }

    // ----------------------------------------------------
    // TEST 2: Update product via existingImages (Admin Dashboard UI format)
    // ----------------------------------------------------
    console.log('\nTEST 2: Update product via existingImages (Admin UI format that previously triggered extractImageKey is not defined)');
    {
      // The admin UI sends: existingImages: finalImageObjects.map((img, i) => ({ url: img.url, order: i }))
      // Here we reorder the 2 images:
      const res = await apiPut(`/api/products/${testProduct._id}`, {
        existingImages: [
          { url: 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/initial-2.jpg', order: 0 },
          { url: 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/initial-1.jpg', order: 1 }
        ]
      });
      assert(res.status === 200, `Returns HTTP 200 (got ${res.status})`);
      assert(res.data.success === true, 'Response indicates success');
      const updatedImages = res.data.data.product.images;
      assert(updatedImages?.length === 2, '2 images returned');
      assert(updatedImages[0].url.includes('initial-2.jpg'), 'First image is now initial-2.jpg');
      assert(updatedImages[0].key === 'hbs-products/initial-2.jpg', 'First image key extracted correctly');
      assert(updatedImages[0].objectKey === 'hbs-products/initial-2.jpg', 'First image objectKey set correctly');
      assert(updatedImages[0].isPrimary === true, 'First image is marked primary');
      assert(updatedImages[1].url.includes('initial-1.jpg'), 'Second image is now initial-1.jpg');
      assert(updatedImages[1].key === 'hbs-products/initial-1.jpg', 'Second image key extracted correctly');
    }

    // ----------------------------------------------------
    // TEST 3: Update product with new R2 image URLs
    // ----------------------------------------------------
    console.log('\nTEST 3: Update product with new R2 image URLs');
    {
      const newR2Url = 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/new-autumn-collection.webp';
      const res = await apiPut(`/api/products/${testProduct._id}`, {
        existingImages: [
          { url: newR2Url, order: 0 }
        ]
      });
      assert(res.status === 200, `Returns HTTP 200 (got ${res.status})`);
      assert(res.data.success === true, 'Response indicates success');
      const updatedImages = res.data.data.product.images;
      assert(updatedImages?.length === 1, '1 image returned');
      assert(updatedImages[0].key === 'hbs-products/new-autumn-collection.webp', 'New R2 key extracted correctly');
      assert(updatedImages[0].objectKey === 'hbs-products/new-autumn-collection.webp', 'New R2 objectKey set correctly');
      assert(updatedImages[0].url === newR2Url, 'New R2 URL preserved');
    }

    // ----------------------------------------------------
    // TEST 4: Update variant images via variantImageMap
    // ----------------------------------------------------
    console.log('\nTEST 4: Update variant images via variantImageMap');
    {
      const variantR2Url = 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/variant-emerald.jpg';
      const res = await apiPut(`/api/products/${testProduct._id}`, {
        variantImageMap: JSON.stringify([
          {
            colorId: 'c1',
            existingUrls: [variantR2Url]
          }
        ])
      });
      assert(res.status === 200, `Returns HTTP 200 (got ${res.status})`);
      assert(res.data.success === true, 'Response indicates success');
      const variants = res.data.data.product.variants;
      assert(variants?.length === 1, '1 variant returned');
      assert(variants[0].images?.length === 1, 'Variant has 1 image');
      assert(variants[0].images[0].key === 'hbs-products/variant-emerald.jpg', 'Variant image key extracted correctly');
      assert(variants[0].images[0].objectKey === 'hbs-products/variant-emerald.jpg', 'Variant image objectKey set correctly');
      assert(variants[0].images[0].url === variantR2Url, 'Variant image URL preserved');
    }

    // ----------------------------------------------------
    // TEST 5: Update variant images via variants array (JSON payload)
    // ----------------------------------------------------
    console.log('\nTEST 5: Update variant images via variants array (direct JSON payload)');
    {
      const res = await apiPut(`/api/products/${testProduct._id}`, {
        variants: [
          {
            colorId: 'c1',
            color: 'Rose Gold',
            images: [
              'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/variant-array-update.jpg'
            ],
            sizes: [
              {
                sizeId: 's1',
                size: 'Standard',
                price: 1300,
                stock: 20
              }
            ]
          }
        ]
      });
      assert(res.status === 200, `Returns HTTP 200 (got ${res.status})`);
      assert(res.data.success === true, 'Response indicates success');
      const variants = res.data.data.product.variants;
      assert(variants[0].images?.length === 1, 'Variant has 1 image');
      assert(variants[0].images[0].key === 'hbs-products/variant-array-update.jpg', 'Variant image key normalized');
      assert(variants[0].images[0].objectKey === 'hbs-products/variant-array-update.jpg', 'Variant image objectKey set');
      assert(variants[0].images[0].provider === 'r2', 'Provider is r2');
    }

    // ----------------------------------------------------
    // TEST 6: Update product using legacy image URLs
    // ----------------------------------------------------
    console.log('\nTEST 6: Update product using legacy image URLs (images.hijabsbyshiza.com & Cloudinary)');
    {
      const legacyCustomDomainUrl = 'https://images.hijabsbyshiza.com/hbs-products/legacy-hijab-1.jpg';
      const legacyCloudinaryUrl = 'https://res.cloudinary.com/test-cloud/image/upload/v1600000000/hbs-products/legacy-hijab-2.png';

      const res = await apiPut(`/api/products/${testProduct._id}`, {
        existingImages: [
          { url: legacyCustomDomainUrl, order: 0 },
          { url: legacyCloudinaryUrl, order: 1 }
        ]
      });
      assert(res.status === 200, `Returns HTTP 200 (got ${res.status})`);
      assert(res.data.success === true, 'Response indicates success');
      const updatedImages = res.data.data.product.images;
      assert(updatedImages?.length === 2, '2 legacy images returned');
      assert(updatedImages[0].key === 'hbs-products/legacy-hijab-1.jpg', 'Legacy custom domain key extracted');
      assert(updatedImages[0].url === 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/legacy-hijab-1.jpg', 'Legacy custom domain URL translated to canonical R2 URL');
      assert(updatedImages[1].key === 'hbs-products/legacy-hijab-2.png', 'Legacy Cloudinary key extracted');
      assert(updatedImages[1].url === 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/legacy-hijab-2.png', 'Legacy Cloudinary URL translated to canonical R2 URL');
    }

    // ----------------------------------------------------
    // TEST 7: Unit edge cases for extractImageKey helper
    // ----------------------------------------------------
    console.log('\nTEST 7: Edge cases for extractImageKey helper');
    {
      assert(extractImageKey(null) === null, 'extractImageKey(null) === null');
      assert(extractImageKey(undefined) === null, 'extractImageKey(undefined) === null');
      assert(extractImageKey('') === null, 'extractImageKey("") === null');
      assert(extractImageKey('   ') === null, 'extractImageKey("   ") === null');
      assert(extractImageKey(12345) === null, 'extractImageKey(number) === null');
      assert(extractImageKey(false) === null, 'extractImageKey(boolean) === null');
      assert(extractImageKey('data:image/jpeg;base64,...') === null, 'extractImageKey(dataURL) === null');
      assert(extractImageKey('blob:http://localhost/...') === null, 'extractImageKey(blobURL) === null');
      assert(extractImageKey('random invalid text') === null, 'extractImageKey(invalidText) === null');

      // Object formats
      assert(extractImageKey({ objectKey: 'hbs-products/abc.jpg' }) === 'hbs-products/abc.jpg', 'objectKey property handled');
      assert(extractImageKey({ key: 'hbs-products/abc.jpg' }) === 'hbs-products/abc.jpg', 'key property handled');
      assert(extractImageKey({ url: 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/abc.jpg' }) === 'hbs-products/abc.jpg', 'url property handled');
      assert(extractImageKey({ r2Url: 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/abc.jpg' }) === 'hbs-products/abc.jpg', 'r2Url property handled');
      assert(extractImageKey({ imageUrl: 'https://images.hijabsbyshiza.com/hbs-products/abc.jpg' }) === 'hbs-products/abc.jpg', 'imageUrl property handled');

      // Array format (variant image arrays)
      const arrayResult = extractImageKey([
        'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/v1.jpg',
        { objectKey: 'hbs-products/v2.jpg' },
        null,
        'invalid'
      ]);
      assert(Array.isArray(arrayResult), 'Variant image array returns an array');
      assert(arrayResult.length === 2, 'Array filtered out invalid/null elements (length = 2)');
      assert(arrayResult[0] === 'hbs-products/v1.jpg', 'Array element 1 key correct');
      assert(arrayResult[1] === 'hbs-products/v2.jpg', 'Array element 2 key correct');
    }

    // ----------------------------------------------------
    // TEST 8: Invalid image input in PUT /api/products/:id does not crash API
    // ----------------------------------------------------
    console.log('\nTEST 8: Invalid image input gracefully handled without crashing (HTTP 200)');
    {
      const res = await apiPut(`/api/products/${testProduct._id}`, {
        existingImages: [
          { url: null, order: 0 },
          { url: '   ', order: 1 },
          { url: 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/valid-survivor.jpg', order: 2 }
        ]
      });
      assert(res.status === 200, `Returns HTTP 200 without crashing (got ${res.status})`);
      assert(res.data.success === true, 'Response indicates success');
      const updatedImages = res.data.data.product.images;
      assert(updatedImages?.length === 3, 'All 3 items processed without exception');
      assert(updatedImages[2].key === 'hbs-products/valid-survivor.jpg', 'Valid survivor has clean key');
    }

  } finally {
    // Cleanup test product
    if (testProduct?._id) {
      await Product.deleteOne({ _id: testProduct._id });
      console.log('\n✓ Cleaned up test product');
    }
    if (server) {
      server.close();
      console.log('✓ Test server closed');
    }
    await mongoose.disconnect();
    console.log('✓ Database disconnected');
  }

  console.log(`\n========================================`);
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
};

runTests().catch(err => {
  console.error('Test execution failed with error:', err);
  process.exit(1);
});
