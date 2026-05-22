import { CacheService, CACHE_KEYS } from './cache.service';

/**
 * Unit tests for CacheService.
 * Tests cache-aside pattern, product/review cache invalidation,
 * graceful degradation, fallback TTL, and timeout handling.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

function createMockRedis(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
    exists: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    ...overrides,
  } as any;
}

const PRODUCT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CATEGORY = 'produce';

describe('CacheService', () => {
  let redis: any;
  let service: CacheService;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    redis = createMockRedis();
    service = new CacheService(redis);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('getOrSet', () => {
    it('should return cached value on cache hit', async () => {
      const cachedData = { id: '1', name: 'Test Product' };
      redis.get.mockResolvedValue(JSON.stringify(cachedData));

      const fetchFn = jest.fn();
      const result = await service.getOrSet('test:key', 300, fetchFn);

      expect(result).toEqual(cachedData);
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('should call fetchFn and cache result on cache miss', async () => {
      redis.get.mockResolvedValue(null);
      const freshData = { id: '2', name: 'Fresh Product' };
      const fetchFn = jest.fn().mockResolvedValue(freshData);

      const result = await service.getOrSet('test:key', 300, fetchFn);

      expect(result).toEqual(freshData);
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(redis.set).toHaveBeenCalledWith(
        'test:key',
        JSON.stringify(freshData),
        'EX',
        300,
      );
    });

    it('should fall back to fetchFn when Redis get throws (graceful degradation)', async () => {
      redis.get.mockRejectedValue(new Error('Connection refused'));
      const freshData = { id: '3', name: 'DB Product' };
      const fetchFn = jest.fn().mockResolvedValue(freshData);

      const result = await service.getOrSet('test:key', 300, fetchFn);

      expect(result).toEqual(freshData);
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cache read failed'),
        expect.any(String),
      );
    });

    it('should return fetchFn result even when Redis set fails', async () => {
      redis.get.mockResolvedValue(null);
      redis.set.mockRejectedValue(new Error('Connection refused'));
      const freshData = { id: '4', name: 'Uncached Product' };
      const fetchFn = jest.fn().mockResolvedValue(freshData);

      const result = await service.getOrSet('test:key', 300, fetchFn);

      expect(result).toEqual(freshData);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cache write failed'),
        expect.any(String),
      );
    });

    it('should timeout Redis get after 2 seconds and fall back to fetchFn', async () => {
      // Simulate a Redis operation that never resolves
      redis.get.mockReturnValue(new Promise(() => {}));
      const freshData = { id: '5', name: 'Timeout Product' };
      const fetchFn = jest.fn().mockResolvedValue(freshData);

      const result = await service.getOrSet('test:key', 300, fetchFn);

      expect(result).toEqual(freshData);
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cache read failed'),
        expect.stringContaining('timed out'),
      );
    }, 5000);
  });

  describe('invalidateProductCache', () => {
    it('should delete product detail, category listing, and search result keys', async () => {
      const categoryKeys = [
        `${CACHE_KEYS.CATEGORY_LISTING}:${CATEGORY}:page:1`,
        `${CACHE_KEYS.CATEGORY_LISTING}:${CATEGORY}:page:2`,
      ];
      const searchKeys = [
        `${CACHE_KEYS.SEARCH_RESULTS}:banana:page:1`,
      ];

      redis.keys.mockImplementation((pattern: string) => {
        if (pattern.includes(CATEGORY)) return Promise.resolve(categoryKeys);
        if (pattern.includes('search')) return Promise.resolve(searchKeys);
        return Promise.resolve([]);
      });

      await service.invalidateProductCache(PRODUCT_ID, CATEGORY);

      expect(redis.del).toHaveBeenCalledWith(
        `${CACHE_KEYS.PRODUCT_DETAIL}:${PRODUCT_ID}`,
        ...categoryKeys,
        ...searchKeys,
      );
    });

    it('should invalidate product detail and search keys even without category', async () => {
      const searchKeys = [`${CACHE_KEYS.SEARCH_RESULTS}:test:page:1`];
      redis.keys.mockResolvedValue(searchKeys);

      await service.invalidateProductCache(PRODUCT_ID);

      expect(redis.del).toHaveBeenCalledWith(
        `${CACHE_KEYS.PRODUCT_DETAIL}:${PRODUCT_ID}`,
        ...searchKeys,
      );
    });

    it('should apply fallback TTL when invalidation fails', async () => {
      redis.keys.mockRejectedValue(new Error('Connection refused'));

      await service.invalidateProductCache(PRODUCT_ID, CATEGORY);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Product cache invalidation failed'),
        expect.any(String),
      );
      // Should attempt to apply fallback TTL on the product detail key
      expect(redis.exists).toHaveBeenCalled();
      expect(redis.expire).toHaveBeenCalledWith(
        `${CACHE_KEYS.PRODUCT_DETAIL}:${PRODUCT_ID}`,
        60,
      );
    });

    it('should log when fallback TTL is applied', async () => {
      redis.keys.mockRejectedValue(new Error('Redis error'));
      redis.exists.mockResolvedValue(1);

      await service.invalidateProductCache(PRODUCT_ID, CATEGORY);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Fallback TTL (60s) applied'),
      );
    });

    it('should handle complete Redis failure gracefully (no throw)', async () => {
      redis.keys.mockRejectedValue(new Error('Connection refused'));
      redis.exists.mockRejectedValue(new Error('Connection refused'));
      redis.expire.mockRejectedValue(new Error('Connection refused'));

      // Should not throw
      await expect(
        service.invalidateProductCache(PRODUCT_ID, CATEGORY),
      ).resolves.toBeUndefined();

      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('invalidateReviewSummaryCache', () => {
    it('should delete the review summary cache key', async () => {
      await service.invalidateReviewSummaryCache(PRODUCT_ID);

      expect(redis.del).toHaveBeenCalledWith(
        `${CACHE_KEYS.REVIEW_SUMMARY}:${PRODUCT_ID}`,
      );
    });

    it('should apply fallback TTL when invalidation fails', async () => {
      redis.del.mockRejectedValue(new Error('Connection refused'));
      redis.exists.mockResolvedValue(1);

      await service.invalidateReviewSummaryCache(PRODUCT_ID);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Review summary cache invalidation failed'),
        expect.any(String),
      );
      expect(redis.expire).toHaveBeenCalledWith(
        `${CACHE_KEYS.REVIEW_SUMMARY}:${PRODUCT_ID}`,
        60,
      );
    });

    it('should handle complete Redis failure gracefully (no throw)', async () => {
      redis.del.mockRejectedValue(new Error('Connection refused'));
      redis.exists.mockRejectedValue(new Error('Connection refused'));

      await expect(
        service.invalidateReviewSummaryCache(PRODUCT_ID),
      ).resolves.toBeUndefined();

      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('graceful degradation and logging', () => {
    it('should log all cache fallback occurrences', async () => {
      redis.get.mockRejectedValue(new Error('ECONNREFUSED'));
      redis.set.mockRejectedValue(new Error('ECONNREFUSED'));

      const fetchFn = jest.fn().mockResolvedValue({ data: 'test' });
      await service.getOrSet('key', 300, fetchFn);

      // Should log both the read failure and write failure
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cache read failed'),
        expect.any(String),
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cache write failed'),
        expect.any(String),
      );
    });

    it('should continue operating when Redis is completely unavailable', async () => {
      // All Redis operations fail
      redis.get.mockRejectedValue(new Error('ECONNREFUSED'));
      redis.set.mockRejectedValue(new Error('ECONNREFUSED'));
      redis.del.mockRejectedValue(new Error('ECONNREFUSED'));
      redis.keys.mockRejectedValue(new Error('ECONNREFUSED'));
      redis.exists.mockRejectedValue(new Error('ECONNREFUSED'));

      const fetchFn = jest.fn().mockResolvedValue({ id: '1' });

      // getOrSet should still work
      const result = await service.getOrSet('key', 300, fetchFn);
      expect(result).toEqual({ id: '1' });

      // invalidateProductCache should not throw
      await expect(
        service.invalidateProductCache(PRODUCT_ID, CATEGORY),
      ).resolves.toBeUndefined();

      // invalidateReviewSummaryCache should not throw
      await expect(
        service.invalidateReviewSummaryCache(PRODUCT_ID),
      ).resolves.toBeUndefined();
    });
  });
});
