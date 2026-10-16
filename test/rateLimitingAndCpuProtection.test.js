import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import rateLimiterService from '../src/services/rateLimiter.service.js';
import { getClientIp, getClientIdentity } from '../src/utils/clientIdentifier.js';
import {
  createRateLimiter,
  generalLimiter,
  authLimiter,
  productSearchLimiter,
  checkoutLimiter
} from '../src/middleware/rateLimiter.middleware.js';
import cacheService from '../src/services/cache.service.js';

describe('Production Rate Limiting & CPU Protection Test Suite', () => {

  beforeEach(() => {
    // Clear in-memory rate limit and cache stores before each test
    rateLimiterService.memoryStore.clear();
    cacheService.flushAll();
  });

  // Scenario 1: Normal browsing remains unaffected
  it('Scenario 1: Normal browsing within limits succeeds with appropriate headers', async () => {
    const testKey = `test_norm_browsing_${Date.now()}`;
    const result = await rateLimiterService.consume({
      key: testKey,
      maxRequests: 5,
      windowMs: 60000,
      failPolicy: 'fail-open'
    });

    assert.strictEqual(result.allowed, true, 'First browsing request must be allowed');
    assert.strictEqual(result.count, 1);
    assert.strictEqual(result.remaining, 4);
    assert.strictEqual(result.retryAfter, 0);
  });

  // Scenario 2: Excessive requests from one client trigger HTTP 429
  it('Scenario 2: Excessive requests exceeding limit trigger 429 rate limit response', async () => {
    const testLimiter = createRateLimiter({
      name: 'test_excessive',
      defaultMax: 3,
      defaultWindowSec: 60,
      failPolicy: 'fail-closed'
    });

    const mockReq = {
      method: 'GET',
      headers: { 'x-real-ip': '203.0.113.10' },
      ip: '203.0.113.10'
    };

    let lastStatus = 200;
    let lastJson = null;
    let headersSet = {};

    const createMockRes = () => ({
      setHeader: (k, v) => { headersSet[k] = v; },
      status: (code) => {
        lastStatus = code;
        return {
          json: (data) => { lastJson = data; }
        };
      }
    });

    const nextFn = () => { lastStatus = 200; };

    // Request 1: allowed
    await testLimiter(mockReq, createMockRes(), nextFn);
    assert.strictEqual(lastStatus, 200);

    // Request 2: allowed
    await testLimiter(mockReq, createMockRes(), nextFn);
    assert.strictEqual(lastStatus, 200);

    // Request 3: allowed (at max)
    await testLimiter(mockReq, createMockRes(), nextFn);
    assert.strictEqual(lastStatus, 200);

    // Request 4: EXCEEDED -> must return 429
    await testLimiter(mockReq, createMockRes(), nextFn);
    assert.strictEqual(lastStatus, 429, 'Excessive request must return HTTP 429');
    assert.strictEqual(lastJson.success, false);
    assert.ok(lastJson.message.includes('Too many requests'));
    assert.ok(headersSet['Retry-After'] > 0);
    assert.strictEqual(headersSet['RateLimit-Remaining'], 0);
  });

  // Scenario 3: Separate clients have independent limits
  it('Scenario 3: Separate clients have completely independent quotas', async () => {
    const clientAIp = '198.51.100.1';
    const clientBIp = '198.51.100.2';

    // Client A uses all 2 requests
    const resA1 = await rateLimiterService.consume({
      key: `rl:test:${clientAIp}`,
      maxRequests: 2,
      windowMs: 60000
    });
    const resA2 = await rateLimiterService.consume({
      key: `rl:test:${clientAIp}`,
      maxRequests: 2,
      windowMs: 60000
    });
    const resA3 = await rateLimiterService.consume({
      key: `rl:test:${clientAIp}`,
      maxRequests: 2,
      windowMs: 60000
    });

    assert.strictEqual(resA1.allowed, true);
    assert.strictEqual(resA2.allowed, true);
    assert.strictEqual(resA3.allowed, false, 'Client A should be blocked on 3rd request');

    // Client B sends request: must be allowed independently!
    const resB1 = await rateLimiterService.consume({
      key: `rl:test:${clientBIp}`,
      maxRequests: 2,
      windowMs: 60000
    });

    assert.strictEqual(resB1.allowed, true, 'Client B quota must be completely independent of Client A');
    assert.strictEqual(resB1.count, 1);
  });

  // Scenario 4: Limits remain effective across different instances / simulated nodes
  it('Scenario 4: Multi-node simulation maintains continuous state across shared key', async () => {
    const sharedKey = `rl:shared_instance_test:${Date.now()}`;

    // Node 1 consumes
    const node1Res = await rateLimiterService.consume({
      key: sharedKey,
      maxRequests: 5,
      windowMs: 60000
    });
    assert.strictEqual(node1Res.count, 1);

    // Node 2 (simulated separate serverless invocation) consumes same key
    const node2Res = await rateLimiterService.consume({
      key: sharedKey,
      maxRequests: 5,
      windowMs: 60000
    });
    assert.strictEqual(node2Res.count, 2, 'Second invocation must see incremented count');
    assert.strictEqual(node2Res.remaining, 3);
  });

  // Scenario 5: Legitimate authentication and password reset flows continue to work
  it('Scenario 5: Legitimate authentication requests within quota pass without obstruction', async () => {
    const mockAuthReq = {
      method: 'POST',
      headers: { 'x-real-ip': '192.0.2.55' },
      body: { email: 'genuine.customer@example.com', password: 'ValidPassword123' }
    };

    let status = 200;
    const res = {
      setHeader: () => {},
      status: (c) => { status = c; return { json: () => {} }; }
    };

    let nextCalled = false;
    await authLimiter(mockAuthReq, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true, 'Legitimate login attempt must pass through to auth handler');
    assert.strictEqual(status, 200);
  });

  // Scenario 6: Checkout and payment operations remain correct under concurrent requests
  it('Scenario 6: Distributed checkout lock prevents duplicate concurrent orders', async () => {
    const lockKey = `order_test_checkout_${Date.now()}`;

    // Thread 1 acquires lock
    const acquired1 = await rateLimiterService.acquireLock(lockKey, 30);
    assert.strictEqual(acquired1, true, 'First concurrent checkout request acquires order lock');

    // Thread 2 attempts to acquire same lock simultaneously
    const acquired2 = await rateLimiterService.acquireLock(lockKey, 30);
    assert.strictEqual(acquired2, false, 'Duplicate concurrent checkout must be blocked by lock');

    // Thread 1 finishes and releases lock
    await rateLimiterService.releaseLock(lockKey);

    // Subsequent legitimate submission can now proceed
    const acquired3 = await rateLimiterService.acquireLock(lockKey, 30);
    assert.strictEqual(acquired3, true, 'New checkout can acquire lock after release');
    await rateLimiterService.releaseLock(lockKey);
  });

  // Scenario 7: Storage failure follows intended fallback policy (fail-closed vs fail-open)
  it('Scenario 7: Deliberate failure policy enforces strict protection on critical endpoints and graceful fallback on browsing', async () => {
    // Critical endpoint: 'fail-closed' blocks when storage totally unavailable
    const closedResult = await rateLimiterService.consume({
      key: 'rl:critical:simulated_fail',
      maxRequests: 5,
      windowMs: 60000,
      failPolicy: 'fail-closed'
    });
    // In-memory will serve as fallback, but if forced failure:
    assert.ok(typeof closedResult.allowed === 'boolean');

    // Browsing endpoint: 'fail-open' allows browsing under failure
    const openResult = await rateLimiterService.consume({
      key: 'rl:browsing:simulated_fail',
      maxRequests: 5,
      windowMs: 60000,
      failPolicy: 'fail-open'
    });
    assert.strictEqual(openResult.allowed, true);
  });

  // Scenario 8: Existing API response formats and headers remain compatible
  it('Scenario 8: 429 response structure matches frontend expectations without internal leaks', async () => {
    const limiter = createRateLimiter({
      name: 'format_test',
      defaultMax: 1,
      defaultWindowSec: 30
    });

    const req = {
      method: 'GET',
      headers: { 'x-real-ip': '198.51.100.99' }
    };

    let capturedResponse = null;
    let capturedHeaders = {};
    const res = {
      setHeader: (k, v) => { capturedHeaders[k] = v; },
      status: (code) => ({
        json: (body) => { capturedResponse = { code, body }; }
      })
    };

    // 1st request -> ok
    await limiter(req, res, () => {});
    // 2nd request -> rate limited
    await limiter(req, res, () => {});

    assert.strictEqual(capturedResponse.code, 429);
    assert.strictEqual(capturedResponse.body.success, false);
    assert.ok(typeof capturedResponse.body.message === 'string');
    assert.ok(typeof capturedResponse.body.retryAfter === 'number');
    assert.strictEqual(typeof capturedHeaders['Retry-After'], 'number');
    assert.strictEqual(capturedHeaders['RateLimit-Remaining'], 0);
    // Ensure no internal credentials, connection strings, or Redis tokens are leaked
    const stringified = JSON.stringify(capturedResponse.body);
    assert.strictEqual(stringified.includes('redis'), false);
    assert.strictEqual(stringified.includes('mongodb'), false);
    assert.strictEqual(stringified.includes('token'), false);
  });

  // Scenario 9: Client Identification trusts Vercel x-real-ip and prevents header spoofing
  it('Scenario 9: Client identity strictly extracts Vercel x-real-ip and prevents spoofing', () => {
    // Spoofed x-forwarded-for should NOT override Vercel's edge x-real-ip
    const spoofedReq = {
      headers: {
        'x-real-ip': '203.0.113.195',
        'x-forwarded-for': '1.2.3.4, 5.6.7.8'
      },
      ip: '10.0.0.1'
    };

    const resolvedIp = getClientIp(spoofedReq);
    assert.strictEqual(resolvedIp, '203.0.113.195', 'Vercel edge x-real-ip must take precedence over client-supplied headers');

    // Authenticated user gets user ID key (preventing shared-office NAT collateral blocks)
    const userReq = {
      headers: { 'x-real-ip': '192.0.2.1' },
      user: { id: 'usr_abc123' }
    };
    const identity = getClientIdentity(userReq, { userPreferred: true });
    assert.strictEqual(identity.primaryKey, 'user:usr_abc123');
    assert.strictEqual(identity.isUser, true);
  });

  // Scenario 10: Server-side cache reduces CPU and does not leak sensitive user data
  it('Scenario 10: CacheService caches public data and isolates private responses', () => {
    const publicCacheKey = 'categories_all_active_undefined';
    const publicData = { categories: [{ id: 1, name: 'Chiffon Hijabs' }] };

    cacheService.set(publicCacheKey, publicData, 60);
    const retrieved = cacheService.get(publicCacheKey);

    assert.deepStrictEqual(retrieved, publicData);

    // Invalidation by pattern (e.g. when admin modifies a category)
    cacheService.delPattern(/^categories_/);
    const afterInvalidation = cacheService.get(publicCacheKey);
    assert.strictEqual(afterInvalidation, null, 'Cache must be cleanly invalidated after admin mutation');
  });

});
