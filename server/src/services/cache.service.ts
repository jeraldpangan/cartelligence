import Redis from 'ioredis';
import { getRedisClient } from '../config/redis';

/** Default cache TTL in seconds (5 minutes) */
const DEFAULT_CACHE_TTL_SECONDS = 300;

/** Fallback TTL applied when invalidation fails after a successful DB write (60 seconds max) */
const FALLBACK_TTL_SECONDS = 60;

/** Connection timeout for Redis operations in milliseconds */
const REDIS_OPERATION_TIMEOUT_MS = 2000;

/** Cache key prefixes used across the application */
export const CACHE_KEYS = {
  PRODUCT_DETAIL: 'products:detail',
  CATEGORY_LISTING: 'products:category',
  SEARCH_RESULTS: 'products:search',
  REVIEW_SUMMARY: 'review:summary',
};

/**
 * CacheService provides a reusable Redis caching layer with:
 * - Cache-aside pattern (getOrSet)
 * - Product cache invalidation for mutations (create/update/delete)
 * - Review summary cache invalidation for review mutations (create/delete)
 * - Graceful degradation when Redis is unavailable
 * - Fallback TTL on cache entries when invalidation fails after successful DB write
 * - Logging of all cache fallback occurrences
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */
export class CacheService {
  private redis: Redis;

  constructor(redis?: Redis) {
    this.redis = redis || getRedisClient();
  }

  /**
   * Cache-aside pattern: attempts to get a value from cache, and if not found,
   * calls the fetchFn to retrieve from DB, then caches the result.
   *
   * Graceful degradation: if Redis is unavailable (connection refused, timeout > 2s,
   * or errors), logs the error and falls through to fetchFn without returning an error.
   *
   * @param key - The cache key
   * @param ttl - Time-to-live in seconds for the cached entry
   * @param fetchFn - Function to call when cache misses (fetches from DB)
   * @returns The cached or freshly fetched value
   *
   * Requirements: 8.4, 8.5
   */
  async getOrSet<T>(key: string, ttl: number, fetchFn: () => Promise<T>): Promise<T> {
    // Try to get from cache
    try {
      const cached = await this.withTimeout(this.redis.get(key));
      if (cached !== null) {
        return JSON.parse(cached) as T;
      }
    } catch (error) {
      // Redis unavailable — log and continue with DB-direct query
      console.error(
        `[CacheService] Cache read failed for key "${key}", falling back to DB:`,
        (error as Error).message,
      );
    }

    // Cache miss or Redis unavailable — fetch from DB
    const value = await fetchFn();

    // Try to set in cache
    try {
      await this.withTimeout(
        this.redis.set(key, JSON.stringify(value), 'EX', ttl),
      );
    } catch (error) {
      // Redis unavailable — log and continue without caching
      console.error(
        `[CacheService] Cache write failed for key "${key}":`,
        (error as Error).message,
      );
    }

    return value;
  }

  /**
   * Invalidates Redis cache entries related to product mutations (create/update/delete).
   * Deletes keys matching:
   * - Product detail: `products:detail:{productId}`
   * - Category listing: `products:category:{category}:*`
   * - Search results: `products:search:*`
   *
   * If invalidation fails after a successful DB write, applies a fallback TTL (≤ 60s)
   * on affected keys so stale data self-expires.
   *
   * @param productId - The product ID whose detail cache should be invalidated
   * @param category - The product category whose listing cache should be invalidated
   *
   * Requirements: 8.1, 8.3, 8.5
   */
  async invalidateProductCache(productId: string, category?: string): Promise<void> {
    const keysToDelete: string[] = [];

    try {
      // 1. Product detail key
      keysToDelete.push(`${CACHE_KEYS.PRODUCT_DETAIL}:${productId}`);

      // 2. Category listing keys
      if (category) {
        const categoryKeys = await this.withTimeout(
          this.redis.keys(`${CACHE_KEYS.CATEGORY_LISTING}:${category}:*`),
        );
        keysToDelete.push(...categoryKeys);
      }

      // 3. Search result keys
      const searchKeys = await this.withTimeout(
        this.redis.keys(`${CACHE_KEYS.SEARCH_RESULTS}:*`),
      );
      keysToDelete.push(...searchKeys);

      // Delete all collected keys
      if (keysToDelete.length > 0) {
        await this.withTimeout(this.redis.del(...keysToDelete));
      }
    } catch (error) {
      // Invalidation failed after successful DB write — apply fallback TTL
      console.error(
        `[CacheService] Product cache invalidation failed for product "${productId}", applying fallback TTL:`,
        (error as Error).message,
      );
      await this.applyFallbackTtl(keysToDelete);
    }
  }

  /**
   * Invalidates the Redis cache entry for a product's review summary.
   * Deletes the key: `review:summary:{productId}`
   *
   * If invalidation fails after a successful DB write, applies a fallback TTL (≤ 60s)
   * on the affected key so stale data self-expires.
   *
   * @param productId - The product ID whose review summary cache should be invalidated
   *
   * Requirements: 8.2, 8.3, 8.5
   */
  async invalidateReviewSummaryCache(productId: string): Promise<void> {
    const key = `${CACHE_KEYS.REVIEW_SUMMARY}:${productId}`;

    try {
      await this.withTimeout(this.redis.del(key));
    } catch (error) {
      // Invalidation failed after successful DB write — apply fallback TTL
      console.error(
        `[CacheService] Review summary cache invalidation failed for product "${productId}", applying fallback TTL:`,
        (error as Error).message,
      );
      await this.applyFallbackTtl([key]);
    }
  }

  /**
   * Applies a fallback TTL (≤ 60 seconds) on the specified cache keys.
   * This ensures stale data self-expires even when explicit invalidation fails.
   * Logs each fallback occurrence.
   *
   * @param keys - Array of cache keys to apply fallback TTL on
   *
   * Requirements: 8.3, 8.5
   */
  private async applyFallbackTtl(keys: string[]): Promise<void> {
    for (const key of keys) {
      try {
        // Check if the key exists before applying TTL
        const exists = await this.redis.exists(key);
        if (exists) {
          await this.redis.expire(key, FALLBACK_TTL_SECONDS);
          console.error(
            `[CacheService] Fallback TTL (${FALLBACK_TTL_SECONDS}s) applied to key "${key}"`,
          );
        }
      } catch (innerError) {
        // Redis completely unavailable — log and continue
        console.error(
          `[CacheService] Failed to apply fallback TTL to key "${key}":`,
          (innerError as Error).message,
        );
      }
    }
  }

  /**
   * Wraps a Redis operation with a timeout to enforce the 2-second connection timeout.
   * If the operation takes longer than 2 seconds, it rejects with a timeout error.
   *
   * @param operation - The Redis operation promise
   * @returns The result of the operation
   *
   * Requirements: 8.4
   */
  private withTimeout<T>(operation: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Redis operation timed out (exceeded 2s)'));
      }, REDIS_OPERATION_TIMEOUT_MS);

      operation
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }
}
