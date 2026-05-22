import { Pool } from 'pg';
import Redis from 'ioredis';
import { getDatabasePool } from '../config/database';
import { getRedisClient } from '../config/redis';
import { PaginatedResponse } from '@shared/interfaces';
import { ErrorCode } from '@shared/errors';
import { AppError } from '../middleware/errorHandler';
import { CacheService, CACHE_KEYS } from './cache.service';
import {
  CreateReviewDto,
  ProductReview,
  ProductReviewWithReviewer,
  ReviewSummary,
  validateCreateReviewDto,
  REVIEWS_PER_PAGE,
} from './review.dto';
import { FakeReviewDetector } from './fake-review-detector.service';
import { ReviewSummarizer } from './review-summarizer.service';
import { SellerPerformanceService } from './seller-performance.service';

/** Default TTL for review summary cache in seconds (1 hour) */
const REVIEW_SUMMARY_CACHE_TTL = 3600;

/**
 * Review Service
 *
 * Provides operations for buyer product reviews including creation,
 * retrieval (paginated), summary aggregation with caching, and deletion.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */
export class ReviewService {
  private pool: Pool;
  private cacheService: CacheService;
  private sellerPerformanceService: SellerPerformanceService;

  constructor(
    pool?: Pool,
    redis?: Redis,
    cacheService?: CacheService,
    sellerPerformanceService?: SellerPerformanceService,
  ) {
    this.pool = pool || getDatabasePool();
    this.cacheService = cacheService || new CacheService(redis || getRedisClient());
    this.sellerPerformanceService =
      sellerPerformanceService || new SellerPerformanceService(this.pool);
  }

  /**
   * Creates a new product review after verifying purchase and uniqueness.
   *
   * Preconditions:
   * - userId corresponds to an authenticated buyer
   * - dto.productId references an existing product
   * - dto.rating is an integer 1–5
   * - dto.comment is 10–500 characters (after trimming)
   *
   * Postconditions:
   * - A new product_review record is created
   * - Product review summary cache is invalidated
   * - Returns the created review
   * - If product doesn't exist: throws AppError(404)
   * - If no purchase: throws AppError(403)
   * - If duplicate: throws AppError(409)
   *
   * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7
   */
  async createReview(userId: string, dto: CreateReviewDto): Promise<ProductReview> {
    // Validate DTO fields
    const validationErrors = validateCreateReviewDto(dto);
    if (validationErrors.length > 0) {
      throw new AppError(
        400,
        ErrorCode.ValidationError,
        'Review validation failed',
        validationErrors,
      );
    }

    // Trim the comment
    const trimmedComment = dto.comment.trim();

    // Step 1: Verify product exists
    const productCheck = await this.pool.query(
      'SELECT id FROM product WHERE id = $1',
      [dto.productId],
    );

    if (productCheck.rows.length === 0) {
      throw new AppError(404, ErrorCode.NotFound, 'Product not found');
    }

    // Step 2: Verify the buyer has purchased this product (delivered order)
    const purchaseCheck = await this.pool.query(
      `SELECT 1 FROM "order" o
       JOIN order_item oi ON oi.order_id = o.id
       WHERE o.user_id = $1 AND oi.product_id = $2 AND o.status = 'delivered'
       LIMIT 1`,
      [userId, dto.productId],
    );

    if (purchaseCheck.rows.length === 0) {
      throw new AppError(
        403,
        ErrorCode.Forbidden,
        'You can only review products you have purchased and received',
      );
    }

    // Step 3: Check for existing review (enforced by DB constraint too)
    const existingReview = await this.pool.query(
      'SELECT id FROM product_review WHERE product_id = $1 AND user_id = $2',
      [dto.productId, userId],
    );

    if (existingReview.rows.length > 0) {
      throw new AppError(
        409,
        ErrorCode.Conflict,
        'You have already reviewed this product',
      );
    }

    // Step 4: Run Fake Review Detection using Random Forest Classifier
    const detection = await FakeReviewDetector.evaluateReview(
      this.pool,
      userId,
      dto.productId,
      trimmedComment,
      dto.rating,
      false // default image_verified to false upon submission
    );

    // Step 5: Insert review with ML flags
    const result = await this.pool.query(
      `INSERT INTO product_review (product_id, user_id, rating, comment, is_fake, fake_probability)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [dto.productId, userId, dto.rating, trimmedComment, detection.isFake, detection.probability],
    );

    // Step 6: Invalidate review summary cache using CacheService (Requirements: 8.2, 8.3, 8.4, 8.5)
    await this.cacheService.invalidateReviewSummaryCache(dto.productId);

    // Reactively trigger seller reliability recalculation (fire-and-forget)
    this.pool
      .query('SELECT seller_id FROM product WHERE id = $1', [dto.productId])
      .then((res) => {
        const sellerId = res.rows[0]?.seller_id;
        if (sellerId) {
          this.sellerPerformanceService.recalculateSellerReliability(sellerId);
        }
      })
      .catch((err) => {
        console.error('[ReviewService] Failed to trigger seller reliability recalculation:', err);
      });

    return this.mapRowToReview(result.rows[0]);
  }

  /**
   * Returns paginated reviews for a product, sorted by created_at DESC.
   * Each review includes the reviewer's full name.
   *
   * Postconditions:
   * - Returns paginated list of 10 reviews per page
   * - Sorted by created_at descending (newest first)
   * - Includes reviewer name from user_profile
   *
   * Requirements: 6.5
   */
  async getProductReviews(
    productId: string,
    page: number = 1,
  ): Promise<PaginatedResponse<ProductReviewWithReviewer>> {
    const validPage = Math.max(1, Math.floor(page));
    const offset = (validPage - 1) * REVIEWS_PER_PAGE;

    // Verify product exists
    const productCheck = await this.pool.query(
      'SELECT id FROM product WHERE id = $1',
      [productId],
    );

    if (productCheck.rows.length === 0) {
      throw new AppError(404, ErrorCode.NotFound, 'Product not found');
    }

    // Get total count of reviews for this product
    const countResult = await this.pool.query(
      'SELECT COUNT(*) as total FROM product_review WHERE product_id = $1',
      [productId],
    );
    const totalItems = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(totalItems / REVIEWS_PER_PAGE);

    // Get paginated reviews with reviewer name
    const reviewsResult = await this.pool.query(
      `SELECT pr.*, up.full_name as reviewer_name
       FROM product_review pr
       JOIN user_profile up ON up.id = pr.user_id
       WHERE pr.product_id = $1
       ORDER BY pr.created_at DESC
       LIMIT $2 OFFSET $3`,
      [productId, REVIEWS_PER_PAGE, offset],
    );

    const reviews = reviewsResult.rows.map((row) => this.mapRowToReviewWithReviewer(row));

    return {
      data: reviews,
      page: validPage,
      pageSize: REVIEWS_PER_PAGE,
      totalItems,
      totalPages,
    };
  }

  /**
   * Returns the review summary for a product with Redis caching.
   *
   * Postconditions:
   * - Returns { averageRating, totalReviews, ratingDistribution }
   * - averageRating is rounded to 1 decimal place (round-half-up)
   * - If no reviews: returns { averageRating: 0, totalReviews: 0, ratingDistribution: {1:0,...,5:0} }
   * - Result is cached in Redis with key `review:summary:{productId}`
   *
   * Requirements: 6.1, 6.2, 6.3, 6.4
   */
  async getProductReviewSummary(productId: string): Promise<ReviewSummary> {
    // Verify product exists
    const productCheck = await this.pool.query(
      'SELECT id FROM product WHERE id = $1',
      [productId],
    );

    if (productCheck.rows.length === 0) {
      throw new AppError(404, ErrorCode.NotFound, 'Product not found');
    }

    const cacheKey = `${CACHE_KEYS.REVIEW_SUMMARY}:${productId}`;

    // Use CacheService.getOrSet for graceful degradation (Requirements: 8.4, 8.5)
    return this.cacheService.getOrSet<ReviewSummary>(
      cacheKey,
      REVIEW_SUMMARY_CACHE_TTL,
      async () => {
        const result = await this.pool.query(
          `SELECT
             COUNT(*) as total_reviews,
             COALESCE(AVG(rating), 0) as avg_rating,
             COUNT(*) FILTER (WHERE rating = 1) as rating_1,
             COUNT(*) FILTER (WHERE rating = 2) as rating_2,
             COUNT(*) FILTER (WHERE rating = 3) as rating_3,
             COUNT(*) FILTER (WHERE rating = 4) as rating_4,
             COUNT(*) FILTER (WHERE rating = 5) as rating_5
           FROM product_review
           WHERE product_id = $1`,
          [productId],
        );

        const row = result.rows[0];
        const totalReviews = parseInt(row.total_reviews, 10);
        const avgRating = parseFloat(row.avg_rating);

        // Round to 1 decimal place using round-half-up
        const averageRating = totalReviews === 0 ? 0 : roundHalfUp(avgRating, 1);

        // Fetch comments of non-fake reviews to build NLP summary
        const commentsResult = await this.pool.query(
          `SELECT comment FROM product_review 
           WHERE product_id = $1 AND is_fake = false 
           ORDER BY created_at DESC 
           LIMIT 30`,
          [productId]
        );
        const comments = commentsResult.rows.map((r) => r.comment as string);
        const nlpSummary = await ReviewSummarizer.summarize(comments);

        return {
          averageRating,
          totalReviews,
          ratingDistribution: {
            1: parseInt(row.rating_1, 10),
            2: parseInt(row.rating_2, 10),
            3: parseInt(row.rating_3, 10),
            4: parseInt(row.rating_4, 10),
            5: parseInt(row.rating_5, 10),
          },
          nlpSummary
        };
      },
    );
  }

  /**
   * Deletes a review after verifying ownership.
   *
   * Preconditions:
   * - userId corresponds to the review's author
   * - reviewId references an existing review
   *
   * Postconditions:
   * - The review record is deleted
   * - Product review summary cache is invalidated
   * - If review not found: throws AppError(404)
   * - If not owner: throws AppError(403)
   *
   * Requirements: 8.2
   */
  async deleteReview(userId: string, reviewId: string): Promise<void> {
    // Fetch the review to verify ownership
    const reviewResult = await this.pool.query(
      'SELECT * FROM product_review WHERE id = $1',
      [reviewId],
    );

    if (reviewResult.rows.length === 0) {
      throw new AppError(404, ErrorCode.NotFound, 'Review not found');
    }

    const review = reviewResult.rows[0];

    // Verify ownership
    if (review.user_id !== userId) {
      throw new AppError(403, ErrorCode.Forbidden, 'You can only delete your own reviews');
    }

    // Delete the review
    await this.pool.query('DELETE FROM product_review WHERE id = $1', [reviewId]);

    // Invalidate review summary cache using CacheService (Requirements: 8.2, 8.3, 8.4, 8.5)
    await this.cacheService.invalidateReviewSummaryCache(review.product_id);

    // Reactively trigger seller reliability recalculation (fire-and-forget)
    this.pool
      .query('SELECT seller_id FROM product WHERE id = $1', [review.product_id])
      .then((res) => {
        const sellerId = res.rows[0]?.seller_id;
        if (sellerId) {
          this.sellerPerformanceService.recalculateSellerReliability(sellerId);
        }
      })
      .catch((err) => {
        console.error('[ReviewService] Failed to trigger seller reliability recalculation:', err);
      });
  }

  /**
   * Maps a database row to a ProductReview interface.
   */
  private mapRowToReview(row: Record<string, unknown>): ProductReview {
    return {
      id: row.id as string,
      productId: row.product_id as string,
      userId: row.user_id as string,
      rating: row.rating as number,
      comment: row.comment as string,
      isFake: row.is_fake as boolean,
      fakeProbability: parseFloat(String(row.fake_probability || '0')),
      imageVerified: row.image_verified as boolean,
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    };
  }

  /**
   * Maps a database row (with joined reviewer name) to a ProductReviewWithReviewer interface.
   */
  private mapRowToReviewWithReviewer(row: Record<string, unknown>): ProductReviewWithReviewer {
    return {
      ...this.mapRowToReview(row),
      reviewerName: row.reviewer_name as string,
    };
  }
}

/**
 * Rounds a number to the specified decimal places using round-half-up.
 * This matches the standard mathematical rounding (0.5 rounds up).
 */
export function roundHalfUp(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor + Number.EPSILON) / factor;
}
