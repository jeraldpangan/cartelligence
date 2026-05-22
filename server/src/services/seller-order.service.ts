import { Pool } from 'pg';
import { getDatabasePool } from '../config/database';
import { Order, OrderItem, PaginatedResponse } from '@shared/interfaces';
import { OrderStatus } from '@shared/enums';
import { ErrorCode } from '@shared/errors';
import { AppError } from '../middleware/errorHandler';
import { OrderNotificationService } from './order-notification.service';
import { SellerPerformanceService } from './seller-performance.service';

/** Number of orders per page for seller order listings */
const SELLER_ORDERS_PER_PAGE = 20;

/**
 * Valid order status transitions for the seller order state machine.
 *
 * confirmed → {being_prepared, cancelled}
 * being_prepared → {out_for_delivery, cancelled}
 * out_for_delivery → {delivered}
 * delivered → {} (terminal)
 * cancelled → {} (terminal)
 */
export const VALID_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.Confirmed]: [OrderStatus.BeingPrepared, OrderStatus.Cancelled],
  [OrderStatus.BeingPrepared]: [OrderStatus.OutForDelivery, OrderStatus.Cancelled],
  [OrderStatus.OutForDelivery]: [OrderStatus.Delivered],
  [OrderStatus.Delivered]: [],
  [OrderStatus.Cancelled]: [],
};

/**
 * WebSocket server interface for emitting order status events.
 * Accepts any object with a `to().emit()` pattern (Socket.IO compatible).
 * @deprecated Use OrderNotificationService directly instead.
 */
export interface WsServer {
  to(room: string): { emit(event: string, data: unknown): void };
}

/**
 * SellerOrderService
 *
 * Provides order management operations for sellers including:
 * - Paginated listing of orders containing the seller's products
 * - Order detail retrieval with ownership verification
 * - Order status updates with state machine validation and WebSocket notifications
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8
 */
export class SellerOrderService {
  private pool: Pool;
  private notificationService: OrderNotificationService | null;
  private sellerPerformanceService: SellerPerformanceService;

  constructor(
    pool?: Pool,
    notificationService?: OrderNotificationService | null,
    sellerPerformanceService?: SellerPerformanceService,
  ) {
    this.pool = pool || getDatabasePool();
    this.notificationService = notificationService ?? null;
    this.sellerPerformanceService =
      sellerPerformanceService || new SellerPerformanceService(this.pool);
  }

  /**
   * Returns a paginated list of orders containing at least one product
   * owned by the specified seller.
   *
   * Preconditions:
   * - sellerId corresponds to a user with role 'seller'
   * - page is a positive integer (defaults to 1)
   *
   * Postconditions:
   * - Only returns orders that contain at least one product with seller_id = sellerId
   * - Orders containing exclusively other sellers' products are NOT included
   * - Paginated at 20 orders per page, ordered by creation date descending
   *
   * Requirements: 4.1, 4.2
   */
  async getSellerOrders(
    sellerId: string,
    page: number = 1,
  ): Promise<PaginatedResponse<Order>> {
    const validPage = Math.max(1, Math.floor(page));
    const offset = (validPage - 1) * SELLER_ORDERS_PER_PAGE;

    // Count total orders containing at least one of this seller's products
    const countResult = await this.pool.query(
      `SELECT COUNT(DISTINCT o.id) as total
       FROM "order" o
       JOIN order_item oi ON oi.order_id = o.id
       JOIN product p ON p.id = oi.product_id
       WHERE p.seller_id = $1`,
      [sellerId],
    );
    const totalItems = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(totalItems / SELLER_ORDERS_PER_PAGE);

    // Get paginated order IDs
    const orderIdsResult = await this.pool.query(
      `SELECT DISTINCT o.id, o.created_at
       FROM "order" o
       JOIN order_item oi ON oi.order_id = o.id
       JOIN product p ON p.id = oi.product_id
       WHERE p.seller_id = $1
       ORDER BY o.created_at DESC
       LIMIT $2 OFFSET $3`,
      [sellerId, SELLER_ORDERS_PER_PAGE, offset],
    );

    if (orderIdsResult.rows.length === 0) {
      return {
        data: [],
        page: validPage,
        pageSize: SELLER_ORDERS_PER_PAGE,
        totalItems,
        totalPages,
      };
    }

    const orderIds = orderIdsResult.rows.map((row) => row.id);

    // Fetch full order details for these IDs
    const orders = await this.fetchOrdersByIds(orderIds);

    return {
      data: orders,
      page: validPage,
      pageSize: SELLER_ORDERS_PER_PAGE,
      totalItems,
      totalPages,
    };
  }

  /**
   * Returns full order detail after verifying the order contains
   * at least one product owned by the seller.
   *
   * Preconditions:
   * - sellerId corresponds to a user with role 'seller'
   * - orderId references an existing order
   *
   * Postconditions:
   * - Returns the complete Order object if it contains seller's product(s)
   * - Throws 404 if order doesn't exist or doesn't contain seller's products
   *
   * Requirements: 4.1, 4.3
   */
  async getOrderDetail(sellerId: string, orderId: string): Promise<Order> {
    // Verify order exists and contains at least one of this seller's products
    const ownershipCheck = await this.pool.query(
      `SELECT DISTINCT o.id
       FROM "order" o
       JOIN order_item oi ON oi.order_id = o.id
       JOIN product p ON p.id = oi.product_id
       WHERE o.id = $1 AND p.seller_id = $2`,
      [orderId, sellerId],
    );

    if (ownershipCheck.rows.length === 0) {
      throw new AppError(404, ErrorCode.NotFound, 'Order not found');
    }

    const orders = await this.fetchOrdersByIds([orderId]);
    return orders[0];
  }

  /**
   * Updates the status of an order after verifying seller ownership
   * and validating the state transition.
   *
   * Preconditions:
   * - sellerId corresponds to a user with role 'seller'
   * - orderId references an order containing at least one product owned by sellerId
   * - newStatus is a valid OrderStatus enum value
   * - Status transition is valid per the state machine
   *
   * Postconditions:
   * - Order status is updated in the database
   * - WebSocket event `order:status` is emitted to the buyer (if wsServer is available)
   * - Returns the updated Order object
   * - If transition is invalid, throws AppError(400)
   * - If order doesn't belong to seller, throws AppError(403)
   *
   * Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 4.8
   */
  async updateOrderStatus(
    sellerId: string,
    orderId: string,
    newStatus: OrderStatus,
  ): Promise<Order> {
    // Step 1: Verify order contains seller's products
    const orderCheck = await this.pool.query(
      `SELECT DISTINCT o.id, o.status, o.user_id
       FROM "order" o
       JOIN order_item oi ON oi.order_id = o.id
       JOIN product p ON p.id = oi.product_id
       WHERE o.id = $1 AND p.seller_id = $2`,
      [orderId, sellerId],
    );

    if (orderCheck.rows.length === 0) {
      throw new AppError(403, ErrorCode.Forbidden, 'Order not found or does not contain your products');
    }

    const order = orderCheck.rows[0];
    const currentStatus = order.status as OrderStatus;

    // Step 2: Validate status transition
    const allowedTransitions = VALID_STATUS_TRANSITIONS[currentStatus];
    if (!allowedTransitions || !allowedTransitions.includes(newStatus)) {
      throw new AppError(
        400,
        ErrorCode.ValidationError,
        `Cannot transition from '${currentStatus}' to '${newStatus}'`,
      );
    }

    // Step 3: Update status in database
    await this.pool.query(
      `UPDATE "order" SET status = $1, updated_at = NOW() WHERE id = $2`,
      [newStatus, orderId],
    );

    // Step 4: Notify buyer via WebSocket (if notification service is available)
    if (this.notificationService) {
      await this.notificationService.notifyOrderStatus(order.user_id, {
        orderId,
        status: newStatus,
        updatedAt: new Date().toISOString(),
      });
    }

    // Reactively trigger seller reliability recalculation on terminal states
    if (newStatus === OrderStatus.Delivered || newStatus === OrderStatus.Cancelled) {
      this.sellerPerformanceService.recalculateSellerReliability(sellerId).catch((err) => {
        console.error('[SellerOrderService] Failed to trigger seller reliability recalculation:', err);
      });
    }

    // Return updated order
    const orders = await this.fetchOrdersByIds([orderId]);
    return orders[0];
  }

  /**
   * Fetches full order details (with items) for a list of order IDs.
   * Preserves the order of IDs passed in.
   */
  private async fetchOrdersByIds(orderIds: string[]): Promise<Order[]> {
    if (orderIds.length === 0) return [];

    // Fetch order records
    const ordersResult = await this.pool.query(
      `SELECT id, user_id, order_number, status, subtotal, delivery_fee, discount, grand_total,
              delivery_address, scheduled_delivery_start, scheduled_delivery_end,
              estimated_arrival, reschedule_count, promo_code, created_at, updated_at
       FROM "order"
       WHERE id = ANY($1::uuid[])
       ORDER BY created_at DESC`,
      [orderIds],
    );

    const orders: Order[] = [];

    for (const row of ordersResult.rows) {
      // Get order items
      const itemsResult = await this.pool.query(
        `SELECT oi.id, oi.product_id, oi.quantity, oi.unit_price_at_purchase, oi.subtotal,
                p.name as product_name
         FROM order_item oi
         JOIN product p ON p.id = oi.product_id
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
}
