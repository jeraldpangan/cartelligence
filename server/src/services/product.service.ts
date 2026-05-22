import { Pool } from 'pg';
import Redis from 'ioredis';
import { getDatabasePool } from '../config/database';
import { getRedisClient, withTimeout } from '../config/redis';
import { ProductCategory } from '@shared/enums';
import { Product, PaginatedResponse } from '@shared/interfaces';
import {
  PRODUCTS_PER_PAGE,
  SEARCH_QUERY_MIN_LENGTH,
  SEARCH_QUERY_MAX_LENGTH,
} from '@shared/validation';

/** Redis cache TTL in seconds (5 minutes) */
const CACHE_TTL_SECONDS = 300;

/** Cache key prefixes */
const CACHE_PREFIX = {
  CATEGORIES: 'products:categories',
  BY_CATEGORY: 'products:category',
  SEARCH: 'products:search',
  PRODUCT: 'products:detail',
};

/**
 * Category descriptor returned by getCategories().
 */
export interface CategoryInfo {
  id: ProductCategory;
  name: string;
}

/**
 * Maps ProductCategory enum values to human-readable display names.
 */
const CATEGORY_DISPLAY_NAMES: Record<ProductCategory, string> = {
  [ProductCategory.Produce]: 'Produce',
  [ProductCategory.Dairy]: 'Dairy',
  [ProductCategory.Meat]: 'Meat',
  [ProductCategory.Beverages]: 'Beverages',
  [ProductCategory.Snacks]: 'Snacks',
  [ProductCategory.Household]: 'Household',
  [ProductCategory.PersonalCare]: 'Personal Care',
  [ProductCategory.BabiesToys]: 'Babies & Toys',
};

/**
 * Maps a database row to a Product interface.
 */
function mapRowToProduct(row: Record<string, unknown>): Product {
  return {
    id: row.id as string,
    name: row.name as string,
    category: row.category as ProductCategory,
    unitPrice: parseFloat(row.unit_price as string),
    unit: row.unit as string,
    stockQuantity: row.stock_quantity as number,
    description: (row.description as string) || '',
    nutritionalInfo: (row.nutritional_info as string) || '',
    isAvailable: row.is_available as boolean,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

/**
 * Product Catalog Service
 *
 * Provides methods for browsing grocery categories, searching products,
 * and retrieving product details. Uses Redis caching for sub-200ms response times.
 */
export class ProductService {
  private pool: Pool;
  private redis: Redis;

  constructor(pool?: Pool, redis?: Redis) {
    this.pool = pool || getDatabasePool();
    this.redis = redis || getRedisClient();
  }

  /**
   * Returns all 7 grocery categories.
   */
  async getCategories(): Promise<CategoryInfo[]> {
    // Try cache first
    const cached = await this.getFromCache<CategoryInfo[]>(
      CACHE_PREFIX.CATEGORIES,
    );
    if (cached) {
      return cached;
    }

    const categories: CategoryInfo[] = Object.values(ProductCategory).map(
      (value) => ({
        id: value,
        name: CATEGORY_DISPLAY_NAMES[value],
      }),
    );

    // Cache the result
    await this.setCache(CACHE_PREFIX.CATEGORIES, categories);

    return categories;
  }

  /**
   * Returns paginated products for a given category.
   * Only returns available products (is_available = true).
   *
   * @param categoryId - The ProductCategory enum value
   * @param page - Page number (1-based)
   */
  async getProductsByCategory(
    categoryId: ProductCategory,
    page: number = 1,
    userId?: string,
  ): Promise<PaginatedResponse<Product>> {
    const validPage = Math.max(1, Math.floor(page));
    const offset = (validPage - 1) * PRODUCTS_PER_PAGE;

    const cacheKey = `${CACHE_PREFIX.BY_CATEGORY}:${categoryId}:page:${validPage}:user:${userId || 'guest'}`;

    // Try cache first
    const cached = await this.getFromCache<PaginatedResponse<Product>>(cacheKey);
    if (cached) {
      return cached;
    }

    let products: Product[] = [];
    let totalItems = 0;

    if (userId) {
      // 1. Fetch user survey
      const surveyResult = await this.pool.query(
        `SELECT budget::float as budget, preferred_categories::text[] as "preferredCategories", browsing_history as "browsingHistory"
         FROM user_survey
         WHERE user_id = $1`,
        [userId]
      );
      const survey = surveyResult.rows[0];
      const budget = survey?.budget ?? 500.0;
      const preferredCategories = survey?.preferredCategories ?? [];
      const browsingHistory = survey?.browsingHistory ?? [];
      const historySet = new Set<string>(browsingHistory);

      // 2. Fetch all matching products with seller reliability and avg reviews
      const result = await this.pool.query(
        `SELECT p.*, 
                COALESCE(up.seller_reliability, 4.5) as seller_reliability,
                COALESCE(avg_rev.avg_rating, 4.0) as avg_rating,
                COALESCE(ph.purchase_count, 0) as user_purchases
         FROM product p
         LEFT JOIN user_profile up ON p.seller_id = up.id
         LEFT JOIN (
           SELECT product_id, AVG(rating) as avg_rating 
           FROM product_review 
           WHERE is_fake = false
           GROUP BY product_id
         ) avg_rev ON p.id = avg_rev.product_id
         LEFT JOIN purchase_history ph ON p.id = ph.product_id AND ph.user_id = $2
         WHERE p.category = $1 AND p.is_available = true AND p.deleted_at IS NULL`,
        [categoryId, userId],
      );

      totalItems = result.rows.length;

      // 3. Score and sort products
      const scored = result.rows.map((row) => {
        const product = mapRowToProduct(row);
        const unitPrice = product.unitPrice;

        // Budget Score
        let budgetScore = 0;
        if (unitPrice <= budget) {
          budgetScore = 1.0 - 0.2 * (unitPrice / budget);
        } else {
          budgetScore = Math.exp(-4.0 * ((unitPrice - budget) / budget));
        }

        // Preference Score
        const isPreferredCategory = preferredCategories.includes(product.category);
        const preferenceScore = isPreferredCategory ? 1.0 : 0.0;

        // Browsing History Score
        const isRecentlyViewed = historySet.has(product.id);
        const browsingScore = isRecentlyViewed ? 1.0 : (isPreferredCategory ? 0.4 : 0.0);

        // Seller Reliability Score
        const sellerReliability = parseFloat(row.seller_reliability);
        const sellerScore = (sellerReliability - 1.0) / 4.0;

        // Review Quality Score
        const avgRating = parseFloat(row.avg_rating);
        const reviewScore = avgRating / 5.0;

        // Collaborative Popularity
        const userPurchases = parseInt(row.user_purchases, 10);
        const popularityScore = userPurchases > 0 ? Math.min(1.0, userPurchases / 5.0) : 0.0;

        // Final score
        const finalScore = 
          0.25 * budgetScore + 
          0.25 * preferenceScore + 
          0.15 * browsingScore + 
          0.15 * sellerScore + 
          0.10 * reviewScore +
          0.10 * popularityScore;

        return { product, score: finalScore };
      });

      scored.sort((a, b) => b.score - a.score);
      products = scored.slice(offset, offset + PRODUCTS_PER_PAGE).map(item => item.product);
    } else {
      // Guest path: standard non-personalized flow
      const countResult = await this.pool.query(
        'SELECT COUNT(*) as total FROM product WHERE category = $1 AND is_available = true',
        [categoryId],
      );
      totalItems = parseInt(countResult.rows[0].total, 10);

      const result = await this.pool.query(
        `SELECT * FROM product 
         WHERE category = $1 AND is_available = true 
         ORDER BY name ASC 
         LIMIT $2 OFFSET $3`,
         [categoryId, PRODUCTS_PER_PAGE, offset],
      );
      products = result.rows.map(mapRowToProduct);
    }

    const totalPages = Math.ceil(totalItems / PRODUCTS_PER_PAGE);

    const response: PaginatedResponse<Product> = {
      data: products,
      page: validPage,
      pageSize: PRODUCTS_PER_PAGE,
      totalItems,
      totalPages,
    };

    // Cache the result
    await this.setCache(cacheKey, response);

    return response;
  }

  /**
   * Searches products by name using case-insensitive matching.
   * Uses pg_trgm GIN index for efficient text search.
   *
   * @param query - Search text (2–100 characters)
   * @param page - Page number (1-based)
   */
  async searchProducts(
    query: string,
    page: number = 1,
    userId?: string,
  ): Promise<PaginatedResponse<Product>> {
    // Validate query length
    if (
      !query ||
      query.length < SEARCH_QUERY_MIN_LENGTH ||
      query.length > SEARCH_QUERY_MAX_LENGTH
    ) {
      return {
        data: [],
        page: 1,
        pageSize: PRODUCTS_PER_PAGE,
        totalItems: 0,
        totalPages: 0,
      };
    }

    const validPage = Math.max(1, Math.floor(page));
    const offset = (validPage - 1) * PRODUCTS_PER_PAGE;

    // Normalize query for cache key
    const normalizedQuery = query.trim().toLowerCase();
    const cacheKey = `${CACHE_PREFIX.SEARCH}:${normalizedQuery}:page:${validPage}:user:${userId || 'guest'}`;

    // Try cache first
    const cached = await this.getFromCache<PaginatedResponse<Product>>(cacheKey);
    if (cached) {
      return cached;
    }

    const searchPattern = `%${normalizedQuery}%`;
    let products: Product[] = [];
    let totalItems = 0;

    if (userId) {
      // 1. Fetch user survey
      const surveyResult = await this.pool.query(
        `SELECT budget::float as budget, preferred_categories::text[] as "preferredCategories", browsing_history as "browsingHistory"
         FROM user_survey
         WHERE user_id = $1`,
        [userId]
      );
      const survey = surveyResult.rows[0];
      const budget = survey?.budget ?? 500.0;
      const preferredCategories = survey?.preferredCategories ?? [];
      const browsingHistory = survey?.browsingHistory ?? [];
      const historySet = new Set<string>(browsingHistory);

      // 2. Fetch all matching products with seller reliability and avg reviews
      const result = await this.pool.query(
        `SELECT p.*, 
                COALESCE(up.seller_reliability, 4.5) as seller_reliability,
                COALESCE(avg_rev.avg_rating, 4.0) as avg_rating,
                COALESCE(ph.purchase_count, 0) as user_purchases
         FROM product p
         LEFT JOIN user_profile up ON p.seller_id = up.id
         LEFT JOIN (
           SELECT product_id, AVG(rating) as avg_rating 
           FROM product_review 
           WHERE is_fake = false
           GROUP BY product_id
         ) avg_rev ON p.id = avg_rev.product_id
         LEFT JOIN purchase_history ph ON p.id = ph.product_id AND ph.user_id = $2
         WHERE p.name ILIKE $1 AND p.is_available = true AND p.deleted_at IS NULL`,
        [searchPattern, userId],
      );

      totalItems = result.rows.length;

      // 3. Score and sort products
      const scored = result.rows.map((row) => {
        const product = mapRowToProduct(row);
        const unitPrice = product.unitPrice;

        // Budget Score
        let budgetScore = 0;
        if (unitPrice <= budget) {
          budgetScore = 1.0 - 0.2 * (unitPrice / budget);
        } else {
          budgetScore = Math.exp(-4.0 * ((unitPrice - budget) / budget));
        }

        // Preference Score
        const isPreferredCategory = preferredCategories.includes(product.category);
        const preferenceScore = isPreferredCategory ? 1.0 : 0.0;

        // Browsing History Score
        const isRecentlyViewed = historySet.has(product.id);
        const browsingScore = isRecentlyViewed ? 1.0 : (isPreferredCategory ? 0.4 : 0.0);

        // Seller Reliability Score
        const sellerReliability = parseFloat(row.seller_reliability);
        const sellerScore = (sellerReliability - 1.0) / 4.0;

        // Review Quality Score
        const avgRating = parseFloat(row.avg_rating);
        const reviewScore = avgRating / 5.0;

        // Collaborative Popularity
        const userPurchases = parseInt(row.user_purchases, 10);
        const popularityScore = userPurchases > 0 ? Math.min(1.0, userPurchases / 5.0) : 0.0;

        // Final score
        const finalScore = 
          0.25 * budgetScore + 
          0.25 * preferenceScore + 
          0.15 * browsingScore + 
          0.15 * sellerScore + 
          0.10 * reviewScore +
          0.10 * popularityScore;

        return { product, score: finalScore };
      });

      scored.sort((a, b) => b.score - a.score);
      products = scored.slice(offset, offset + PRODUCTS_PER_PAGE).map(item => item.product);
    } else {
      // Guest path
      const countResult = await this.pool.query(
        'SELECT COUNT(*) as total FROM product WHERE name ILIKE $1 AND is_available = true',
        [searchPattern],
      );
      totalItems = parseInt(countResult.rows[0].total, 10);

      const result = await this.pool.query(
        `SELECT * FROM product 
         WHERE name ILIKE $1 AND is_available = true 
         ORDER BY name ASC 
         LIMIT $2 OFFSET $3`,
        [searchPattern, PRODUCTS_PER_PAGE, offset],
      );
      products = result.rows.map(mapRowToProduct);
    }

    const totalPages = Math.ceil(totalItems / PRODUCTS_PER_PAGE);

    const response: PaginatedResponse<Product> = {
      data: products,
      page: validPage,
      pageSize: PRODUCTS_PER_PAGE,
      totalItems,
      totalPages,
    };

    // Cache the result
    await this.setCache(cacheKey, response);

    return response;
  }

  /**
   * Returns a single product by ID.
   *
   * @param id - Product UUID
   * @returns Product or null if not found
   */
  async getProductById(id: string): Promise<Product | null> {
    const cacheKey = `${CACHE_PREFIX.PRODUCT}:${id}`;

    // Try cache first
    const cached = await this.getFromCache<Product>(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await this.pool.query(
      'SELECT * FROM product WHERE id = $1',
      [id],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const product = mapRowToProduct(result.rows[0]);

    // Cache the result
    await this.setCache(cacheKey, product);

    return product;
  }

  /**
   * Retrieves a value from Redis cache.
   * Returns null if cache miss or Redis is unavailable.
   */
  private async getFromCache<T>(key: string): Promise<T | null> {
    try {
      const cached = await withTimeout(this.redis.get(key));
      if (cached) {
        return JSON.parse(cached) as T;
      }
    } catch (error) {
      console.warn(`[ProductService] Cache read failed for key ${key}, falling back to DB: ${(error as Error).message}`);
    }
    return null;
  }

  /**
   * Stores a value in Redis cache with TTL.
   * Silently fails if Redis is unavailable.
   */
  private async setCache(key: string, value: unknown): Promise<void> {
    try {
      await withTimeout(this.redis.set(key, JSON.stringify(value), 'EX', CACHE_TTL_SECONDS));
    } catch (error) {
      console.warn(`[ProductService] Cache write failed for key ${key}: ${(error as Error).message}`);
    }
  }
}

