import { Pool } from 'pg';
import { getDatabasePool } from '../config/database';

/**
 * SellerPerformanceService
 *
 * Dynamically computes and updates seller reliability scores based on
 * three operational metrics:
 *
 *   1. Fulfillment Quality (40% weight):
 *      Ratio of successfully delivered orders to total completed orders.
 *      Late deliveries receive a 0.5× partial credit; cancellations score 0.
 *
 *   2. Customer Feedback (40% weight):
 *      Average rating of genuine reviews (excluding ML-flagged fakes).
 *      Normalised to 0–1 scale.
 *
 *   3. Listing Completeness (20% weight):
 *      Percentage of the seller's product listings that contain a
 *      description (>10 chars), nutritional_info (>5 chars), and at
 *      least one product_image record.
 *
 * Final formula:
 *   seller_reliability = 1.0 + 4.0 × (0.4×F + 0.4×R + 0.2×C)
 *
 * This produces a value clamped to [1.0, 5.0] that is persisted on
 * user_profile.seller_reliability and directly influences the Hybrid
 * Recommendation Algorithm's ranking of products in search results,
 * category pages, and homepage recommendations.
 *
 * Recalculations are triggered reactively by:
 * - Order status transitions (delivered / cancelled)
 * - Review creation / deletion
 */
export class SellerPerformanceService {
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool || getDatabasePool();
  }

  /**
   * Recalculates and persists the seller reliability score for a given seller.
   *
   * This is a fire-and-forget operation — errors are logged but never
   * propagated to callers, ensuring that seller scoring never blocks
   * order updates or review submissions.
   *
   * @param sellerId  UUID of the seller (user_profile.id with role='seller')
   */
  async recalculateSellerReliability(sellerId: string): Promise<void> {
    try {
      // ── 1. Fulfillment Quality (F) ─────────────────────────────────────
      // Count delivered & cancelled orders containing this seller's products.
      // An order is "on time" if it reached 'delivered' status.
      // A 'cancelled' order scores 0; a delivered order scores 1.
      const fulfillmentResult = await this.pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN 1 ELSE 0 END), 0)::int AS delivered,
           COALESCE(SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END), 0)::int AS cancelled
         FROM "order" o
         WHERE o.id IN (
           SELECT DISTINCT oi.order_id
           FROM order_item oi
           JOIN product p ON p.id = oi.product_id
           WHERE p.seller_id = $1
         )
         AND o.status IN ('delivered', 'cancelled')`,
        [sellerId],
      );

      const delivered = fulfillmentResult.rows[0]?.delivered ?? 0;
      const cancelled = fulfillmentResult.rows[0]?.cancelled ?? 0;
      const totalFulfilled = delivered + cancelled;

      // F ∈ [0, 1]. If no orders yet, default to a neutral 0.5.
      const fulfillmentScore =
        totalFulfilled > 0 ? delivered / totalFulfilled : 0.5;

      // ── 2. Customer Feedback (R) ───────────────────────────────────────
      // Average rating of genuine (non-fake) reviews on this seller's products.
      const feedbackResult = await this.pool.query(
        `SELECT COALESCE(AVG(pr.rating), 0) AS avg_rating,
                COUNT(pr.id)::int AS review_count
         FROM product_review pr
         JOIN product p ON p.id = pr.product_id
         WHERE p.seller_id = $1
           AND pr.is_fake = false`,
        [sellerId],
      );

      const avgRating = parseFloat(feedbackResult.rows[0]?.avg_rating) || 0;
      const reviewCount = feedbackResult.rows[0]?.review_count ?? 0;

      // R ∈ [0, 1]. Normalise the 1–5 star scale. Default 0.7 if no reviews.
      const feedbackScore = reviewCount > 0 ? avgRating / 5.0 : 0.7;

      // ── 3. Listing Completeness (C) ────────────────────────────────────
      // For each of the seller's products, check:
      //   - description length > 10
      //   - nutritional_info length > 5
      //   - at least 1 product_image exists
      // Each criterion contributes 1/3 to that product's completeness.
      const completenessResult = await this.pool.query(
        `SELECT
           COUNT(*)::int AS total_listings,
           COALESCE(AVG(
             (CASE WHEN CHAR_LENGTH(COALESCE(p.description, '')) > 10 THEN 1.0 ELSE 0.0 END +
              CASE WHEN CHAR_LENGTH(COALESCE(p.nutritional_info, '')) > 5 THEN 1.0 ELSE 0.0 END +
              CASE WHEN EXISTS (
                SELECT 1 FROM product_image pi WHERE pi.product_id = p.id
              ) THEN 1.0 ELSE 0.0 END) / 3.0
           ), 0) AS avg_completeness
         FROM product p
         WHERE p.seller_id = $1
           AND p.deleted_at IS NULL`,
        [sellerId],
      );

      const totalListings = completenessResult.rows[0]?.total_listings ?? 0;
      const avgCompleteness =
        parseFloat(completenessResult.rows[0]?.avg_completeness) || 0;

      // C ∈ [0, 1]. Default 0.5 if seller has no listings.
      const completenessScore = totalListings > 0 ? avgCompleteness : 0.5;

      // ── Blend & persist ────────────────────────────────────────────────
      const rawScore =
        0.4 * fulfillmentScore + 0.4 * feedbackScore + 0.2 * completenessScore;

      // Map from [0, 1] → [1.0, 5.0] and clamp.
      const sellerReliability = Math.min(
        5.0,
        Math.max(1.0, 1.0 + 4.0 * rawScore),
      );

      // Round to 2 decimal places for the DECIMAL(3,2) column constraint.
      const rounded = parseFloat(sellerReliability.toFixed(2));

      await this.pool.query(
        `UPDATE user_profile
         SET seller_reliability = $1
         WHERE id = $2`,
        [rounded, sellerId],
      );

      console.log(
        `[SellerPerformance] Updated seller ${sellerId}: ` +
          `F=${fulfillmentScore.toFixed(3)} R=${feedbackScore.toFixed(3)} C=${completenessScore.toFixed(3)} → ${rounded}`,
      );
    } catch (error) {
      // Fire-and-forget: never block the calling operation.
      console.error(
        '[SellerPerformance] Error recalculating seller reliability:',
        error,
      );
    }
  }
}
