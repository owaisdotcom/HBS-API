/**
 * In-Memory TTL Cache Service
 * 
 * Disabled by default (unless ENABLE_IN_MEMORY_CACHE=true) so that all storefront GET requests
 * query the database directly and immediately reflect admin updates with fresh 200 OK responses.
 */

class CacheService {
  constructor() {
    this.cache = new Map();
    this.enabled = process.env.ENABLE_IN_MEMORY_CACHE === 'true';
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
   * @param {number} ttlSeconds - Default 60 seconds
   */
  set(key, data, ttlSeconds = 60) {
    if (!this.enabled) return;
    const expiresAt = Date.now() + ttlSeconds * 1000;
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
   * Delete keys matching a prefix or regex pattern (e.g. for invalidation)
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
