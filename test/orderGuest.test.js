import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getOrder, createOrder } from '../src/controllers/order.controller.js';

describe('Order Controller - Guest Order Handlers', function() {
  it('should export getOrder and createOrder handler functions', function() {
    assert.strictEqual(typeof getOrder, 'function');
    assert.strictEqual(typeof createOrder, 'function');
  });
});
