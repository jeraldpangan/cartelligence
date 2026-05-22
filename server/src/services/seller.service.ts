import { Pool } from 'pg';
import Redis from 'ioredis';
import { getDatabasePool } from '../config/database';
import { getRedisClient } from '../config/redis';
import { ProductCategory } from '@shared/enums';
import { PaginatedResponse } from '@shared/interfaces';
import { ErrorCode } from '@shared/errors';
import { AppError } from '../middleware/errorHandler';
import { UploadService, ProcessedImage } from './upload.service';
import { MAX_IMAGES_PER_PRODUCT } from '../config/upload';
import { CacheService } from './cache.service';
import {
  CreateProductDto,
  UpdateProductDto,
  SellerProduct,
  SellerProductImage,
  validateCreateProductDto,
  validateUpdateProductDto,
} from './seller.dto';

/** Number of products per page for seller listings */
const SELLER_PRODUCTS_PER_PAGE = 20;

/**
 * Seller Product Service
 *
 * Provides CRUD operations for seller product management including
 * image handling, ownership verification, soft-delete, and cache invalidation.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.3, 3.5, 3.6
 */
export class SellerService {
  private pool: Pool;
  private cacheService: CacheService;
  private uploadService: UploadService;

  constructor(pool?: Pool, redis?: Redis, uploadService?: UploadService, cacheService?: CacheService) {
    this.pool = pool || getDatabasePool();
    this.cacheService = cacheService || new CacheService(redis || getRedisClient());
    this.uploadService = uploadService || new UploadService();
  }

  /**
   * Creates a new product with associated images.
   * Uses a database transaction to ensure atomicity of product + image records.
   *
   * Preconditions:
   * - sellerId corresponds to a user with role 'seller'
   * - dto fields pass validation
   * - images contains 0–5 files, each ≤ 5MB, format JPEG/PNG/WebP
   *
   * Postconditions:
   * - A new product record is created with seller_id = sellerId
   * - Product images are stored on disk and product_image records created
   * - The first image has is_primary = true, sort_order starts at 0
   * - Redis product cache is invalidated
   *
   * Requirements: 2.1, 2.6, 2.8, 3.3, 3.5, 3.6
   */
  async createProduct(
    sellerId: string,
    dto: CreateProductDto,
    images: Express.Multer.File[],
  ): Promise<SellerProduct> {
    // Validate DTO fields
    const validationErrors = validateCreateProductDto(dto);
    if (validationErrors.length > 0) {
      throw new AppError(
        400,
        ErrorCode.ValidationError,
        'Product validation failed',
        validationErrors,
      );
    }

    // Validate image count (max 5 for a new product)
    if (images && images.length > MAX_IMAGES_PER_PRODUCT) {
      throw new AppError(
        400,
        ErrorCode.ValidationError,
        `Maximum ${MAX_IMAGES_PER_PRODUCT} images per product. Received: ${images.length}`,
      );
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Step 1: Insert product record
      const productResult = await client.query(
        `INSERT INTO product (seller_id, name, category, unit_price, unit, stock_quantity, description, nutritional_info, is_available)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
         RETURNING *`,
        [
          sellerId,
          dto.name,
          dto.category,
          dto.unitPrice,
          dto.unit,
          dto.stockQuantity,
          dto.description || null,
          dto.nutritionalInfo || null,
        ],
      );
      const productRow = productResult.rows[0];

      // Step 2: Process and store images (if any)
      let processedImages: ProcessedImage[] = [];
      if (images && images.length > 0) {
        processedImages = await this.uploadService.processImages(images);

        // Step 3: Insert image records with contiguous sort_order starting at 0
        for (let i = 0; i < processedImages.length; i++) {
          await client.query(
            `INSERT INTO product_image (product_id, url, filename, sort_order, is_primary)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              productRow.id,
              processedImages[i].url,
              processedImages[i].filename,
              i,
              i === 0, // First image is primary
            ],
          );
        }
      }

      await client.query('COMMIT');

      // Step 4: Invalidate cache using CacheService (Requirements: 8.1, 8.3, 8.4, 8.5)
      await this.cacheService.invalidateProductCache(productRow.id, productRow.category);

      // Fetch the complete product with images
      return this.getSellerProductById(sellerId, productRow.id);
    } catch (error) {
      await client.query('ROLLBACK');
      // Clean up uploaded files on failure
      if (images && images.length > 0) {
        await this.uploadService.cleanupFiles(images);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Returns paginated list of seller's products, excluding soft-deleted ones.
   *
   * Postconditions:
   * - Only returns products where seller_id matches and deleted_at IS NULL
   * - Paginated at 20 products per page
   * - Includes image metadata for each product
   *
   * Requirements: 2.2
   */
  async getSellerProducts(
    sellerId: string,
    page: number = 1,
  ): Promise<PaginatedResponse<SellerProduct>> {
    const validPage = Math.max(1, Math.floor(page));
    const offset = (validPage - 1) * SELLER_PRODUCTS_PER_PAGE;

    // Get total count of non-deleted products for this seller
    const countResult = await this.pool.query(
      'SELECT COUNT(*) as total FROM product WHERE seller_id = $1 AND deleted_at IS NULL',
      [sellerId],
    );
    const totalItems = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(totalItems / SELLER_PRODUCTS_PER_PAGE);

    // Get paginated products with their images
    const productsResult = await this.pool.query(
      `SELECT p.*,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', pi.id,
                    'url', pi.url,
                    'filename', pi.filename,
                    'sort_order', pi.sort_order,
                    'is_primary', pi.is_primary,
                    'created_at', pi.created_at
                  ) ORDER BY pi.sort_order
                ) FILTER (WHERE pi.id IS NOT NULL),
                '[]'::json
              ) as images
       FROM product p
       LEFT JOIN product_image pi ON pi.product_id = p.id
       WHERE p.seller_id = $1 AND p.deleted_at IS NULL
       GROUP BY p.id
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [sellerId, SELLER_PRODUCTS_PER_PAGE, offset],
    );

    const products = productsResult.rows.map((row) => this.mapRowToSellerProduct(row));

    return {
      data: products,
      page: validPage,
      pageSize: SELLER_PRODUCTS_PER_PAGE,
      totalItems,
      totalPages,
    };
  }

  /**
   * Returns a single product by ID, verifying seller ownership.
   *
   * Requirements: 2.3, 2.7
   */
  async getSellerProductById(sellerId: string, productId: string): Promise<SellerProduct> {
    const result = await this.pool.query(
      `SELECT p.*,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', pi.id,
                    'url', pi.url,
                    'filename', pi.filename,
                    'sort_order', pi.sort_order,
                    'is_primary', pi.is_primary,
                    'created_at', pi.created_at
                  ) ORDER BY pi.sort_order
                ) FILTER (WHERE pi.id IS NOT NULL),
                '[]'::json
              ) as images
       FROM product p
       LEFT JOIN product_image pi ON pi.product_id = p.id
       WHERE p.id = $1
       GROUP BY p.id`,
      [productId],
    );

    if (result.rows.length === 0) {
      throw new AppError(404, ErrorCode.NotFound, 'Product not found');
    }

    const row = result.rows[0];

    // Check if soft-deleted
    if (row.deleted_at !== null) {
      throw new AppError(404, ErrorCode.NotFound, 'Product no longer exists');
    }

    // Verify ownership
    if (row.seller_id !== sellerId) {
      throw new AppError(403, ErrorCode.Forbidden, 'You do not own this product');
    }

    return this.mapRowToSellerProduct(row);
  }

  /**
   * Updates an existing product after verifying ownership.
   *
   * Preconditions:
   * - Product exists and is not soft-deleted
   * - Product's seller_id matches the requesting seller
   * - dto fields (if provided) pass validation
   *
   * Postconditions:
   * - Product record is updated with provided fields
   * - Redis cache is invalidated
   *
   * Requirements: 2.3, 2.6, 2.7, 2.8, 2.9
   */
  async updateProduct(
    sellerId: string,
    productId: string,
    dto: UpdateProductDto,
  ): Promise<SellerProduct> {
    // Validate DTO fields
    const validationErrors = validateUpdateProductDto(dto);
    if (validationErrors.length > 0) {
      throw new AppError(
        400,
        ErrorCode.ValidationError,
        'Product validation failed',
        validationErrors,
      );
    }

    // Verify product exists, is not deleted, and is owned by this seller
    const existingResult = await this.pool.query(
      'SELECT * FROM product WHERE id = $1',
      [productId],
    );

    if (existingResult.rows.length === 0) {
      throw new AppError(404, ErrorCode.NotFound, 'Product not found');
    }

    const existing = existingResult.rows[0];

    if (existing.deleted_at !== null) {
      throw new AppError(404, ErrorCode.NotFound, 'Product no longer exists');
    }

    if (existing.seller_id !== sellerId) {
      throw new AppError(403, ErrorCode.Forbidden, 'You do not own this product');
    }

    // Build dynamic UPDATE query with only provided fields
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (dto.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(dto.name);
    }
    if (dto.category !== undefined) {
      updates.push(`category = $${paramIndex++}`);
      values.push(dto.category);
    }
    if (dto.unitPrice !== undefined) {
      updates.push(`unit_price = $${paramIndex++}`);
      values.push(dto.unitPrice);
    }
    if (dto.unit !== undefined) {
      updates.push(`unit = $${paramIndex++}`);
      values.push(dto.unit);
    }
    if (dto.stockQuantity !== undefined) {
      updates.push(`stock_quantity = $${paramIndex++}`);
      values.push(dto.stockQuantity);
    }
    if (dto.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(dto.description);
    }
    if (dto.nutritionalInfo !== undefined) {
      updates.push(`nutritional_info = $${paramIndex++}`);
      values.push(dto.nutritionalInfo);
    }

    if (updates.length === 0) {
      // No fields to update — return existing product
      return this.getSellerProductById(sellerId, productId);
    }

    // Always update the updated_at timestamp
    updates.push(`updated_at = NOW()`);

    values.push(productId);
    const query = `UPDATE product SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;

    await this.pool.query(query, values);

    // Invalidate cache using CacheService (Requirements: 8.1, 8.3, 8.4, 8.5)
    await this.cacheService.invalidateProductCache(productId, existing.category);
    if (dto.category && dto.category !== existing.category) {
      await this.cacheService.invalidateProductCache(productId, dto.category);
    }

    return this.getSellerProductById(sellerId, productId);
  }

  /**
   * Soft-deletes a product by setting deleted_at timestamp.
   *
   * Preconditions:
   * - Product exists and is not already soft-deleted
   * - Product's seller_id matches the requesting seller
   *
   * Postconditions:
   * - Product's deleted_at is set to current timestamp
   * - Product no longer appears in listings or search results
   * - Redis cache is invalidated
   *
   * Requirements: 2.4, 2.7, 2.9
   */
  async deleteProduct(sellerId: string, productId: string): Promise<void> {
    // Verify product exists, is not deleted, and is owned by this seller
    const existingResult = await this.pool.query(
      'SELECT * FROM product WHERE id = $1',
      [productId],
    );

    if (existingResult.rows.length === 0) {
      throw new AppError(404, ErrorCode.NotFound, 'Product not found');
    }

    const existing = existingResult.rows[0];

    if (existing.deleted_at !== null) {
      throw new AppError(404, ErrorCode.NotFound, 'Product no longer exists');
    }

    if (existing.seller_id !== sellerId) {
      throw new AppError(403, ErrorCode.Forbidden, 'You do not own this product');
    }

    // Soft-delete: set deleted_at timestamp
    await this.pool.query(
      'UPDATE product SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1',
      [productId],
    );

    // Invalidate cache using CacheService (Requirements: 8.1, 8.3, 8.4, 8.5)
    await this.cacheService.invalidateProductCache(productId, existing.category);
  }

  /**
   * Toggles a product's is_available flag.
   *
   * Preconditions:
   * - Product exists and is not soft-deleted
   * - Product's seller_id matches the requesting seller
   *
   * Postconditions:
   * - Product's is_available flag is flipped
   *
   * Requirements: 2.5, 2.7
   */
  async toggleAvailability(sellerId: string, productId: string): Promise<SellerProduct> {
    // Verify product exists, is not deleted, and is owned by this seller
    const existingResult = await this.pool.query(
      'SELECT * FROM product WHERE id = $1',
      [productId],
    );

    if (existingResult.rows.length === 0) {
      throw new AppError(404, ErrorCode.NotFound, 'Product not found');
    }

    const existing = existingResult.rows[0];

    if (existing.deleted_at !== null) {
      throw new AppError(404, ErrorCode.NotFound, 'Product no longer exists');
    }

    if (existing.seller_id !== sellerId) {
      throw new AppError(403, ErrorCode.Forbidden, 'You do not own this product');
    }

    // Flip the is_available flag
    await this.pool.query(
      'UPDATE product SET is_available = NOT is_available, updated_at = NOW() WHERE id = $1',
      [productId],
    );

    // Invalidate cache using CacheService (Requirements: 8.1, 8.3, 8.4, 8.5)
    await this.cacheService.invalidateProductCache(productId, existing.category);

    return this.getSellerProductById(sellerId, productId);
  }

  /**
   * Maps a database row (with joined images JSON) to a SellerProduct interface.
   */
  private mapRowToSellerProduct(row: Record<string, unknown>): SellerProduct {
    const images = (row.images as Array<Record<string, unknown>>) || [];

    return {
      id: row.id as string,
      sellerId: row.seller_id as string,
      name: row.name as string,
      category: row.category as ProductCategory,
      unitPrice: parseFloat(row.unit_price as string),
      unit: row.unit as string,
      stockQuantity: row.stock_quantity as number,
      description: (row.description as string) || '',
      nutritionalInfo: (row.nutritional_info as string) || '',
      isAvailable: row.is_available as boolean,
      deletedAt: row.deleted_at ? (row.deleted_at as Date).toISOString() : null,
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
      images: images.map((img) => ({
        id: img.id as string,
        url: img.url as string,
        filename: img.filename as string,
        sortOrder: img.sort_order as number,
        isPrimary: img.is_primary as boolean,
        createdAt: img.created_at as string,
      })),
    };
  }
}
