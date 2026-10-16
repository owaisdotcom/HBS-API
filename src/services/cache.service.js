/**
 * High-Performance Server-Side Cache Service
 * 
 * Provides fast in-memory TTL caching with bounded memory consumption to minimize
 * repeated database queries and reduce Vercel serverless CPU active execution time.
 * Automatically invalidated when admin updates products, categories, or homepage settings.
 */

class CacheService {
  constructor() {
    this.cache = new Map();
    this.maxEntries = 1000;
    // Enabled by default unless explicitly disabled via ENABLE_IN_MEMORY_CACHE=false
    this.enabled = process.env.ENABLE_IN_MEMORY_CACHE !== 'false';
  }

  /**
   * Cleans up expired items and enforces maximum size
   */
  prune() {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiresAt) {
        this.cache.delete(key);
      }
    }
    if (this.cache.size > this.maxEntries) {
      const keysToDelete = Array.from(this.cache.keys()).slice(0, Math.floor(this.maxEntries * 0.25));
      for (const k of keysToDelete) {
        this.cache.delete(k);
      }
    }
  }

  /**
   * Retrieve cached value if present and not expired
   * @param {string} key
   * @returns {any|null}
   */
  get(key) {
    if (!this.enabled) return null;

    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  /**
   * Store value in cache with TTL in seconds
   * @param {string} key
   * @param {any} data
   * @param {number} [ttlSeconds=60] - Default 60 seconds
   */
  set(key, data, ttlSeconds = 60) {
    if (!this.enabled) return;
    if (this.cache.size >= this.maxEntries) {
      this.prune();
    }
    const expiresAt = Date.now() + (ttlSeconds * 1000);
    this.cache.set(key, { data, expiresAt });
  }

  /**
   * Delete specific cache key
   * @param {string} key
   */
  del(key) {
    this.cache.delete(key);
  }

  /**
   * Delete keys matching a prefix or regex pattern (e.g. for invalidation on admin updates)
   * @param {string|RegExp} pattern
   */
  delPattern(pattern) {
    const isRegex = pattern instanceof RegExp;
    for (const key of this.cache.keys()) {
      const isMatch = isRegex ? pattern.test(key) : key.startsWith(pattern);
      if (isMatch) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Flush all cache entries
   */
  flushAll() {
    this.cache.clear();
  }
}

const cacheService = new CacheService();
export default cacheService;
