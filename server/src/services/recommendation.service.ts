import { Pool } from 'pg';
import { getDatabasePool } from '../config/database';
import { Product } from '@shared/interfaces';
import { ProductCategory } from '@shared/enums';

/**
 * Result wrapper for recommendation methods that may fail gracefully.
 */
export interface RecommendationResult {
  products: Product[] | null;
  status: string;
}

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
    createdAt: row.created_at instanceof Date
      ? (row.created_at as Date).toISOString()
      : String(row.created_at),
    updatedAt: row.updated_at instanceof Date
      ? (row.updated_at as Date).toISOString()
      : String(row.updated_at),
  };
}

/**
 * RecommendationService
 *
 * Provides personalized product recommendations based on purchase history,
 * cart contents, category affinity, and co-occurrence patterns.
 * Handles engine unavailability gracefully — never lets recommendation
 * failures break the cart or other operations.
 *
 * Requirements: 3.5, 3.8, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7
 */
export class RecommendationService {
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool || getDatabasePool();
  }

  /**
   * Returns up to 10 personalized product recommendations based on the user's
   * purchase history, ordered by purchase frequency.
   * Requires the user to have at least 1 previous order.
   * Excludes dismissed recommendations (active within 30 days).
   *
   * @param userId - The user's UUID
   * @returns RecommendationResult with products or null on failure
   */
  async getPersonalized(userId: string): Promise<RecommendationResult> {
    try {
      // Check if user has at least 1 order
      const orderCountResult = await this.pool.query(
        `SELECT COUNT(*) as count FROM "order" WHERE user_id = $1`,
        [userId],
      );
      const orderCount = parseInt(orderCountResult.rows[0].count, 10);

      if (orderCount < 1) {
        return { products: [], status: 'No previous orders found' };
      }

      // Get top products from purchase history, excluding dismissed ones
      const result = await this.pool.query(
        `SELECT p.*
         FROM purchase_history ph
         JOIN product p ON ph.product_id = p.id
         WHERE ph.user_id = $1
           AND p.is_available = true
           AND p.id NOT IN (
             SELECT rd.product_id
             FROM recommendation_dismissal rd
             WHERE rd.user_id = $1
               AND rd.expires_at > NOW()
           )
         ORDER BY ph.purchase_count DESC
         LIMIT 10`,
        [userId],
      );

      const products = result.rows.map(mapRowToProduct);
      return { products, status: 'ok' };
    } catch (error) {
      console.error('RecommendationService.getPersonalized error:', error);
      return { products: null, status: 'Recommendation engine unavailable' };
    }
  }

  /**
   * Returns up to 5 co-purchased product recommendations based on the current
   * cart contents. Uses item co-occurrence from purchase_history to find products
   * frequently bought together with the items in the cart.
   * Requires at least 3 items in the cart.
   *
   * @param cartItems - Array of objects with productId representing current cart items
   * @returns RecommendationResult with products or null on failure
   */
  async getCartBased(cartItems: { productId: string }[]): Promise<RecommendationResult> {
    try {
      // Require at least 3 cart items
      if (!cartItems || cartItems.length < 3) {
        return { products: [], status: 'Cart must contain at least 3 items' };
      }

      const cartProductIds = cartItems.map((item) => item.productId);

      // Find products that are frequently co-purchased with the cart items.
      // Strategy: find users who bought the same products as in the cart,
      // then find other products those users also bought frequently.
      const result = await this.pool.query(
        `SELECT p.*, SUM(ph.purchase_count) as co_occurrence_score
         FROM purchase_history ph
         JOIN product p ON ph.product_id = p.id
         WHERE ph.user_id IN (
           SELECT DISTINCT ph2.user_id
           FROM purchase_history ph2
           WHERE ph2.product_id = ANY($1::uuid[])
         )
         AND ph.product_id != ALL($1::uuid[])
         AND p.is_available = true
         GROUP BY p.id
         ORDER BY co_occurrence_score DESC
         LIMIT 5`,
        [cartProductIds],
      );

      const products = result.rows.map(mapRowToProduct);
      return { products, status: 'ok' };
    } catch (error) {
      console.error('RecommendationService.getCartBased error:', error);
      return { products: null, status: 'Recommendation engine unavailable' };
    }
  }

  /**
   * Returns up to 5 related products for a given product based on category
   * affinity and purchase correlation.
   * Combines same-category products with products frequently bought together.
   *
   * @param productId - The product UUID to find related items for
   * @returns RecommendationResult with products or null on failure
   */
  async getRelated(productId: string): Promise<RecommendationResult> {
    // Validate UUID format to prevent database errors (e.g. if 'undefined' is passed)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!productId || !uuidRegex.test(productId)) {
      return { products: [], status: 'Invalid product ID' };
    }

    try {
      // Get the product's category
      const productResult = await this.pool.query(
        'SELECT category FROM product WHERE id = $1',
        [productId],
      );

      if (productResult.rows.length === 0) {
        return { products: [], status: 'Product not found' };
      }

      const category = productResult.rows[0].category;

      // Find related products: combine category affinity with purchase correlation.
      // Priority: products in the same category that are also frequently co-purchased.
      const result = await this.pool.query(
        `SELECT p.*, 
           CASE WHEN p.category = $2 THEN 2 ELSE 0 END +
           COALESCE(co.co_score, 0) as relevance_score
         FROM product p
         LEFT JOIN (
           SELECT ph2.product_id, SUM(ph2.purchase_count) as co_score
           FROM purchase_history ph2
           WHERE ph2.user_id IN (
             SELECT ph3.user_id
             FROM purchase_history ph3
             WHERE ph3.product_id = $1
           )
           AND ph2.product_id != $1
           GROUP BY ph2.product_id
         ) co ON p.id = co.product_id
         WHERE p.id != $1
           AND p.is_available = true
           AND (p.category = $2 OR co.co_score > 0)
         ORDER BY relevance_score DESC
         LIMIT 5`,
        [productId, category],
      );

      const products = result.rows.map(mapRowToProduct);
      return { products, status: 'ok' };
    } catch (error) {
      console.error('RecommendationService.getRelated error:', error);
      return { products: null, status: 'Recommendation engine unavailable' };
    }
  }

  /**
   * Returns reorder reminders: products that appear in at least 2 of the user's
   * last 5 orders. Requires the user to have at least 3 previous orders.
   * Excludes dismissed recommendations.
   *
   * @param userId - The user's UUID
   * @returns RecommendationResult with products or null on failure
   */
  async getReorderReminders(userId: string): Promise<RecommendationResult> {
    try {
      // Check if user has at least 3 orders
      const orderCountResult = await this.pool.query(
        `SELECT COUNT(*) as count FROM "order" WHERE user_id = $1`,
        [userId],
      );
      const orderCount = parseInt(orderCountResult.rows[0].count, 10);

      if (orderCount < 3) {
        return { products: [], status: 'Requires at least 3 previous orders' };
      }

      // Get the last 5 order IDs for this user
      const lastOrdersResult = await this.pool.query(
        `SELECT id FROM "order"
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 5`,
        [userId],
      );

      const lastOrderIds = lastOrdersResult.rows.map((row) => row.id);

      if (lastOrderIds.length === 0) {
        return { products: [], status: 'No orders found' };
      }

      // Find products appearing in at least 2 of those orders, excluding dismissed
      const result = await this.pool.query(
        `SELECT p.*, COUNT(DISTINCT oi.order_id) as order_appearances
         FROM order_item oi
         JOIN product p ON oi.product_id = p.id
         WHERE oi.order_id = ANY($1::uuid[])
           AND p.is_available = true
           AND p.id NOT IN (
             SELECT rd.product_id
             FROM recommendation_dismissal rd
             WHERE rd.user_id = $2
               AND rd.expires_at > NOW()
           )
         GROUP BY p.id
         HAVING COUNT(DISTINCT oi.order_id) >= 2
         ORDER BY order_appearances DESC`,
        [lastOrderIds, userId],
      );

      const products = result.rows.map(mapRowToProduct);
      return { products, status: 'ok' };
    } catch (error) {
      console.error('RecommendationService.getReorderReminders error:', error);
      return { products: null, status: 'Recommendation engine unavailable' };
    }
  }

  /**
   * Dismisses a recommendation for a user. The product will be excluded from
   * the user's recommendations for 30 days.
   * If a dismissal already exists for this user+product, it is replaced.
   *
   * @param userId - The user's UUID
   * @param productId - The product UUID to dismiss
   */
  async dismissRecommendation(userId: string, productId: string): Promise<void> {
    // Remove any existing dismissal for this user+product, then insert fresh
    await this.pool.query(
      `DELETE FROM recommendation_dismissal
       WHERE user_id = $1 AND product_id = $2`,
      [userId, productId],
    );

    await this.pool.query(
      `INSERT INTO recommendation_dismissal (user_id, product_id, dismissed_at, expires_at)
       VALUES ($1, $2, NOW(), NOW() + INTERVAL '30 days')`,
      [userId, productId],
    );
  }

  /**
   * Returns the top 10 selling products across all users.
   * Used as a fallback for new users (no purchase history) or when the
   * recommendation engine is unavailable.
   *
   * @returns RecommendationResult with products or null on failure
   */
  async getFallback(): Promise<RecommendationResult> {
    try {
      const result = await this.pool.query(
        `SELECT p.*, COALESCE(SUM(ph.purchase_count), 0) as total_purchases
         FROM product p
         LEFT JOIN purchase_history ph ON p.id = ph.product_id
         WHERE p.is_available = true
         GROUP BY p.id
         ORDER BY total_purchases DESC
         LIMIT 10`,
      );

      const products = result.rows.map(mapRowToProduct);
      return { products, status: 'ok' };
    } catch (error) {
      console.error('RecommendationService.getFallback error:', error);
      return { products: null, status: 'Recommendation engine unavailable' };
    }
  }
}
