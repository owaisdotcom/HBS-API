import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Order from '../src/models/Order.js';
import { verifyPayment } from '../src/controllers/order.controller.js';
import { setTransporterForTesting } from '../src/services/email.service.js';

describe('Payment Verification - CastError Fix & Validation Test Suite', function() {
  let db;
  const createdOrderIds = [];

  before(async function() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hbs-ecommerce');
    db = mongoose.connection.db;

    // Suppress real emails in tests
    setTransporterForTesting({
      sendMail: async () => ({ messageId: 'test-email-id' })
    });
  });

  after(async function() {
    if (createdOrderIds.length > 0 && db) {
      await db.collection('orders').deleteMany({ _id: { $in: createdOrderIds } });
    }
    await mongoose.disconnect();
  });

  // Helper to invoke verifyPayment controller
  async function invokeVerifyPayment(orderId, isVerified = true, adminId = '698911cae223a0b96e32c1aa') {
    return new Promise((resolve, reject) => {
      const req = {
        params: { id: orderId.toString() },
        body: { isVerified },
        admin: { id: adminId, _id: adminId }
      };

      const res = {
        statusCode: 200,
        json: (payload) => resolve({ statusCode: res.statusCode, payload }),
        status: (code) => {
          res.statusCode = code;
          return res;
        }
      };

      const next = (err) => {
        if (err) reject(err);
        else resolve({ statusCode: res.statusCode, payload: null });
      };

      try {
        verifyPayment(req, res, next);
      } catch (err) {
        reject(err);
      }
    });
  }

  it('1. should verify payment successfully for orders with normal image arrays', async function() {
    const rawOrder = {
      orderId: `TEST-NORMAL-${Date.now()}`,
      customer: {
        name: 'Normal Customer',
        email: 'normal@example.com',
        phone: '03001234567',
        completeAddress: 'Normal St 1'
      },
      items: [{
        productName: 'Lawn Hijab',
        variantName: 'Black',
        price: 900,
        quantity: 1,
        subtotal: 900,
        variantImages: ['https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/norm1.jpg'],
        variantR2Images: ['https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/norm1.jpg'],
        orderedVariantImages: ['https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/norm1.jpg'],
        orderedVariantR2Images: ['https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/norm1.jpg']
      }],
      subtotal: 900,
      total: 1200,
      paymentMethod: 'bank_transfer',
      paymentStatus: 'pending',
      paymentReceipt: {
        url: 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-receipts/receipt1.jpg',
        r2Url: 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-receipts/receipt1.jpg'
      },
      status: 'received',
      statusHistory: [{ status: 'received', timestamp: new Date() }],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const insertRes = await db.collection('orders').insertOne(rawOrder);
    const orderId = insertRes.insertedId;
    createdOrderIds.push(orderId);

    const result = await invokeVerifyPayment(orderId, true);
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.payload.data.order.paymentStatus, 'verified');
    assert.strictEqual(result.payload.data.order.status, 'confirmed');

    // Confirm DB record
    const updated = await db.collection('orders').findOne({ _id: orderId });
    assert.strictEqual(updated.paymentStatus, 'verified');
    assert.strictEqual(updated.status, 'confirmed');
    assert.ok(Array.isArray(updated.items[0].variantR2Images));
    assert.strictEqual(updated.items[0].variantR2Images[0], 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/norm1.jpg');
  });

  it('2. should verify payment without CastError for legacy orders containing numeric-key image objects', async function() {
    const rawOrder = {
      orderId: `TEST-MALFORMED-${Date.now()}`,
      customer: {
        name: 'Legacy Malformed Customer',
        email: 'malformed@example.com',
        phone: '03001234568',
        completeAddress: 'Malformed St 2'
      },
      items: [{
        productName: 'Chiffon Hijab',
        variantName: 'Teal',
        price: 1100,
        quantity: 1,
        subtotal: 1100,
        // Raw corrupt BSON numeric-key object simulating the production issue
        variantR2Images: { '0': 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/teal-0.jpg', '1': 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/teal-1.jpg' },
        orderedVariantR2Images: { '0': 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/teal-0.jpg' },
        variantImages: { '0': 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/teal-0.jpg' },
        orderedVariantImages: { '0': 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/teal-0.jpg' }
      }],
      subtotal: 1100,
      total: 1400,
      paymentMethod: 'bank_transfer',
      paymentStatus: 'pending',
      paymentReceipt: {
        url: 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-receipts/receipt2.jpg',
        r2Url: 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-receipts/receipt2.jpg'
      },
      status: 'received',
      statusHistory: [{ status: 'received', timestamp: new Date() }],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const insertRes = await db.collection('orders').insertOne(rawOrder);
    const orderId = insertRes.insertedId;
    createdOrderIds.push(orderId);

    // Verify raw DB item has numeric object
    const rawCheck = await db.collection('orders').findOne({ _id: orderId });
    assert.strictEqual(typeof rawCheck.items[0].variantR2Images, 'object');
    assert.strictEqual(Array.isArray(rawCheck.items[0].variantR2Images), false);

    // Invoke payment verification — MUST NOT throw CastError!
    const result = await invokeVerifyPayment(orderId, true);
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.payload.data.order.paymentStatus, 'verified');
    assert.strictEqual(result.payload.data.order.status, 'confirmed');

    // Returned order must contain valid arrays
    assert.ok(Array.isArray(result.payload.data.order.items[0].variantR2Images));
    assert.strictEqual(result.payload.data.order.items[0].variantR2Images.length, 2);
    assert.strictEqual(result.payload.data.order.items[0].variantR2Images[0], 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/teal-0.jpg');
    assert.strictEqual(result.payload.data.order.items[0].variantR2Images[1], 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/teal-1.jpg');
  });

  it('3. should verify payment for orders with missing or null image fields', async function() {
    const rawOrder = {
      orderId: `TEST-MISSING-IMG-${Date.now()}`,
      customer: {
        name: 'Missing Images Customer',
        email: 'missing@example.com',
        phone: '03001234569',
        completeAddress: 'Missing St 3'
      },
      items: [{
        productName: 'Classic Hijab',
        price: 800,
        quantity: 1,
        subtotal: 800
        // No variantR2Images, orderedVariantR2Images, or variantImages specified
      }],
      subtotal: 800,
      total: 1100,
      paymentMethod: 'bank_transfer',
      paymentStatus: 'pending',
      paymentReceipt: {
        url: 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-receipts/receipt3.jpg'
      },
      status: 'received',
      statusHistory: [{ status: 'received', timestamp: new Date() }],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const insertRes = await db.collection('orders').insertOne(rawOrder);
    const orderId = insertRes.insertedId;
    createdOrderIds.push(orderId);

    const result = await invokeVerifyPayment(orderId, true);
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.payload.data.order.paymentStatus, 'verified');
    assert.strictEqual(result.payload.data.order.status, 'confirmed');
  });

  it('4. should verify payment for orders containing legacy image URLs and preserve valid URLs', async function() {
    const rawOrder = {
      orderId: `TEST-LEGACY-URL-${Date.now()}`,
      customer: {
        name: 'Legacy URL Customer',
        email: 'legacy-url@example.com',
        phone: '03001234570',
        completeAddress: 'Legacy St 4'
      },
      items: [{
        productName: 'Silk Hijab',
        price: 1500,
        quantity: 1,
        subtotal: 1500,
        variantImages: ['https://images.hijabsbyshiza.com/hbs-products/legacy-silk.jpg'],
        variantR2Images: ['https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/legacy-silk.jpg'],
        orderedVariantImages: ['https://images.hijabsbyshiza.com/hbs-products/legacy-silk.jpg'],
        orderedVariantR2Images: ['https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/legacy-silk.jpg']
      }],
      subtotal: 1500,
      total: 1800,
      paymentMethod: 'bank_transfer',
      paymentStatus: 'pending',
      paymentReceipt: {
        url: 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-receipts/receipt4.jpg'
      },
      status: 'received',
      statusHistory: [{ status: 'received', timestamp: new Date() }],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const insertRes = await db.collection('orders').insertOne(rawOrder);
    const orderId = insertRes.insertedId;
    createdOrderIds.push(orderId);

    const result = await invokeVerifyPayment(orderId, true);
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.payload.data.order.paymentStatus, 'verified');

    // Confirm that existing R2 URL was preserved without modification
    const item = result.payload.data.order.items[0];
    assert.strictEqual(item.variantR2Images[0], 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/legacy-silk.jpg');
    assert.strictEqual(item.orderedVariantR2Images[0], 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/legacy-silk.jpg');
  });

  it('5. should ensure payment verification is idempotent when called multiple times', async function() {
    const rawOrder = {
      orderId: `TEST-IDEMPOTENT-${Date.now()}`,
      customer: {
        name: 'Idempotent Customer',
        email: 'idempotent@example.com',
        phone: '03001234571',
        completeAddress: 'Idempotent St 5'
      },
      items: [{
        productName: 'Everyday Hijab',
        price: 700,
        quantity: 1,
        subtotal: 700
      }],
      subtotal: 700,
      total: 1000,
      paymentMethod: 'bank_transfer',
      paymentStatus: 'pending',
      paymentReceipt: {
        url: 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-receipts/receipt5.jpg'
      },
      status: 'received',
      statusHistory: [{ status: 'received', timestamp: new Date() }],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const insertRes = await db.collection('orders').insertOne(rawOrder);
    const orderId = insertRes.insertedId;
    createdOrderIds.push(orderId);

    // First call: verifies payment
    const call1 = await invokeVerifyPayment(orderId, true);
    assert.strictEqual(call1.statusCode, 200);
    assert.strictEqual(call1.payload.data.order.paymentStatus, 'verified');

    const firstVerifiedAt = call1.payload.data.order.paymentReceipt.verifiedAt;
    const historyLengthAfterFirst = call1.payload.data.order.statusHistory.length;

    // Second call: should be idempotent no-op, preserving verifiedAt and not adding duplicate history
    const call2 = await invokeVerifyPayment(orderId, true);
    assert.strictEqual(call2.statusCode, 200);
    assert.strictEqual(call2.payload.message, 'Payment already verified for this order');
    assert.strictEqual(new Date(call2.payload.data.order.paymentReceipt.verifiedAt).getTime(), new Date(firstVerifiedAt).getTime());
    assert.strictEqual(call2.payload.data.order.statusHistory.length, historyLengthAfterFirst);
  });

  it('6. should reject payment and cancel order idempotently without failing on image fields', async function() {
    const rawOrder = {
      orderId: `TEST-REJECT-${Date.now()}`,
      customer: {
        name: 'Reject Customer',
        email: 'reject@example.com',
        phone: '03001234572',
        completeAddress: 'Reject St 6'
      },
      items: [{
        productName: 'Modal Hijab',
        price: 950,
        quantity: 1,
        subtotal: 950,
        variantR2Images: { '0': 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-products/modal.jpg' }
      }],
      subtotal: 950,
      total: 1250,
      paymentMethod: 'bank_transfer',
      paymentStatus: 'pending',
      paymentReceipt: {
        url: 'https://pub-ceeab3c4ada9427db0e0bf6d8b26230a.r2.dev/hbs-receipts/fake-receipt.jpg'
      },
      status: 'received',
      statusHistory: [{ status: 'received', timestamp: new Date() }],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const insertRes = await db.collection('orders').insertOne(rawOrder);
    const orderId = insertRes.insertedId;
    createdOrderIds.push(orderId);

    // Call verifyPayment with isVerified = false
    const rejectResult = await invokeVerifyPayment(orderId, false);
    assert.strictEqual(rejectResult.statusCode, 200);
    assert.strictEqual(rejectResult.payload.data.order.paymentStatus, 'failed');
    assert.strictEqual(rejectResult.payload.data.order.status, 'cancelled');

    // Second reject call should be idempotent no-op
    const repeatReject = await invokeVerifyPayment(orderId, false);
    assert.strictEqual(repeatReject.statusCode, 200);
    assert.strictEqual(repeatReject.payload.message, 'Payment already rejected for this order');
  });
});
