import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
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

describe('Order Lifecycle Email Notifications (Guest & Registered Users)', () => {
  let sentMails = [];

  const mockTransporter = {
    sendMail: async (options) => {
      sentMails.push(options);
      return { messageId: 'mock-msg-' + Date.now() };
    }
  };

  beforeEach(() => {
    sentMails = [];
    setTransporterForTesting(mockTransporter);
  });

  afterEach(() => {
    sentMails = [];
    setTransporterForTesting(null);
  });

  describe('resolveCustomerEmail', () => {
    it('should extract and clean email from a guest order customer snapshot', () => {
      const guestOrder = {
        userId: null,
        customer: {
          name: 'Ayesha Khan',
          email: '  Ayesha.Khan@example.com  ',
          phone: '+923001234567'
        }
      };

      const email = resolveCustomerEmail(guestOrder);
      assert.strictEqual(email, 'ayesha.khan@example.com');
    });

    it('should extract email from a registered user order with customer snapshot', () => {
      const registeredOrder = {
        userId: '60d5ec49f1b2c8b1f8e4e1a1',
        customer: {
          name: 'Fatima Ali',
          email: 'fatima@example.com',
          phone: '+923007654321'
        }
      };

      const email = resolveCustomerEmail(registeredOrder);
      assert.strictEqual(email, 'fatima@example.com');
    });

    it('should fall back to populated userId.email if customer.email is missing for registered users', () => {
      const orderWithPopulatedUser = {
        userId: {
          _id: '60d5ec49f1b2c8b1f8e4e1a1',
          fullName: 'Zainab Ahmed',
          email: '  Zainab@example.com  '
        },
        customer: {
          name: 'Zainab Ahmed'
        }
      };

      const email = resolveCustomerEmail(orderWithPopulatedUser);
      assert.strictEqual(email, 'zainab@example.com');
    });

    it('should return null if no valid email is found', () => {
      assert.strictEqual(resolveCustomerEmail(null), null);
      assert.strictEqual(resolveCustomerEmail({}), null);
      assert.strictEqual(resolveCustomerEmail({ customer: {} }), null);
      assert.strictEqual(resolveCustomerEmail({ customer: { email: 'not-an-email' } }), null);
    });
  });

  describe('resolveCustomerName', () => {
    it('should resolve guest customer name and trim whitespace', () => {
      const guestOrder = {
        userId: null,
        customer: { name: '  Maryam Noor  ' }
      };
      assert.strictEqual(resolveCustomerName(guestOrder), 'Maryam Noor');
    });

    it('should fall back to userId fullName/name when customer name is missing', () => {
      const userOrder = {
        userId: { fullName: 'Sana Malik' },
        customer: {}
      };
      assert.strictEqual(resolveCustomerName(userOrder), 'Sana Malik');
    });

    it('should fall back to Valued Customer when no name is available', () => {
      assert.strictEqual(resolveCustomerName(null), 'Valued Customer');
      assert.strictEqual(resolveCustomerName({ customer: {} }), 'Valued Customer');
    });
  });

  describe('1. Order Received / Placed Email (sendOrderReceivedEmail)', () => {
    it('should send order received confirmation to a guest user', async () => {
      const guestOrder = {
        orderId: 'HBS-202610150001',
        userId: null,
        customer: {
          name: 'Sara Khan',
          email: 'sara.guest@example.com',
          phone: '+923001112233',
          completeAddress: 'House 12, Street 3',
          city: 'Karachi'
        },
        items: [
          {
            productName: 'Silk Chiffon Hijab',
            selectedColor: 'Sage Green',
            quantity: 2,
            price: 1200
          }
        ],
        subtotal: 2400,
        discount: 200,
        shipping: 300,
        total: 2500
      };

      await sendOrderReceivedEmail(guestOrder);

      assert.strictEqual(sentMails.length, 1);
      const mail = sentMails[0];
      assert.strictEqual(mail.to, 'sara.guest@example.com');
      assert.ok(mail.subject.includes('HBS-202610150001'));
      assert.ok(mail.text.includes('Hello Sara Khan'));
      assert.ok(mail.text.includes('Silk Chiffon Hijab'));
      assert.ok(mail.text.includes('Color: Sage Green'));
      assert.ok(mail.text.includes('Total Amount: Rs. 2,500'));
    });

    it('should preserve existing functionality for registered users', async () => {
      const userOrder = {
        orderId: 'HBS-202610150002',
        userId: '60d5ec49f1b2c8b1f8e4e1a1',
        customer: {
          name: 'Hina Tariq',
          email: 'hina.registered@example.com',
          phone: '+923004445566',
          completeAddress: 'Flat 4B, Gulberg III',
          city: 'Lahore'
        },
        items: [
          {
            productName: 'Modal Hijab',
            selectedSize: 'Maxi',
            quantity: 1,
            price: 1500
          }
        ],
        subtotal: 1500,
        discount: 0,
        shipping: 300,
        total: 1800
      };

      await sendOrderReceivedEmail(userOrder);

      assert.strictEqual(sentMails.length, 1);
      const mail = sentMails[0];
      assert.strictEqual(mail.to, 'hina.registered@example.com');
      assert.ok(mail.subject.includes('HBS-202610150002'));
      assert.ok(mail.text.includes('Hello Hina Tariq'));
    });
  });

  describe('2. Order Confirmed Email (sendOrderConfirmedEmail)', () => {
    it('should send confirmed email to guest user when payment is verified', async () => {
      const guestOrder = {
        orderId: 'HBS-202610150003',
        userId: null,
        customer: {
          name: 'Guest Customer',
          email: '  guest.customer@example.com  '
        },
        total: 3500
      };

      await sendOrderConfirmedEmail(guestOrder);

      assert.strictEqual(sentMails.length, 1);
      const mail = sentMails[0];
      assert.strictEqual(mail.to, 'guest.customer@example.com');
      assert.ok(mail.subject.includes('Order Confirmed #HBS-202610150003'));
      assert.ok(mail.text.includes('payment for order #HBS-202610150003 (Rs. 3,500) has been verified'));
    });

    it('should send confirmed email to registered user', async () => {
      const registeredOrder = {
        orderId: 'HBS-202610150004',
        userId: '60d5ec49f1b2c8b1f8e4e1a1',
        customer: {
          name: 'Registered User',
          email: 'reg.user@example.com'
        },
        total: 4200
      };

      await sendOrderConfirmedEmail(registeredOrder);

      assert.strictEqual(sentMails.length, 1);
      assert.strictEqual(sentMails[0].to, 'reg.user@example.com');
    });
  });

  describe('3. Order Processing Email (sendOrderProcessingEmail)', () => {
    it('should send order processing update to guest user', async () => {
      const guestOrder = {
        orderId: 'HBS-202610150005',
        userId: null,
        customer: {
          name: 'Guest Shopper',
          email: 'shopper@example.com'
        }
      };

      await sendOrderProcessingEmail(guestOrder);

      assert.strictEqual(sentMails.length, 1);
      const mail = sentMails[0];
      assert.strictEqual(mail.to, 'shopper@example.com');
      assert.ok(mail.subject.includes('Order Processing #HBS-202610150005'));
      assert.ok(mail.text.includes('now being processed and prepared for delivery'));
    });

    it('should send order processing update to registered user', async () => {
      const userOrder = {
        orderId: 'HBS-202610150006',
        userId: '60d5ec49f1b2c8b1f8e4e1a1',
        customer: {
          name: 'Registered Shopper',
          email: 'reg.shopper@example.com'
        }
      };

      await sendOrderProcessingEmail(userOrder);

      assert.strictEqual(sentMails.length, 1);
      assert.strictEqual(sentMails[0].to, 'reg.shopper@example.com');
      assert.ok(sentMails[0].subject.includes('Order Processing #HBS-202610150006'));
    });
  });

  describe('4. Order Shipped Email (sendOrderShippedEmail)', () => {
    it('should send order shipped email with tracking details to guest user', async () => {
      const guestOrder = {
        orderId: 'HBS-202610150007',
        userId: null,
        customer: {
          name: 'Nadia Guest',
          email: 'nadia@example.com'
        },
        trackingNumber: 'TRX-98765432',
        courier: 'Trax Logistics'
      };

      await sendOrderShippedEmail(guestOrder, 'TRX-98765432', 'Trax Logistics');

      assert.strictEqual(sentMails.length, 1);
      const mail = sentMails[0];
      assert.strictEqual(mail.to, 'nadia@example.com');
      assert.ok(mail.subject.includes('Order Shipped #HBS-202610150007'));
      assert.ok(mail.text.includes('Courier: Trax Logistics'));
      assert.ok(mail.text.includes('Tracking Number: TRX-98765432'));
    });

    it('should send order shipped email to registered user', async () => {
      const userOrder = {
        orderId: 'HBS-202610150008',
        userId: '60d5ec49f1b2c8b1f8e4e1a1',
        customer: {
          name: 'Nadia User',
          email: 'nadia.user@example.com'
        },
        trackingNumber: 'LCS-112233',
        courier: 'Leopards'
      };

      await sendOrderShippedEmail(userOrder);

      assert.strictEqual(sentMails.length, 1);
      assert.strictEqual(sentMails[0].to, 'nadia.user@example.com');
      assert.ok(sentMails[0].text.includes('Tracking Number: LCS-112233'));
    });
  });

  describe('5. Order Remain Undelivered Email (sendOrderRemainUndeliveredEmail)', () => {
    it('should send delivery attempt notification to guest user', async () => {
      const guestOrder = {
        orderId: 'HBS-202610150009',
        userId: null,
        customer: {
          name: 'Sadia Guest',
          email: 'sadia@example.com'
        }
      };

      await sendOrderRemainUndeliveredEmail(guestOrder, 'Customer phone unattended');

      assert.strictEqual(sentMails.length, 1);
      const mail = sentMails[0];
      assert.strictEqual(mail.to, 'sadia@example.com');
      assert.ok(mail.subject.includes('Delivery Update #HBS-202610150009'));
      assert.ok(mail.text.includes('Customer phone unattended'));
    });
  });

  describe('6. Order Delivered Email (sendOrderDeliveredEmail)', () => {
    it('should send delivered notification to guest user', async () => {
      const guestOrder = {
        orderId: 'HBS-202610150010',
        userId: null,
        customer: {
          name: 'Amna Guest',
          email: 'amna@example.com'
        }
      };

      await sendOrderDeliveredEmail(guestOrder);

      assert.strictEqual(sentMails.length, 1);
      const mail = sentMails[0];
      assert.strictEqual(mail.to, 'amna@example.com');
      assert.ok(mail.subject.includes('Order Delivered #HBS-202610150010'));
      assert.ok(mail.text.includes('has been delivered'));
    });

    it('should send delivered notification to registered user', async () => {
      const userOrder = {
        orderId: 'HBS-202610150011',
        userId: '60d5ec49f1b2c8b1f8e4e1a1',
        customer: {
          name: 'Amna Reg',
          email: 'amna.reg@example.com'
        }
      };

      await sendOrderDeliveredEmail(userOrder);

      assert.strictEqual(sentMails.length, 1);
      assert.strictEqual(sentMails[0].to, 'amna.reg@example.com');
    });
  });

  describe('7. Order Cancelled Email (sendOrderCancelledEmail)', () => {
    it('should send cancellation notification to guest user with reason', async () => {
      const guestOrder = {
        orderId: 'HBS-202610150012',
        userId: null,
        customer: {
          name: 'Farah Guest',
          email: 'farah@example.com'
        }
      };

      await sendOrderCancelledEmail(guestOrder, 'Payment receipt unreadable');

      assert.strictEqual(sentMails.length, 1);
      const mail = sentMails[0];
      assert.strictEqual(mail.to, 'farah@example.com');
      assert.ok(mail.subject.includes('Order Cancelled #HBS-202610150012'));
      assert.ok(mail.text.includes('Reason: Payment receipt unreadable'));
    });

    it('should send cancellation notification to registered user', async () => {
      const userOrder = {
        orderId: 'HBS-202610150013',
        userId: '60d5ec49f1b2c8b1f8e4e1a1',
        customer: {
          name: 'Farah Reg',
          email: 'farah.reg@example.com'
        }
      };

      await sendOrderCancelledEmail(userOrder, 'Out of stock');

      assert.strictEqual(sentMails.length, 1);
      assert.strictEqual(sentMails[0].to, 'farah.reg@example.com');
      assert.ok(sentMails[0].text.includes('Reason: Out of stock'));
    });
  });
});
