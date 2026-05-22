import { Pool } from 'pg';
import Redis from 'ioredis';
import { getDatabasePool } from '../config/database';
import { getRedisClient, withTimeout } from '../config/redis';
import { Cart, CartItem, CostBreakdown } from '@shared/interfaces';
import { CART_MAX_ITEMS, CART_QUANTITY_MIN, CART_QUANTITY_MAX } from '@shared/validation';
import { ErrorCode } from '@shared/errors';
import { AppError } from '../middleware/errorHandler';

/** Redis cache TTL for cart state in seconds (5 minutes) */
const CART_CACHE_TTL_SECONDS = 300;

/** Cache key prefix for cart data */
const CART_CACHE_PREFIX = 'cart:user';

/**
 * Rounds a number to 2 decimal places using round-half-up.
 */
function roundHalfUp(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Computes the cost breakdown for a set of cart items.
 * This is a placeholder until CostCalculatorService (task 5.2) is implemented.
 */
function calculateCostBreakdown(items: CartItem[]): CostBreakdown {
  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const deliveryFee = 0;
  const discount = 0;
  const grandTotal = Math.max(0, subtotal + deliveryFee - discount);

  return {
    subtotal: roundHalfUp(subtotal),
    deliveryFee: roundHalfUp(deliveryFee),
    discount: roundHalfUp(discount),
    grandTotal: roundHalfUp(grandTotal),
  };
}

/**
 * SmartCartService
 *
 * Manages the user's shopping cart with stock validation, quantity constraints,
 * and real-time cost calculation. Uses Redis caching for sub-500ms operations.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.7, 3.9
 */
export class SmartCartService {
  private pool: Pool;
  private redis: Redis;

  constructor(pool?: Pool, redis?: Redis) {
    this.pool = pool || getDatabasePool();
    this.redis = redis || getRedisClient();
  }

  /**
   * Adds an item to the user's cart.
   *
   * - Validates stock availability
   * - Enforces 50-item limit
   * - Rejects if stock exceeded (returns max available)
   * - If product already in cart, increments quantity
   *
   * @param userId - The user's UUID
   * @param productId - The product UUID to add
   * @param quantity - Number of units to add (1–99)
   * @returns Updated cart with all items and calculated totals
   */
  async addItem(userId: string, productId: string, quantity: number): Promise<Cart> {
    // Validate quantity range
    if (quantity < CART_QUANTITY_MIN || quantity > CART_QUANTITY_MAX) {
      throw new AppError(
        400,
        ErrorCode.ValidationError,
        `Quantity must be between ${CART_QUANTITY_MIN} and ${CART_QUANTITY_MAX}`,
        [{ field: 'quantity', message: `Quantity must be between ${CART_QUANTITY_MIN} and ${CART_QUANTITY_MAX}` }],
      );
    }

    // Get product and check stock
    const productResult = await this.pool.query(
      'SELECT id, stock_quantity, is_available FROM product WHERE id = $1',
      [productId],
    );

    if (productResult.rows.length === 0) {
      throw new AppError(404, ErrorCode.NotFound, 'Product not found');
    }

    const product = productResult.rows[0];

    if (!product.is_available || product.stock_quantity === 0) {
      throw new AppError(
        409,
        ErrorCode.StockInsufficient,
        'Product is out of stock',
        [{ field: 'productId', message: 'Product is currently unavailable' }],
      );
    }

    // Ensure user has a cart (create if not exists)
    const cart = await this.getOrCreateCart(userId);

    // Check if product already exists in cart
    const existingItemResult = await this.pool.query(
      'SELECT id, quantity FROM cart_item WHERE cart_id = $1 AND product_id = $2',
      [cart.id, productId],
    );

    const existingItem = existingItemResult.rows[0];
    const currentQuantity = existingItem ? existingItem.quantity : 0;
    const newTotalQuantity = currentQuantity + quantity;

    // Validate stock availability for the total quantity
    if (newTotalQuantity > product.stock_quantity) {
      const maxAvailable = product.stock_quantity - currentQuantity;
      throw new AppError(
        409,
        ErrorCode.StockInsufficient,
        `Insufficient stock. Maximum available: ${Math.max(0, maxAvailable)}`,
        [{ field: 'quantity', message: `Maximum available quantity is ${Math.max(0, maxAvailable)}` }],
      );
    }

    // Validate total quantity doesn't exceed max
    if (newTotalQuantity > CART_QUANTITY_MAX) {
      throw new AppError(
        400,
        ErrorCode.ValidationError,
        `Total quantity cannot exceed ${CART_QUANTITY_MAX}`,
        [{ field: 'quantity', message: `Total quantity cannot exceed ${CART_QUANTITY_MAX}` }],
      );
    }

    if (existingItem) {
      // Update existing item quantity
      await this.pool.query(
        'UPDATE cart_item SET quantity = $1 WHERE id = $2',
        [newTotalQuantity, existingItem.id],
      );
    } else {
      // Check 50-item limit before adding new item
      const itemCountResult = await this.pool.query(
        'SELECT COUNT(*) as count FROM cart_item WHERE cart_id = $1',
        [cart.id],
      );
      const currentItemCount = parseInt(itemCountResult.rows[0].count, 10);

      if (currentItemCount >= CART_MAX_ITEMS) {
        throw new AppError(
          409,
          ErrorCode.Conflict,
          `Cart cannot contain more than ${CART_MAX_ITEMS} distinct items`,
          [{ field: 'cart', message: `Maximum of ${CART_MAX_ITEMS} distinct items allowed` }],
        );
      }

      // Insert new cart item
      await this.pool.query(
        'INSERT INTO cart_item (cart_id, product_id, quantity) VALUES ($1, $2, $3)',
        [cart.id, productId, quantity],
      );
    }

    // Update cart timestamp
    await this.pool.query(
      'UPDATE cart SET updated_at = NOW() WHERE id = $1',
      [cart.id],
    );

    // Invalidate cache and return updated cart
    await this.invalidateCartCache(userId);
    return this.getCart(userId);
  }

  /**
   * Removes an item from the user's cart.
   *
   * @param userId - The user's UUID
   * @param itemId - The cart_item UUID to remove
   * @returns Updated cart with recalculated totals
   */
  async removeItem(userId: string, itemId: string): Promise<Cart> {
    const cart = await this.getUserCart(userId);

    if (!cart) {
      throw new AppError(404, ErrorCode.NotFound, 'Cart not found');
    }

    // Verify the item belongs to this user's cart
    const itemResult = await this.pool.query(
      'SELECT id FROM cart_item WHERE id = $1 AND cart_id = $2',
      [itemId, cart.id],
    );

    if (itemResult.rows.length === 0) {
      throw new AppError(404, ErrorCode.NotFound, 'Cart item not found');
    }

    // Remove the item
    await this.pool.query('DELETE FROM cart_item WHERE id = $1', [itemId]);

    // Update cart timestamp
    await this.pool.query(
      'UPDATE cart SET updated_at = NOW() WHERE id = $1',
      [cart.id],
    );

    // Invalidate cache and return updated cart
    await this.invalidateCartCache(userId);
    return this.getCart(userId);
  }

  /**
   * Updates the quantity of an item in the user's cart.
   *
   * - Validates 1–99 range
   * - Removes item if quantity ≤ 0
   * - Validates stock availability for new quantity
   *
   * @param userId - The user's UUID
   * @param itemId - The cart_item UUID to update
   * @param quantity - New quantity (if ≤ 0, item is removed)
   * @returns Updated cart with recalculated totals
   */
  async updateQuantity(userId: string, itemId: string, quantity: number): Promise<Cart> {
    // If quantity is 0 or negative, remove the item
    if (quantity <= 0) {
      return this.removeItem(userId, itemId);
    }

    // Validate quantity upper bound
    if (quantity > CART_QUANTITY_MAX) {
      throw new AppError(
        400,
        ErrorCode.ValidationError,
        `Quantity must be between ${CART_QUANTITY_MIN} and ${CART_QUANTITY_MAX}`,
        [{ field: 'quantity', message: `Quantity must be at most ${CART_QUANTITY_MAX}` }],
      );
    }

    const cart = await this.getUserCart(userId);

    if (!cart) {
      throw new AppError(404, ErrorCode.NotFound, 'Cart not found');
    }

    // Get the cart item and verify ownership
    const itemResult = await this.pool.query(
      'SELECT ci.id, ci.product_id FROM cart_item ci WHERE ci.id = $1 AND ci.cart_id = $2',
      [itemId, cart.id],
    );

    if (itemResult.rows.length === 0) {
      throw new AppError(404, ErrorCode.NotFound, 'Cart item not found');
    }

    const cartItem = itemResult.rows[0];

    // Check stock availability for the new quantity
    const productResult = await this.pool.query(
      'SELECT stock_quantity FROM product WHERE id = $1',
      [cartItem.product_id],
    );

    if (productResult.rows.length === 0) {
      throw new AppError(404, ErrorCode.NotFound, 'Product not found');
    }

    const stockQuantity = productResult.rows[0].stock_quantity;

    if (quantity > stockQuantity) {
      throw new AppError(
        409,
        ErrorCode.StockInsufficient,
        `Insufficient stock. Maximum available: ${stockQuantity}`,
        [{ field: 'quantity', message: `Maximum available quantity is ${stockQuantity}` }],
      );
    }

    // Update the quantity
    await this.pool.query(
      'UPDATE cart_item SET quantity = $1 WHERE id = $2',
      [quantity, itemId],
    );

    // Update cart timestamp
    await this.pool.query(
      'UPDATE cart SET updated_at = NOW() WHERE id = $1',
      [cart.id],
    );

    // Invalidate cache and return updated cart
    await this.invalidateCartCache(userId);
    return this.getCart(userId);
  }

  /**
   * Returns the full cart with all items and calculated totals.
   * Uses Redis cache for sub-500ms response times.
   *
   * @param userId - The user's UUID
   * @returns Full cart with items and cost breakdown
   */
  async getCart(userId: string): Promise<Cart> {
    // Try cache first
    console.log(`[DEBUG] SmartCartService.getCart: checking cache for user ${userId}`);
    const cached = await this.getFromCache(userId);
    if (cached) {
      console.log(`[DEBUG] SmartCartService.getCart: cache hit for user ${userId}`);
      return cached;
    }

    console.log(`[DEBUG] SmartCartService.getCart: cache miss for user ${userId}, fetching from DB`);
    // Ensure user has a cart
    const cart = await this.getOrCreateCart(userId);

    // Get all cart items with product details
    const itemsResult = await this.pool.query(
      `SELECT ci.id, ci.product_id, ci.quantity, ci.added_at,
              p.name as product_name, p.unit_price
       FROM cart_item ci
       JOIN product p ON ci.product_id = p.id
       WHERE ci.cart_id = $1
       ORDER BY ci.added_at ASC`,
      [cart.id],
    );

    const items: CartItem[] = itemsResult.rows.map((row) => {
      const unitPrice = parseFloat(row.unit_price);
      const qty = row.quantity;
      const subtotal = roundHalfUp(unitPrice * qty);

      return {
        id: row.id,
        productId: row.product_id,
        productName: row.product_name,
        unitPrice,
        quantity: qty,
        subtotal,
      };
    });

    const costBreakdown = calculateCostBreakdown(items);

    const fullCart: Cart = {
      id: cart.id,
      userId: cart.user_id,
      items,
      costBreakdown,
      createdAt: cart.created_at instanceof Date
        ? cart.created_at.toISOString()
        : String(cart.created_at),
      updatedAt: cart.updated_at instanceof Date
        ? cart.updated_at.toISOString()
        : String(cart.updated_at),
    };

    // Cache the result
    await this.setCache(userId, fullCart);

    return fullCart;
  }

  /**
   * Gets the user's existing cart row or creates one if it doesn't exist.
   */
  private async getOrCreateCart(userId: string): Promise<Record<string, unknown>> {
    // Try to get existing cart
    const existingResult = await this.pool.query(
      'SELECT * FROM cart WHERE user_id = $1',
      [userId],
    );

    if (existingResult.rows.length > 0) {
      return existingResult.rows[0];
    }

    // Create a new cart for the user
    const insertResult = await this.pool.query(
      'INSERT INTO cart (user_id) VALUES ($1) RETURNING *',
      [userId],
    );

    return insertResult.rows[0];
  }

  /**
   * Gets the user's existing cart row (does not create).
   */
  private async getUserCart(userId: string): Promise<Record<string, unknown> | null> {
    const result = await this.pool.query(
      'SELECT * FROM cart WHERE user_id = $1',
      [userId],
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Retrieves cart from Redis cache.
   */
  private async getFromCache(userId: string): Promise<Cart | null> {
    try {
      console.log(`[DEBUG] SmartCartService.getFromCache: calling Redis for user ${userId}`);
      const cached = await withTimeout(this.redis.get(`${CART_CACHE_PREFIX}:${userId}`));
      console.log(`[DEBUG] SmartCartService.getFromCache: Redis returned for user ${userId}`);
      if (cached) {
        return JSON.parse(cached) as Cart;
      }
    } catch (error) {
      console.warn(`[SmartCartService] Cache read failed for user ${userId}, falling back to DB: ${(error as Error).message}`);
    }
    return null;
  }

  /**
   * Stores cart in Redis cache with TTL.
   */
  private async setCache(userId: string, cart: Cart): Promise<void> {
    try {
      await withTimeout(
        this.redis.set(
          `${CART_CACHE_PREFIX}:${userId}`,
          JSON.stringify(cart),
          'EX',
          CART_CACHE_TTL_SECONDS,
        )
      );
    } catch (error) {
      console.warn(`[SmartCartService] Cache write failed for user ${userId}: ${(error as Error).message}`);
    }
  }

  /**
   * Invalidates the cached cart for a user.
   */
  private async invalidateCartCache(userId: string): Promise<void> {
    try {
      await withTimeout(this.redis.del(`${CART_CACHE_PREFIX}:${userId}`));
    } catch (error) {
      console.warn(`[SmartCartService] Cache invalidation failed for user ${userId}: ${(error as Error).message}`);
    }
  }
}
