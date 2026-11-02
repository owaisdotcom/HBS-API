import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import app from './src/app.js';
import connectDB from './src/config/database.js';
import Admin from './src/models/Admin.js';
import Order from './src/models/Order.js';
import Product from './src/models/Product.js';
import PreMadeBundle from './src/models/PreMadeBundle.js';

let server;
let baseUrl;
let adminToken;
let testAdmin;

// Helper to make authenticated requests
const apiPost = async (path, body, token = adminToken) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
};

const runTests = async () => {
  console.log('--- STARTING COMPREHENSIVE REVERT PAYMENT REJECTION TESTS ---');

  await connectDB();
  console.log('✓ Database connected');

  testAdmin = await Admin.findOne({ role: 'super_admin' });
  if (!testAdmin) {
    throw new Error('No super_admin found in DB');
  }

  adminToken = jwt.sign({ id: testAdmin._id }, process.env.ADMIN_JWT_SECRET, { expiresIn: '1d' });
  console.log('✓ Generated test admin token');

  // Start ephemeral server
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
    // ==========================================
    // 1. AUTHENTICATION & AUTHORIZATION
    // ==========================================
    console.log('Test Suite 1: Authentication & Authorization');
    {
      const resNoToken = await apiPost('/api/admin/orders/any-id/revert-payment-rejection', { reason: 'Test' }, null);
      assert(resNoToken.status === 401, 'Rejection endpoint requires auth token (returns 401)');

      const resBadToken = await apiPost('/api/admin/orders/any-id/revert-payment-rejection', { reason: 'Test' }, 'invalid_token');
      assert(resBadToken.status === 401, 'Rejection endpoint rejects invalid token (returns 401)');
    }

    // ==========================================
    // 2. INPUT VALIDATION
    // ==========================================
    console.log('\nTest Suite 2: Input Validation');
    {
      const resEmptyReason = await apiPost('/api/admin/orders/dummy-id/revert-payment-rejection', { reason: '' });
      assert(resEmptyReason.status === 400, 'Rejection endpoint rejects empty reason (returns 400)');

      const resShortReason = await apiPost('/api/admin/orders/dummy-id/revert-payment-rejection', { reason: 'ab' });
      assert(resShortReason.status === 400, 'Rejection endpoint rejects reason < 3 chars (returns 400)');

      const resNoBody = await apiPost('/api/admin/orders/dummy-id/revert-payment-rejection', {});
      assert(resNoBody.status === 400, 'Rejection endpoint rejects missing reason (returns 400)');
    }

    // ==========================================
    // 3. INELIGIBLE ORDERS
    // ==========================================
    console.log('\nTest Suite 3: Ineligible Orders');
    {
      // 3.1 Non-existent order
      const fakeMongoId = new mongoose.Types.ObjectId().toString();
      const resNotFound = await apiPost(`/api/admin/orders/${fakeMongoId}/revert-payment-rejection`, { reason: 'Valid Reason' });
      assert(resNotFound.status === 404, 'Non-existent order returns 404');

      // 3.2 Order not cancelled (e.g. status: received, paymentStatus: pending)
      const notCancelledOrder = await Order.create({
        customer: { name: 'Test User', email: 'test@example.com', phone: '1234567890', completeAddress: 'Addr' },
        items: [],
        subtotal: 100,
        total: 100,
        paymentStatus: 'pending',
        status: 'received',
        paymentReceipt: { url: 'https://example.com/receipt.jpg' }
      });
      const resNotCancelled = await apiPost(`/api/admin/orders/${notCancelledOrder._id}/revert-payment-rejection`, { reason: 'Valid reason' });
      assert(resNotCancelled.status === 400, 'Non-cancelled order cannot be reverted (returns 400)');
      await Order.findByIdAndDelete(notCancelledOrder._id);

      // 3.3 Order cancelled for customer reasons (unrelated to payment rejection)
      const customerCancelledOrder = await Order.create({
        customer: { name: 'Test User', email: 'test@example.com', phone: '1234567890', completeAddress: 'Addr' },
        items: [],
        subtotal: 100,
        total: 100,
        paymentStatus: 'failed',
        status: 'cancelled',
        paymentReceipt: { url: 'https://example.com/receipt.jpg' },
        statusHistory: [
          { status: 'received', timestamp: new Date() },
          { status: 'cancelled', note: 'Customer changed mind', timestamp: new Date() }
        ]
      });
      const resCustomerCancelled = await apiPost(`/api/admin/orders/${customerCancelledOrder._id}/revert-payment-rejection`, { reason: 'Valid reason' });
      assert(resCustomerCancelled.status === 400, 'Customer cancelled order cannot be reverted (returns 400)');
      await Order.findByIdAndDelete(customerCancelledOrder._id);

      // 3.4 Soft-deleted order
      const softDeletedOrder = await Order.create({
        customer: { name: 'Test User', email: 'test@example.com', phone: '1234567890', completeAddress: 'Addr' },
        items: [],
        subtotal: 100,
        total: 100,
        paymentStatus: 'failed',
        status: 'cancelled',
        isDeleted: true,
        deletedAt: new Date(),
        paymentReceipt: { url: 'https://example.com/receipt.jpg' },
        statusHistory: [
          { status: 'cancelled', note: 'Payment rejected', timestamp: new Date() }
        ]
      });
      const resDeleted = await apiPost(`/api/admin/orders/${softDeletedOrder._id}/revert-payment-rejection`, { reason: 'Valid reason' });
      assert(resDeleted.status === 400, 'Soft deleted order cannot be reverted (returns 400)');
      await Order.findByIdAndDelete(softDeletedOrder._id);
    }

    // ==========================================
    // 4. ELIGIBLE ORDER WITH RESTORED STOCK (VARIANTS & CUSTOMIZATIONS)
    // ==========================================
    console.log('\nTest Suite 4: Eligible Order with Restored Stock & Variants');
    {
      // Create product with variant and tie customization
      const testProduct = await Product.create({
        name: 'Test Khimar for Revert Test',
        slug: `test-khimar-revert-${Date.now()}`,
        description: 'Test Description',
        price: 50,
        stock: 20,
        variants: [
          {
            colorId: 'navy',
            color: 'Navy',
            images: [],
            sizes: [
              {
                sizeId: 'regular',
                size: 'Regular',
                sku: 'KHM-NAVY-REG',
                price: 50,
                stock: 20,
                hasTieElastic: true,
                tieStock: 10,
                elasticStock: 10,
                hasBridalLength: false,
                bridalStock: 0
              }
            ]
          }
        ]
      });

      // Stock before order was cancelled/restored:
      // Suppose stock was restored to 20 (and tieStock to 10)
      const eligibleOrder = await Order.create({
        customer: { name: 'Ayesha Khan', email: 'ayesha@example.com', phone: '03001234567', completeAddress: 'Clifton Karachi' },
        items: [
          {
            productId: testProduct._id,
            productName: testProduct.name,
            sku: 'KHM-NAVY-REG',
            variantId: 'navy-regular',
            price: 50,
            quantity: 2,
            selectedColor: 'Navy',
            selectedSize: 'Regular',
            selectedTieElastic: 'tie',
            subtotal: 100
          }
        ],
        subtotal: 100,
        shipping: 200,
        total: 300,
        paymentMethod: 'bank_transfer',
        paymentStatus: 'failed',
        status: 'cancelled',
        cancelledAt: new Date(),
        stockDeducted: true,
        stockRestored: true, // Stock was restored upon rejection
        paymentReceipt: {
          url: 'https://images.example.com/receipt-123.jpg',
          key: 'hbs-receipts/receipt-123.jpg',
          provider: 'r2',
          uploadedAt: new Date()
        },
        statusHistory: [
          { status: 'received', timestamp: new Date(Date.now() - 3600000) },
          { status: 'cancelled', note: 'Payment rejected', updatedBy: testAdmin._id, timestamp: new Date() }
        ]
      });

      const initialHistoryLength = eligibleOrder.statusHistory.length;

      // Revert the payment rejection using custom orderId
      const res = await apiPost(`/api/admin/orders/${eligibleOrder.orderId}/revert-payment-rejection`, {
        reason: 'Payment was verified with bank slip, accidental rejection'
      });

      assert(res.status === 200, 'Reverting payment rejection returns 200 OK');
      assert(res.data.success === true, 'Response indicates success: true');
      assert(res.data.data.paymentStatus === 'pending', 'Payment status is reset to "pending" (NOT verified or paid)');
      assert(res.data.data.status === 'received', 'Order status is restored to pre-rejection "received"');
      assert(res.data.data.inventoryReservation.action === 're_deducted', 'Inventory reservation action is "re_deducted"');
      assert(res.data.data.inventoryReservation.stockRestored === false, 'Stock restored flag is set to false');
      assert(res.data.data.inventoryReservation.stockDeducted === true, 'Stock deducted flag is set to true');

      // Verify in DB
      const updatedOrder = await Order.findById(eligibleOrder._id);
      assert(updatedOrder.paymentStatus === 'pending', 'DB paymentStatus is strictly "pending"');
      assert(updatedOrder.status === 'received', 'DB status is "received"');
      assert(updatedOrder.cancelledAt == null, 'cancelledAt has been cleared');
      assert(updatedOrder.stockRestored === false, 'DB stockRestored is false');
      assert(updatedOrder.stockDeducted === true, 'DB stockDeducted is true');
      assert(updatedOrder.paymentReceipt.url === 'https://images.example.com/receipt-123.jpg', 'Receipt metadata is preserved');
      assert(updatedOrder.customer.name === 'Ayesha Khan', 'Customer data is preserved');

      // Check status history
      assert(updatedOrder.statusHistory.length === initialHistoryLength + 1, 'Exactly one new status history entry added');
      const latestHistory = updatedOrder.statusHistory[updatedOrder.statusHistory.length - 1];
      assert(latestHistory.status === 'received', 'New history entry status is "received"');
      assert(latestHistory.note.includes('Accidental rejection') || latestHistory.note.includes('accidental rejection'), 'New history records the admin reason');
      assert(latestHistory.updatedBy.toString() === testAdmin._id.toString(), 'New history records the admin ID');

      // Check inventory deduction in DB
      const updatedProduct = await Product.findById(testProduct._id);
      const updatedSize = updatedProduct.variants[0].sizes[0];
      assert(updatedSize.tieStock === 8, `Tie customization stock reduced from 10 to 8 (actual: ${updatedSize.tieStock})`);
      assert(updatedSize.stock === 18, `Variant size stock reduced from 20 to 18 (actual: ${updatedSize.stock})`);
      assert(updatedProduct.stock === 18, `Total product stock recomputed to 18 (actual: ${updatedProduct.stock})`);

      // ==========================================
      // 5. IDEMPOTENCY / REPEATED RECOVERY CALL
      // ==========================================
      console.log('\nTest Suite 5: Idempotency & Repeated Recovery Calls');
      const resRepeat = await apiPost(`/api/admin/orders/${eligibleOrder.orderId}/revert-payment-rejection`, {
        reason: 'Attempt duplicate revert'
      });
      assert(resRepeat.status === 400, 'Repeated call fails with 400 (already recovered)');

      // Verify stock was NOT deducted again
      const productAfterRepeat = await Product.findById(testProduct._id);
      assert(productAfterRepeat.variants[0].sizes[0].tieStock === 8, 'Stock remains 8, no duplicate deduction occurred');

      // Cleanup
      await Order.findByIdAndDelete(eligibleOrder._id);
      await Product.findByIdAndDelete(testProduct._id);
    }

    // ==========================================
    // 6. ORDER WHOSE STOCK WAS NOT RESTORED
    // ==========================================
    console.log('\nTest Suite 6: Order Whose Stock Was NOT Restored');
    {
      const testProduct2 = await Product.create({
        name: 'Simple Product No Restore Test',
        slug: `simple-prod-test-${Date.now()}`,
        description: 'Test Description',
        price: 100,
        stock: 50
      });

      const orderStockNotRestored = await Order.create({
        customer: { name: 'Sara Ahmed', email: 'sara@example.com', phone: '03009876543', completeAddress: 'Gulshan Karachi' },
        items: [
          {
            productId: testProduct2._id,
            productName: testProduct2.name,
            price: 100,
            quantity: 5,
            subtotal: 500
          }
        ],
        subtotal: 500,
        total: 500,
        paymentStatus: 'failed',
        status: 'cancelled',
        stockDeducted: true,
        stockRestored: false, // Stock was NEVER restored back into inventory
        paymentReceipt: { url: 'https://example.com/receipt2.jpg' },
        statusHistory: [
          { status: 'cancelled', note: 'Payment rejected', timestamp: new Date() }
        ]
      });

      // Test using MongoDB _id
      const res = await apiPost(`/api/admin/orders/${orderStockNotRestored._id}/revert-payment-rejection`, {
        reason: 'Reverting payment rejection with untouched stock'
      });

      assert(res.status === 200, 'Reverting order with unrestored stock returns 200 OK');
      assert(res.data.data.inventoryReservation.action === 'unchanged', 'Inventory action is "unchanged"');

      // Product stock should still be 50 (NOT deducted again)
      const prodCheck = await Product.findById(testProduct2._id);
      assert(prodCheck.stock === 50, `Stock was not deducted again; remained 50 (actual: ${prodCheck.stock})`);

      await Order.findByIdAndDelete(orderStockNotRestored._id);
      await Product.findByIdAndDelete(testProduct2._id);
    }

    // ==========================================
    // 7. INSUFFICIENT INVENTORY ERROR & ROLLBACK
    // ==========================================
    console.log('\nTest Suite 7: Insufficient Inventory Error & Rollback');
    {
      const lowStockProduct = await Product.create({
        name: 'Low Stock Product',
        slug: `low-stock-${Date.now()}`,
        description: 'Description',
        price: 30,
        stock: 1
      });

      const insufficientStockOrder = await Order.create({
        customer: { name: 'Zainab Ali', email: 'zainab@example.com', phone: '03001112233', completeAddress: 'Defence Lahore' },
        items: [
          {
            productId: lowStockProduct._id,
            productName: lowStockProduct.name,
            price: 30,
            quantity: 5, // Requires 5, but stock is only 1!
            subtotal: 150
          }
        ],
        subtotal: 150,
        total: 150,
        paymentStatus: 'failed',
        status: 'cancelled',
        stockDeducted: true,
        stockRestored: true,
        paymentReceipt: { url: 'https://example.com/receipt3.jpg' },
        statusHistory: [
          { status: 'cancelled', note: 'Payment rejected', timestamp: new Date() }
        ]
      });

      const res = await apiPost(`/api/admin/orders/${insufficientStockOrder._id}/revert-payment-rejection`, {
        reason: 'Try to revert despite insufficient stock'
      });

      assert(res.status === 400, 'Insufficient inventory returns 400 Bad Request');
      assert(res.data.message.includes('Insufficient') || res.data.message.includes('stock'), 'Error message clearly mentions insufficient stock');

      // Verify order and inventory remained untouched
      const orderUnchanged = await Order.findById(insufficientStockOrder._id);
      assert(orderUnchanged.status === 'cancelled', 'Order status remains "cancelled"');
      assert(orderUnchanged.paymentStatus === 'failed', 'Payment status remains "failed"');

      const prodUnchanged = await Product.findById(lowStockProduct._id);
      assert(prodUnchanged.stock === 1, 'Product stock remains unchanged at 1');

      await Order.findByIdAndDelete(insufficientStockOrder._id);
      await Product.findByIdAndDelete(lowStockProduct._id);
    }

    // ==========================================
    // 8. PRE-MADE BUNDLE SUPPORT
    // ==========================================
    console.log('\nTest Suite 8: Pre-Made Bundle Support');
    {
      const testBundle = await PreMadeBundle.create({
        name: 'Eid Special Bundle',
        slug: `eid-bundle-${Date.now()}`,
        price: 2500,
        stock: 15,
        status: 'active'
      });

      const bundleOrder = await Order.create({
        customer: { name: 'Fatima Noor', email: 'fatima@example.com', phone: '03005556677', completeAddress: 'Islamabad F-7' },
        items: [
          {
            preMadeBundleId: testBundle._id,
            productName: testBundle.name,
            price: 2500,
            quantity: 3,
            subtotal: 7500
          }
        ],
        subtotal: 7500,
        total: 7500,
        paymentStatus: 'failed',
        status: 'cancelled',
        stockDeducted: true,
        stockRestored: true,
        paymentReceipt: { url: 'https://example.com/receipt-bundle.jpg' },
        statusHistory: [
          { status: 'cancelled', note: 'Payment rejected', timestamp: new Date() }
        ]
      });

      const res = await apiPost(`/api/admin/orders/${bundleOrder._id}/revert-payment-rejection`, {
        reason: 'Bundle order accidental rejection reversal'
      });

      assert(res.status === 200, 'Reverting bundle order returns 200 OK');

      const updatedBundle = await PreMadeBundle.findById(testBundle._id);
      assert(updatedBundle.stock === 12, `Bundle stock reduced from 15 to 12 (actual: ${updatedBundle.stock})`);

      await Order.findByIdAndDelete(bundleOrder._id);
      await PreMadeBundle.findByIdAndDelete(testBundle._id);
    }

  } finally {
    if (server) {
      server.close();
      console.log('\n✓ Test server closed');
    }
  }

  console.log(`\n==========================================`);
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`==========================================`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
};

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
