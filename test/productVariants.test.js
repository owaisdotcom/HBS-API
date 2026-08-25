import { describe, it } from 'node:test';
import assert from 'node:assert';
import Product from '../src/models/Product.js';

describe('Product model - variants schema', function() {
  it('should have a variants path in schema', function() {
    assert.ok(Product.schema.path('variants'), 'variants path missing on Product schema');
  });
});
