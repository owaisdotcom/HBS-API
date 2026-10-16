import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getOrder,
  createOrder,
  updateOrderStatus,
  verifyPayment
} from '../src/controllers/order.controller.js';
import {
  resolveCustomerEmail,
  resolveCustomerName,
  sendOrderReceivedEmail,
  sendOrderConfirmedEmail,
  sendOrderProcessingEmail,
  sendOrderShippedEmail,
  sendOrderRemainUndeliveredEmail,
  sendOrderDeliveredEmail,
  sendOrderCancelledEmail,
  setTransporterForTesting
} from '../src/services/email.service.js';

describe('Order Controller - Guest Order Handlers & Email Lifecycle', function() {
  it('should export getOrder, createOrder, updateOrderStatus, and verifyPayment handler functions', function() {
    assert.strictEqual(typeof getOrder, 'function');
    assert.strictEqual(typeof createOrder, 'function');
    assert.strictEqual(typeof updateOrderStatus, 'function');
    assert.strictEqual(typeof verifyPayment, 'function');
  });

  it('should resolve guest order customer email even with whitespace or mixed-casing', function() {
    const guestOrder = {
      orderId: 'HBS-GUEST-001',
      userId: null,
      customer: {
        name: 'Guest Buyer',
        email: '  Guest.Buyer@Gmail.COM  '
      }
    };
    assert.strictEqual(resolveCustomerEmail(guestOrder), 'guest.buyer@gmail.com');
    assert.strictEqual(resolveCustomerName(guestOrder), 'Guest Buyer');
  });

  it('should ensure both guest and registered users receive confirmation emails', async function() {
    const sent = [];
    setTransporterForTesting({
      sendMail: async (opts) => {
        sent.push(opts);
        return { messageId: 'test-msg-id' };
      }
    });

    try {
      // Guest order
      const guestOrder = {
        orderId: 'HBS-GUEST-002',
        userId: null,
        customer: {
          name: 'Zahra Guest',
          email: 'zahra@example.com',
          completeAddress: 'Street 5',
          city: 'Islamabad'
        },
        items: [{ productName: 'Jersey Hijab', quantity: 1, price: 900 }],
        subtotal: 900,
        shipping: 300,
        total: 1200
      };

      // Registered user order
      const regOrder = {
        orderId: 'HBS-REG-001',
        userId: '60d5ec49f1b2c8b1f8e4e1a1',
        customer: {
          name: 'Zahra Registered',
          email: 'zahra.reg@example.com',
          completeAddress: 'Street 5',
          city: 'Islamabad'
        },
        items: [{ productName: 'Jersey Hijab', quantity: 1, price: 900 }],
        subtotal: 900,
        shipping: 300,
        total: 1200
      };

      await sendOrderReceivedEmail(guestOrder);
      await sendOrderReceivedEmail(regOrder);

      assert.strictEqual(sent.length, 2);
      assert.strictEqual(sent[0].to, 'zahra@example.com');
      assert.strictEqual(sent[1].to, 'zahra.reg@example.com');
    } finally {
      setTransporterForTesting(null);
    }
  });
});

