import { Pool } from 'pg';
import { getDatabasePool } from '../config/database';
import { SmartCartService } from './cart.service';
import { CostCalculatorService } from './cost-calculator.service';
import { EmailService, getEmailService } from './email.service';
import { Order, OrderItem, Cart, CostBreakdown } from '@shared/interfaces';
import { OrderStatus } from '@shared/enums';
import { PaymentDto } from '@shared/dtos';
import { MAX_ACTIVE_ORDERS } from '@shared/validation';
import { ErrorCode } from '@shared/errors';
import { AppError } from '../middleware/errorHandler';

/** Maximum payment retry attempts before requiring re-initiation of checkout */
const MAX_PAYMENT_RETRIES = 3;

/**
 * Checkout summary returned when a user initiates checkout.
 */
export interface CheckoutSummary {
  cart: Cart;
  costBreakdown: CostBreakdown;
  deliveryAddress: string;
  paymentMethods: string[];
}

/**
 * Order confirmation returned after successful payment.
 */
export interface OrderConfirmation {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  grandTotal: number;
  deliveryAddress: string;
  createdAt: string;
}

/**
 * Internal result of a payment processing attempt.
 */
interface PaymentResult {
  success: boolean;
  failureReason?: string;
}

/**
 * Generates a unique order number in the format "CART-YYYYMMDD-XXXX"
 * where XXXX is a random alphanumeric suffix.
 */
function generateOrderNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const datePart = `${year}${month}${day}`;

  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return `CART-${datePart}-${suffix}`;
}

/**
 * OrderService
 *
 * Handles checkout initiation, order confirmation with payment processing,
 * and retrieval of active orders. Integrates with SmartCartService for cart
 * data and CostCalculatorService for cost computation.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
 */
export class OrderService {
  private pool: Pool;
  private cartService: SmartCartService;
  private costCalculatorService: CostCalculatorService;
  private emailService: EmailService;

  constructor(pool?: Pool, cartService?: SmartCartService, costCalculatorService?: CostCalculatorService, emailService?: EmailService) {
    this.pool = pool || getDatabasePool();
    this.cartService = cartService || new SmartCartService();
    this.costCalculatorService = costCalculatorService || new CostCalculatorService();
    this.emailService = emailService || getEmailService();
  }

  /**
   * Initiates checkout by validating the cart is non-empty, verifying stock
   * for all items, and returning a checkout summary.
   *
   * @param userId - The user's UUID
   * @returns CheckoutSummary with items, totals, address, and payment options
   * @throws AppError 400 if cart is empty
   * @throws AppError 409 if any item has insufficient stock
   */
  async initiateCheckout(userId: string): Promise<CheckoutSummary> {
    // Get the user's cart
    const cart = await this.cartService.getCart(userId);

    // Prevent checkout with empty cart
    if (!cart.items || cart.items.length === 0) {
      throw new AppError(
        400,
        ErrorCode.ValidationError,
        'Cannot checkout with an empty cart',
        [{ field: 'cart', message: 'Cart contains no items' }],
      );
    }

    // Verify stock for all items
    await this.verifyStockForAllItems(cart);

    // Get user's delivery address
    const userResult = await this.pool.query(
      'SELECT delivery_address FROM user_profile WHERE id = $1',
      [userId],
    );

    if (userResult.rows.length === 0) {
      throw new AppError(404, ErrorCode.NotFound, 'User not found');
    }

    const deliveryAddress = userResult.rows[0].delivery_address;

    // Calculate cost breakdown
    const costBreakdown = await this.costCalculatorService.calculateTotal(cart.items);

    // Build checkout summary — shape must match the client CheckoutSummary interface
    const summary: CheckoutSummary = {
      cart,
      costBreakdown,
      deliveryAddress,
      paymentMethods: ['credit_debit_card', 'digital_wallet'],
    };

    return summary;
  }

  /**
   * Confirms an order by re-verifying stock, processing payment, creating
   * the order record, and sending a confirmation email.
   *
   * Supports up to 3 payment retry attempts. On the 3rd failure, the user
   * must re-initiate checkout.
   *
   * @param userId - The user's UUID
   * @param paymentDto - Payment method and details
   * @param retryCount - Current retry attempt (0-based, tracked by caller)
   * @returns OrderConfirmation with order number and details
   * @throws AppError 400 if cart is empty
   * @throws AppError 409 if stock is insufficient
   * @throws AppError 402 if payment fails after max retries
   */
  async confirmOrder(
    userId: string,
    paymentDto: PaymentDto,
    retryCount: number = 0,
  ): Promise<OrderConfirmation> {
    // Get the user's cart
    const cart = await this.cartService.getCart(userId);

    // Prevent confirmation with empty cart
    if (!cart.items || cart.items.length === 0) {
      throw new AppError(
        400,
        ErrorCode.ValidationError,
        'Cannot confirm order with an empty cart',
        [{ field: 'cart', message: 'Cart contains no items' }],
      );
    }

    // Re-verify stock availability
    await this.verifyStockForAllItems(cart);

    // Process payment with retry logic
    const paymentResult = await this.processPayment(paymentDto);

    if (!paymentResult.success) {
      if (retryCount >= MAX_PAYMENT_RETRIES - 1) {
        throw new AppError(
          402,
          ErrorCode.PaymentFailed,
          `Payment failed after ${MAX_PAYMENT_RETRIES} attempts. Please re-initiate checkout.`,
          [{ field: 'payment', message: paymentResult.failureReason || 'Payment processing failed' }],
        );
      }

      throw new AppError(
        402,
        ErrorCode.PaymentFailed,
        `Payment failed: ${paymentResult.failureReason || 'Unknown error'}. You have ${MAX_PAYMENT_RETRIES - retryCount - 1} retry attempt(s) remaining.`,
        [{ field: 'payment', message: paymentResult.failureReason || 'Payment processing failed' }],
      );
    }

    // Get user's delivery address
    const userResult = await this.pool.query(
      'SELECT delivery_address FROM user_profile WHERE id = $1',
      [userId],
    );

    const deliveryAddress = userResult.rows[0]?.delivery_address || '';

    // Calculate final cost breakdown
    const costBreakdown = await this.costCalculatorService.calculateTotal(cart.items);

    // Generate order number
    const orderNumber = generateOrderNumber();

    // Create order in database within a transaction
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Insert order record
      const orderResult = await client.query(
        `INSERT INTO "order" (user_id, order_number, status, subtotal, delivery_fee, discount, grand_total, delivery_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, created_at`,
        [
          userId,
          orderNumber,
          OrderStatus.Confirmed,
          costBreakdown.subtotal,
          costBreakdown.deliveryFee,
          costBreakdown.discount,
          costBreakdown.grandTotal,
          deliveryAddress,
        ],
      );

      const orderId = orderResult.rows[0].id;
      const createdAt = orderResult.rows[0].created_at;

      // Insert order items
      for (const item of cart.items) {
        await client.query(
          `INSERT INTO order_item (order_id, product_id, quantity, unit_price_at_purchase, subtotal)
           VALUES ($1, $2, $3, $4, $5)`,
          [orderId, item.productId, item.quantity, item.unitPrice, item.subtotal],
        );

        // Decrement stock
        await client.query(
          `UPDATE product SET stock_quantity = stock_quantity - $1 WHERE id = $2`,
          [item.quantity, item.productId],
        );
      }

      // Clear the user's cart
      const cartResult = await client.query(
        'SELECT id FROM cart WHERE user_id = $1',
        [userId],
      );

      if (cartResult.rows.length > 0) {
        await client.query(
          'DELETE FROM cart_item WHERE cart_id = $1',
          [cartResult.rows[0].id],
        );
      }

      await client.query('COMMIT');

      // Send confirmation email asynchronously (non-blocking)
      this.sendConfirmationEmail(userId, orderNumber, cart, costBreakdown, deliveryAddress);

      return {
        orderId,
        orderNumber,
        status: OrderStatus.Confirmed,
        grandTotal: costBreakdown.grandTotal,
        deliveryAddress,
        createdAt: createdAt instanceof Date ? createdAt.toISOString() : String(createdAt),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Returns up to 20 active orders for a user.
   * Active orders are those with status other than 'delivered' or 'cancelled'.
   *
   * @param userId - The user's UUID
   * @returns Array of up to 20 active orders
   */
  async getActiveOrders(userId: string): Promise<Order[]> {
    const ordersResult = await this.pool.query(
      `SELECT id, user_id, order_number, status, subtotal, delivery_fee, discount, grand_total,
              delivery_address, scheduled_delivery_start, scheduled_delivery_end,
              estimated_arrival, reschedule_count, promo_code, created_at, updated_at
       FROM "order"
       WHERE user_id = $1
         AND status NOT IN ($2, $3)
       ORDER BY created_at DESC
       LIMIT $4`,
      [userId, OrderStatus.Delivered, OrderStatus.Cancelled, MAX_ACTIVE_ORDERS],
    );

    const orders: Order[] = [];

    for (const row of ordersResult.rows) {
      // Get order items
      const itemsResult = await this.pool.query(
        `SELECT oi.id, oi.product_id, oi.quantity, oi.unit_price_at_purchase, oi.subtotal,
                p.name as product_name
         FROM order_item oi
         JOIN product p ON oi.product_id = p.id
         WHERE oi.order_id = $1`,
        [row.id],
      );

      const items: OrderItem[] = itemsResult.rows.map((itemRow) => ({
        id: itemRow.id,
        productId: itemRow.product_id,
        productName: itemRow.product_name,
        quantity: itemRow.quantity,
        unitPriceAtPurchase: parseFloat(itemRow.unit_price_at_purchase),
        subtotal: parseFloat(itemRow.subtotal),
      }));

      orders.push({
        id: row.id,
        userId: row.user_id,
        orderNumber: row.order_number,
        status: row.status as OrderStatus,
        items,
        subtotal: parseFloat(row.subtotal),
        deliveryFee: parseFloat(row.delivery_fee),
        discount: parseFloat(row.discount),
        grandTotal: parseFloat(row.grand_total),
        deliveryAddress: row.delivery_address,
        scheduledDeliveryStart: row.scheduled_delivery_start
          ? (row.scheduled_delivery_start instanceof Date
            ? row.scheduled_delivery_start.toISOString()
            : String(row.scheduled_delivery_start))
          : '',
        scheduledDeliveryEnd: row.scheduled_delivery_end
          ? (row.scheduled_delivery_end instanceof Date
            ? row.scheduled_delivery_end.toISOString()
            : String(row.scheduled_delivery_end))
          : '',
        estimatedArrival: row.estimated_arrival
          ? (row.estimated_arrival instanceof Date
            ? row.estimated_arrival.toISOString()
            : String(row.estimated_arrival))
          : null,
        rescheduleCount: row.reschedule_count,
        promoCode: row.promo_code || null,
        createdAt: row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
        updatedAt: row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : String(row.updated_at),
      });
    }

    return orders;
  }

  /**
   * Verifies stock availability for all items in the cart.
   * Throws a 409 error if any item has insufficient stock.
   */
  private async verifyStockForAllItems(cart: Cart): Promise<void> {
    const unavailableItems: { productId: string; productName: string; requested: number; available: number }[] = [];

    for (const item of cart.items) {
      const productResult = await this.pool.query(
        'SELECT stock_quantity, is_available FROM product WHERE id = $1',
        [item.productId],
      );

      if (productResult.rows.length === 0) {
        unavailableItems.push({
          productId: item.productId,
          productName: item.productName,
          requested: item.quantity,
          available: 0,
        });
        continue;
      }

      const product = productResult.rows[0];

      if (!product.is_available || product.stock_quantity < item.quantity) {
        unavailableItems.push({
          productId: item.productId,
          productName: item.productName,
          requested: item.quantity,
          available: product.stock_quantity,
        });
      }
    }

    if (unavailableItems.length > 0) {
      throw new AppError(
        409,
        ErrorCode.StockInsufficient,
        'Some items in your cart are no longer available in the requested quantity',
        unavailableItems.map((item) => ({
          field: item.productId,
          message: `${item.productName}: requested ${item.requested}, available ${item.available}`,
        })),
      );
    }
  }

  /**
   * Processes a payment (placeholder implementation).
   * Simulates payment processing with a high success rate.
   *
   * @param paymentDto - Payment method and details
   * @returns PaymentResult indicating success or failure
   */
  private async processPayment(paymentDto: PaymentDto): Promise<PaymentResult> {
    // Validate payment method
    const validMethods = ['credit_debit_card', 'digital_wallet'];
    if (!validMethods.includes(paymentDto.paymentMethod)) {
      return {
        success: false,
        failureReason: `Unsupported payment method: ${paymentDto.paymentMethod}`,
      };
    }

    // Placeholder: simulate payment processing
    // In production, this would integrate with a payment gateway
    console.log(`[Payment] Processing ${paymentDto.paymentMethod} payment...`);

    // Simulate a 90% success rate for testing purposes
    const isSuccessful = Math.random() > 0.1;

    if (isSuccessful) {
      console.log('[Payment] Payment processed successfully');
      return { success: true };
    }

    console.log('[Payment] Payment failed - simulated failure');
    return {
      success: false,
      failureReason: 'Payment declined by provider',
    };
  }

  /**
   * Sends an order confirmation email using the EmailService.
   * Runs asynchronously and does not block the order confirmation response.
   * Falls back gracefully if email service is unavailable.
   *
   * @param userId - The user's UUID
   * @param orderNumber - The generated order number
   * @param cart - The cart at time of order
   * @param costBreakdown - The cost breakdown
   * @param deliveryAddress - The delivery address
   */
  private sendConfirmationEmail(
    userId: string,
    orderNumber: string,
    cart: Cart,
    costBreakdown: CostBreakdown,
    deliveryAddress: string,
  ): void {
    // Fire-and-forget async operation (non-blocking)
    const sendAsync = async () => {
      try {
        const result = await this.pool.query(
          'SELECT email FROM user_profile WHERE id = $1',
          [userId],
        );

        if (result.rows.length === 0) {
          console.error(`[OrderService] Cannot send confirmation email: user ${userId} not found`);
          return;
        }

        const userEmail = result.rows[0].email;

        await this.emailService.sendOrderConfirmationEmail({
          to: userEmail,
          orderNumber,
          items: cart.items.map((item) => ({
            name: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
          })),
          subtotal: costBreakdown.subtotal,
          deliveryFee: costBreakdown.deliveryFee,
          discount: costBreakdown.discount,
          grandTotal: costBreakdown.grandTotal,
          deliverySlot: null,
          deliveryAddress,
        });
      } catch (error) {
        // Graceful fallback: log and continue, don't block the operation
        console.error(
          `[OrderService] Failed to send confirmation email for order ${orderNumber}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    };

    sendAsync();
  }
}
