import { Redis } from '@upstash/redis';
import RateLimitModel from '../models/RateLimit.js';
import mongoose from 'mongoose';

/**
 * Distributed Rate Limiting & CPU Protection Storage Service
 *
 * Architecture:
 * - Tier 1: Upstash Redis REST (stateless, connectionless HTTP, distributed across serverless instances)
 * - Tier 2: MongoDB Atlas TTL Collection (distributed fallback using existing Mongoose connection)
 * - Tier 3: In-Memory Bounded Sliding Window (local fallback for transient degradations)
 *
 * Fail Policy:
 * - 'fail-closed': Enforced on auth, checkout, password reset, and OTP endpoints.
 * - 'fail-open': Enforced on public browsing, product catalog, and categories.
 */

class RateLimiterService {
  constructor() {
    this.redisClient = null;
    this.redisConfigured = false;
    this.memoryStore = new Map();
    this.maxMemoryKeys = 5000;
    this.lastMemoryCleanup = Date.now();

    this.initRedis();
  }

  /**
   * Initializes Upstash Redis client with connection reuse
   */
  initRedis() {
    const restUrl = process.env.UPSTASH_REDIS_REST_URL;
    const restToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (restUrl && restToken) {
      try {
        this.redisClient = new Redis({
          url: restUrl,
          token: restToken,
          retry: {
            retries: 1,
            backoff: (retryCount) => Math.exp(retryCount) * 50
          }
        });
        this.redisConfigured = true;
      } catch (err) {
        console.warn('⚠️ [RateLimiter] Failed to initialize Upstash Redis:', err.message);
        this.redisConfigured = false;
      }
    }
  }

  /**
   * Cleans expired entries from in-memory fallback store to avoid memory leaks
   */
  cleanMemoryStore() {
    const now = Date.now();
    if (now - this.lastMemoryCleanup < 30000 && this.memoryStore.size < this.maxMemoryKeys) {
      return;
    }
    this.lastMemoryCleanup = now;

    for (const [key, value] of this.memoryStore.entries()) {
      if (now >= value.resetTime) {
        this.memoryStore.delete(key);
      }
    }

    // Safety guard: if still over capacity, trim oldest entries
    if (this.memoryStore.size > this.maxMemoryKeys) {
      const keysToDelete = Array.from(this.memoryStore.keys()).slice(0, Math.floor(this.maxMemoryKeys * 0.3));
      for (const k of keysToDelete) {
        this.memoryStore.delete(k);
      }
    }
  }

  /**
   * Increments and checks rate limit using in-memory fallback store
   */
  checkInMemory(key, maxRequests, windowMs) {
    this.cleanMemoryStore();
    const now = Date.now();
    const entry = this.memoryStore.get(key);

    if (!entry || now >= entry.resetTime) {
      const resetTime = now + windowMs;
      this.memoryStore.set(key, { count: 1, resetTime });
      return {
        allowed: true,
        count: 1,
        remaining: Math.max(0, maxRequests - 1),
        resetTime,
        retryAfter: 0,
        source: 'memory'
      };
    }

    entry.count += 1;
    const allowed = entry.count <= maxRequests;
    const remaining = Math.max(0, maxRequests - entry.count);
    const retryAfter = allowed ? 0 : Math.max(1, Math.ceil((entry.resetTime - now) / 1000));

    return {
      allowed,
      count: entry.count,
      remaining,
      resetTime: entry.resetTime,
      retryAfter,
      source: 'memory'
    };
  }

  /**
   * Increments and checks rate limit using MongoDB Atlas distributed TTL store
   */
  async checkMongo(key, maxRequests, windowMs) {
    if (mongoose.connection.readyState !== 1) {
      throw new Error('MongoDB connection is not open');
    }

    const now = new Date();
    const windowEnd = new Date(Date.now() + windowMs);

    // Atomic update of existing unexpired window
    const updated = await RateLimitModel.findOneAndUpdate(
      { key, expiresAt: { $gt: now } },
      { $inc: { count: 1 } },
      { new: true }
    );

    let count;
    let resetTime;

    if (updated) {
      count = updated.count;
      resetTime = updated.expiresAt.getTime();
    } else {
      // Upsert new window
      const inserted = await RateLimitModel.findOneAndUpdate(
        { key },
        { $set: { count: 1, expiresAt: windowEnd } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      count = inserted.count;
      resetTime = inserted.expiresAt.getTime();
    }

    const allowed = count <= maxRequests;
    const remaining = Math.max(0, maxRequests - count);
    const retryAfter = allowed ? 0 : Math.max(1, Math.ceil((resetTime - Date.now()) / 1000));

    return {
      allowed,
      count,
      remaining,
      resetTime,
      retryAfter,
      source: 'mongodb'
    };
  }

  /**
   * Increments and checks rate limit using Upstash Redis REST
   */
  async checkRedis(key, maxRequests, windowMs) {
    if (!this.redisClient) {
      throw new Error('Redis client not configured');
    }

    const ttlSeconds = Math.max(1, Math.ceil(windowMs / 1000));
    
    // Execute atomic INCR and TTL with 1500ms timeout
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Redis request timeout (1500ms)')), 1500)
    );

    const redisOperation = (async () => {
      const pipeline = this.redisClient.pipeline();
      pipeline.incr(key);
      pipeline.ttl(key);
      const [count, ttl] = await pipeline.exec();

      // If key is brand new (ttl is -1 or count === 1), set expiration
      if (ttl < 0 || count === 1) {
        await this.redisClient.expire(key, ttlSeconds);
      }

      const effectiveTtl = (ttl > 0) ? ttl : ttlSeconds;
      const now = Date.now();
      const resetTime = now + (effectiveTtl * 1000);
      const allowed = count <= maxRequests;
      const remaining = Math.max(0, maxRequests - count);
      const retryAfter = allowed ? 0 : Math.max(1, effectiveTtl);

      return {
        allowed,
        count,
        remaining,
        resetTime,
        retryAfter,
        source: 'redis'
      };
    })();

    return Promise.race([redisOperation, timeoutPromise]);
  }

  /**
   * Main entry point to evaluate rate limits with graceful degradation and safe failure policy
   *
   * @param {object} params
   * @param {string} params.key - Unique rate limit key (e.g. "rl:auth:ip:1.2.3.4")
   * @param {number} params.maxRequests - Maximum requests allowed in the window
   * @param {number} params.windowMs - Window duration in milliseconds
   * @param {'fail-closed'|'fail-open'} [params.failPolicy='fail-closed'] - Strategy when storage fails
   * @returns {Promise<{ allowed: boolean, count: number, remaining: number, resetTime: number, retryAfter: number, source: string }>}
   */
  async consume({ key, maxRequests, windowMs, failPolicy = 'fail-closed' }) {
    // 1. Try Upstash Redis if configured
    if (this.redisConfigured && this.redisClient) {
      try {
        return await this.checkRedis(key, maxRequests, windowMs);
      } catch (redisErr) {
        console.warn(`⚠️ [RateLimiter] Redis store failure for key ${key}: ${redisErr.message}. Falling back.`);
      }
    }

    // 2. Try MongoDB Atlas distributed TTL store
    try {
      return await this.checkMongo(key, maxRequests, windowMs);
    } catch (mongoErr) {
      console.warn(`⚠️ [RateLimiter] MongoDB store failure for key ${key}: ${mongoErr.message}. Falling back.`);
    }

    // 3. Try In-Memory fallback store
    try {
      return this.checkInMemory(key, maxRequests, windowMs);
    } catch (memErr) {
      console.error(`❌ [RateLimiter] All rate limiter stores failed: ${memErr.message}`);
    }

    // 4. Ultimate storage failure policy
    if (failPolicy === 'fail-closed') {
      return {
        allowed: false,
        count: maxRequests + 1,
        remaining: 0,
        resetTime: Date.now() + 60000,
        retryAfter: 60,
        source: 'failure-policy-closed'
      };
    }

    return {
      allowed: true,
      count: 1,
      remaining: maxRequests - 1,
      resetTime: Date.now() + windowMs,
      retryAfter: 0,
      source: 'failure-policy-open'
    };
  }

  /**
   * Distributed Lock Acquisition (for duplicate checkout and order creation protection)
   *
   * @param {string} lockKey
   * @param {number} [ttlSeconds=30]
   * @returns {Promise<boolean>} True if lock was acquired, false if already held
   */
  async acquireLock(lockKey, ttlSeconds = 30) {
    const fullKey = `lock:${lockKey}`;

    // 1. Upstash Redis SET NX EX
    if (this.redisConfigured && this.redisClient) {
      try {
        const res = await this.redisClient.set(fullKey, 'locked', {
          nx: true,
          ex: ttlSeconds
        });
        return res === 'OK' || res === true;
      } catch (err) {
        console.warn(`⚠️ [RateLimiter] Redis lock failed for ${fullKey}: ${err.message}. Trying Mongo.`);
      }
    }

    // 2. MongoDB unique upsert lock fallback
    try {
      if (mongoose.connection.readyState !== 1) {
        throw new Error('MongoDB connection is not open');
      }
      const now = new Date();
      const expiresAt = new Date(Date.now() + (ttlSeconds * 1000));

      // Attempt to claim lock if expired or absent
      const acquired = await RateLimitModel.findOneAndUpdate(
        { key: fullKey, expiresAt: { $lt: now } },
        { $set: { count: 1, expiresAt } },
        { new: true }
      );

      if (acquired) return true;

      // Try inserting if not present
      const inserted = await RateLimitModel.create({
        key: fullKey,
        count: 1,
        expiresAt
      });
      return Boolean(inserted);
    } catch (err) {
      // Duplicate key (code 11000) means lock is already held!
      if (err.code === 11000) {
        return false;
      }
      // Silently proceed to in-memory fallback if MongoDB connection is not open
    }

    // 3. Memory lock fallback
    const memEntry = this.memoryStore.get(fullKey);
    const now = Date.now();
    if (memEntry && now < memEntry.resetTime) {
      return false; // Already locked
    }
    this.memoryStore.set(fullKey, { count: 1, resetTime: now + (ttlSeconds * 1000) });
    return true;
  }

  /**
   * Distributed Lock Release
   *
   * @param {string} lockKey
   * @returns {Promise<void>}
   */
  async releaseLock(lockKey) {
    const fullKey = `lock:${lockKey}`;

    if (this.redisConfigured && this.redisClient) {
      try {
        await this.redisClient.del(fullKey);
      } catch (_) {}
    }

    if (mongoose.connection.readyState === 1) {
      try {
        await RateLimitModel.deleteOne({ key: fullKey });
      } catch (_) {}
    }

    this.memoryStore.delete(fullKey);
  }
}

const rateLimiterService = new RateLimiterService();
export default rateLimiterService;
