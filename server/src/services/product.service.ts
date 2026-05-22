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
  ): Promise<PaginatedResponse<Product>> {
    const validPage = Math.max(1, Math.floor(page));
    const offset = (validPage - 1) * PRODUCTS_PER_PAGE;

    const cacheKey = `${CACHE_PREFIX.BY_CATEGORY}:${categoryId}:page:${validPage}`;

    // Try cache first
    const cached = await this.getFromCache<PaginatedResponse<Product>>(cacheKey);
    if (cached) {
      return cached;
    }

    // Get total count of available products in category
    const countResult = await this.pool.query(
      'SELECT COUNT(*) as total FROM product WHERE category = $1 AND is_available = true',
      [categoryId],
    );
    const totalItems = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(totalItems / PRODUCTS_PER_PAGE);

    // Get paginated products
    const result = await this.pool.query(
      `SELECT * FROM product 
       WHERE category = $1 AND is_available = true 
       ORDER BY name ASC 
       LIMIT $2 OFFSET $3`,
      [categoryId, PRODUCTS_PER_PAGE, offset],
    );

    const products = result.rows.map(mapRowToProduct);

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
    const cacheKey = `${CACHE_PREFIX.SEARCH}:${normalizedQuery}:page:${validPage}`;

    // Try cache first
    const cached = await this.getFromCache<PaginatedResponse<Product>>(cacheKey);
    if (cached) {
      return cached;
    }

    // Use ILIKE for case-insensitive name matching (leverages pg_trgm GIN index)
    const searchPattern = `%${normalizedQuery}%`;

    // Get total count
    const countResult = await this.pool.query(
      'SELECT COUNT(*) as total FROM product WHERE name ILIKE $1 AND is_available = true',
      [searchPattern],
    );
    const totalItems = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(totalItems / PRODUCTS_PER_PAGE);

    // Get paginated results
    const result = await this.pool.query(
      `SELECT * FROM product 
       WHERE name ILIKE $1 AND is_available = true 
       ORDER BY name ASC 
       LIMIT $2 OFFSET $3`,
      [searchPattern, PRODUCTS_PER_PAGE, offset],
    );

    const products = result.rows.map(mapRowToProduct);

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

