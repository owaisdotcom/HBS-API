import { describe, it } from 'node:test';
import assert from 'node:assert';
import Order from '../src/models/Order.js';

describe('Order model - variant image snapshot schema', function() {
  it('should have variantImage, variantImages, orderedVariantImage, orderedVariantImages, and variantName in items schema', function() {
    const itemsPath = Order.schema.path('items');
    assert.ok(itemsPath, 'items path should exist on Order schema');
    const schema = itemsPath.schema;
    assert.ok(schema.path('variantImage'), 'variantImage path missing on items');
    assert.ok(schema.path('variantImages'), 'variantImages path missing on items');
    assert.ok(schema.path('orderedVariantImage'), 'orderedVariantImage path missing on items');
    assert.ok(schema.path('orderedVariantImages'), 'orderedVariantImages path missing on items');
    assert.ok(schema.path('variantName'), 'variantName path missing on items');
    assert.ok(schema.path('variantSnapshot'), 'variantSnapshot path missing on items');
    assert.ok(schema.path('productImage'), 'productImage path missing on items');
  });

  it('should preserve snapshot variant image data when constructing an Order instance', function() {
    const order = new Order({
      orderId: 'HBS-202609049999',
      customer: {
        name: 'Test Customer',
        email: 'customer@example.com',
        phone: '03001234567',
        completeAddress: '123 Test Street'
      },
      items: [
        {
          productName: 'Chiffon Hijab',
          productImage: 'https://res.cloudinary.com/demo/image/upload/main-chiffon.jpg',
          variantId: 'dark-grey-one-size',
          variantName: 'Dark Grey',
          variantImage: 'https://res.cloudinary.com/demo/image/upload/dark-grey.jpg',
          variantImages: [
            'https://res.cloudinary.com/demo/image/upload/dark-grey.jpg',
            'https://res.cloudinary.com/demo/image/upload/dark-grey-2.jpg'
          ],
          orderedVariantImage: 'https://res.cloudinary.com/demo/image/upload/dark-grey.jpg',
          orderedVariantImages: [
            'https://res.cloudinary.com/demo/image/upload/dark-grey.jpg',
            'https://res.cloudinary.com/demo/image/upload/dark-grey-2.jpg'
          ],
          variantSnapshot: {
            name: 'Dark Grey',
            color: 'Dark Grey',
            image: 'https://res.cloudinary.com/demo/image/upload/dark-grey.jpg',
            images: ['https://res.cloudinary.com/demo/image/upload/dark-grey.jpg']
          },
          price: 950,
          quantity: 2,
          selectedColor: 'Dark Grey',
          subtotal: 1900
        }
      ],
      subtotal: 1900,
      total: 2200
    });

    const item = order.items[0];
    assert.strictEqual(item.variantName, 'Dark Grey');
    assert.strictEqual(item.variantImage, 'https://res.cloudinary.com/demo/image/upload/dark-grey.jpg');
    assert.strictEqual(item.orderedVariantImage, 'https://res.cloudinary.com/demo/image/upload/dark-grey.jpg');
    assert.strictEqual(item.variantImages.length, 2);
    assert.strictEqual(item.productImage, 'https://res.cloudinary.com/demo/image/upload/main-chiffon.jpg');
    assert.strictEqual(item.variantSnapshot.image, 'https://res.cloudinary.com/demo/image/upload/dark-grey.jpg');
  });

  it('should support legacy orders without variant image fields gracefully', function() {
    const order = new Order({
      orderId: 'HBS-202601010001',
      customer: {
        name: 'Legacy Customer',
        email: 'legacy@example.com',
        phone: '03001111111',
        completeAddress: '456 Old Street'
      },
      items: [
        {
          productName: 'Classic Lawn Hijab',
          productImage: 'https://res.cloudinary.com/demo/image/upload/classic-lawn.jpg',
          price: 500,
          quantity: 1,
          subtotal: 500
        }
      ],
      subtotal: 500,
      total: 800
    });

    const item = order.items[0];
    assert.strictEqual(item.variantImage, undefined);
    assert.strictEqual(item.orderedVariantImage, undefined);
    assert.strictEqual(item.productImage, 'https://res.cloudinary.com/demo/image/upload/classic-lawn.jpg');
  });
});
