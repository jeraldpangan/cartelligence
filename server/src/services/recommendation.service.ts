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
    image: (row.primary_image_url as string) || null,
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
        `SELECT p.*, pi.url as primary_image_url
         FROM purchase_history ph
         JOIN product p ON ph.product_id = p.id
         LEFT JOIN product_image pi ON p.id = pi.product_id AND pi.is_primary = true
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
        `SELECT p.*, pi.url as primary_image_url, SUM(ph.purchase_count) as co_occurrence_score
         FROM purchase_history ph
         JOIN product p ON ph.product_id = p.id
         LEFT JOIN product_image pi ON p.id = pi.product_id AND pi.is_primary = true
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
        `SELECT p.*, pi.url as primary_image_url,
           CASE WHEN p.category = $2 THEN 2 ELSE 0 END +
           COALESCE(co.co_score, 0) as relevance_score
         FROM product p
         LEFT JOIN product_image pi ON p.id = pi.product_id AND pi.is_primary = true
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
        `SELECT p.*, pi.url as primary_image_url, COUNT(DISTINCT oi.order_id) as order_appearances
         FROM order_item oi
         JOIN product p ON oi.product_id = p.id
         LEFT JOIN product_image pi ON p.id = pi.product_id AND pi.is_primary = true
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
        `SELECT p.*, pi.url as primary_image_url, COALESCE(SUM(ph.purchase_count), 0) as total_purchases
         FROM product p
         LEFT JOIN product_image pi ON p.id = pi.product_id AND pi.is_primary = true
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

  /**
   * Saves or updates a user's grocery shopping preference survey.
   * Requirements: A. Hybrid Recommendation Algorithm
   */
  async saveUserSurvey(
    userId: string,
    budget: number,
    preferredCategories: ProductCategory[],
    browsingHistory: string[] = []
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_survey (user_id, budget, preferred_categories, browsing_history, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         budget = EXCLUDED.budget,
         preferred_categories = EXCLUDED.preferred_categories,
         browsing_history = EXCLUDED.browsing_history,
         updated_at = NOW()`,
      [userId, budget, preferredCategories, JSON.stringify(browsingHistory)]
    );
  }

  /**
   * Retrieves a user's preference survey responses.
   */
  async getUserSurvey(userId: string): Promise<any> {
    const result = await this.pool.query(
      `SELECT budget::float as budget, preferred_categories::text[] as "preferredCategories", browsing_history as "browsingHistory"
       FROM user_survey
       WHERE user_id = $1`,
      [userId]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0];
  }

  /**
   * Tracks a product click/view and appends it to the user's browsing history.
   * If no survey exists for the user, creates one with sensible defaults.
   * Keeps only the last 50 browsing history entries to prevent unbounded growth.
   * Also tracks click counts per category to adaptively learn user preferences.
   *
   * Requirements: A. Hybrid Recommendation Algorithm (Real-time Browsing Signal)
   */
  async trackProductClick(userId: string, productId: string, category?: string): Promise<void> {
    try {
      // Check if user has a survey
      const existingSurvey = await this.getUserSurvey(userId);

      if (!existingSurvey) {
        // Create a default survey with the clicked product seeding the browsing history
        const defaultCategories = category ? [category] : ['produce'];
        await this.pool.query(
          `INSERT INTO user_survey (user_id, budget, preferred_categories, browsing_history, updated_at)
           VALUES ($1, 500, $2, $3, NOW())
           ON CONFLICT (user_id) DO NOTHING`,
          [userId, defaultCategories, JSON.stringify([productId])]
        );
        return;
      }

      // Append product ID to browsing history, remove duplicates, and keep last 50
      const currentHistory: string[] = existingSurvey.browsingHistory || [];
      const filteredHistory = currentHistory.filter((id: string) => id !== productId);
      filteredHistory.unshift(productId); // Most recent first
      const trimmedHistory = filteredHistory.slice(0, 50);

      // If the clicked category is not already in preferred categories, add it
      const currentPrefs: string[] = existingSurvey.preferredCategories || [];
      let updatedPrefs = currentPrefs;
      if (category && !currentPrefs.includes(category)) {
        updatedPrefs = [...currentPrefs, category];
      }

      await this.pool.query(
        `UPDATE user_survey
         SET browsing_history = $2,
             preferred_categories = $3,
             updated_at = NOW()
         WHERE user_id = $1`,
        [userId, JSON.stringify(trimmedHistory), updatedPrefs]
      );
    } catch (error) {
      // Non-critical — never block the user experience for tracking failures
      console.error('RecommendationService.trackProductClick error:', error);
    }
  }

  /**
   * Computes high-accuracy hybrid recommendations for a user.
   * Weighs:
   * 1. Budget matches (rewarding items within budget, exponential penalty above)
   * 2. Category affinities (from survey)
   * 3. Browsing history (recent clicks)
   * 4. Seller reliability ratings
   * 5. Review quality (average review rating)
   * Falls back to a mix of collaborative purchase frequency + popularity if no survey completed.
   *
   * Requirements: A. Hybrid Recommendation Algorithm
   */
  async getHybridRecommendations(userId: string, limit: number = 10): Promise<RecommendationResult> {
    try {
      const survey = await this.getUserSurvey(userId);

      // If no survey exists, return a combination of user purchase history (collaborative) and popular items
      if (!survey) {
        const historyRes = await this.getPersonalized(userId);
        const fallbackRes = await this.getFallback();
        
        const historyProd = historyRes.products || [];
        const fallbackProd = fallbackRes.products || [];
        
        // Blend items (history first, then fallback to pad to limit)
        const blendedMap = new Map<string, Product>();
        historyProd.forEach(p => blendedMap.set(p.id, p));
        fallbackProd.forEach(p => {
          if (blendedMap.size < limit) blendedMap.set(p.id, p);
        });
        
        return {
          products: Array.from(blendedMap.values()),
          status: 'blended_popularity'
        };
      }

      const { budget, preferredCategories, browsingHistory } = survey;
      const historySet = new Set<string>(browsingHistory || []);

      // Fetch all available products with average ratings and seller reliability
      const result = await this.pool.query(
        `SELECT p.*, 
                pi.url as primary_image_url,
                COALESCE(up.seller_reliability, 4.5) as seller_reliability,
                COALESCE(avg_rev.avg_rating, 4.0) as avg_rating,
                COALESCE(ph.purchase_count, 0) as user_purchases
         FROM product p
         LEFT JOIN product_image pi ON p.id = pi.product_id AND pi.is_primary = true
         LEFT JOIN user_profile up ON p.seller_id = up.id
         LEFT JOIN (
           SELECT product_id, AVG(rating) as avg_rating 
           FROM product_review 
           WHERE is_fake = false
           GROUP BY product_id
         ) avg_rev ON p.id = avg_rev.product_id
         LEFT JOIN purchase_history ph ON p.id = ph.product_id AND ph.user_id = $1
         WHERE p.is_available = true AND p.deleted_at IS NULL`,
        [userId]
      );

      const productsWithScores = result.rows.map((row) => {
        const product = mapRowToProduct(row);
        const unitPrice = product.unitPrice;
        
        // 1. Budget Score
        let budgetScore = 0;
        if (unitPrice <= budget) {
          // Items within budget scored based on proximity (closer to budget means higher value, max 1.0)
          budgetScore = 1.0 - 0.2 * (unitPrice / budget);
        } else {
          // Items exceeding budget receive an exponential penalty
          budgetScore = Math.exp(-4.0 * ((unitPrice - budget) / budget));
        }

        // 2. Preference Score (Category matching)
        const isPreferredCategory = preferredCategories.includes(product.category);
        const preferenceScore = isPreferredCategory ? 1.0 : 0.0;

        // 3. Browsing History Score
        const isRecentlyViewed = historySet.has(product.id);
        const browsingScore = isRecentlyViewed ? 1.0 : (isPreferredCategory ? 0.4 : 0.0);

        // 4. Seller Reliability Score (Normalized 1-5 rating -> 0-1)
        const sellerReliability = parseFloat(row.seller_reliability);
        const sellerScore = (sellerReliability - 1.0) / 4.0;

        // 5. Review Quality Score (Normalized 1-5 rating -> 0-1)
        const avgRating = parseFloat(row.avg_rating);
        const reviewScore = avgRating / 5.0;

        // 6. Collaborative Popularity (from previous purchases)
        const userPurchases = parseInt(row.user_purchases, 10);
        const popularityScore = userPurchases > 0 ? Math.min(1.0, userPurchases / 5.0) : 0.0;

        // Hybrid Blend Formula
        const finalScore = 
          0.25 * budgetScore + 
          0.25 * preferenceScore + 
          0.15 * browsingScore + 
          0.15 * sellerScore + 
          0.10 * reviewScore +
          0.10 * popularityScore;

        const enrichedProduct = {
          ...product,
          sellerReliability: sellerReliability,
          avgRating: avgRating
        };

        return { product: enrichedProduct, score: finalScore };
      });

      // Sort by final hybrid score descending and limit results
      const sortedProducts = productsWithScores
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(item => item.product);

      return { products: sortedProducts, status: 'hybrid_personalized' };
    } catch (error) {
      console.error('RecommendationService.getHybridRecommendations error:', error);
      return { products: null, status: 'Recommendation engine unavailable' };
    }
  }
}
