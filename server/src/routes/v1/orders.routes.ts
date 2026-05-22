import { Router, Response, NextFunction } from 'express';
import { OrderService } from '../../services/order.service';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth';
import { validateBody, orderConfirmSchema } from '../../middleware/validation';
import { getDatabasePool } from '../../config/database';
import { Order, OrderItem } from '@shared/interfaces';
import { OrderStatus } from '@shared/enums';
import { MAX_ACTIVE_ORDERS } from '@shared/validation';

const router = Router();
const orderService = new OrderService();

/**
 * POST /api/v1/orders/checkout
 * Initiate checkout — validates cart, verifies stock, returns summary.
 * Requirements: 7.1, 10.2
 */
router.post(
  '/checkout',
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const summary = await orderService.initiateCheckout(userId);
      res.status(200).json({ data: summary });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/orders/confirm
 * Confirm order and process payment.
 * Body: { paymentMethod, paymentDetails, deliverySlotId?, retryCount? }
 * Requirements: 7.2, 10.2, 10.8
 */
router.post(
  '/confirm',
  authenticate,
  validateBody(orderConfirmSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const { paymentMethod, paymentDetails, deliverySlotId, retryCount } = req.body;

      const paymentDto = { paymentMethod, paymentDetails };
      const confirmation = await orderService.confirmOrder(
        userId,
        paymentDto,
        retryCount || 0,
      );

      // If a delivery slot was selected, reserve it
      if (deliverySlotId) {
        const { DeliveryService } = await import('../../services/delivery.service');
        const deliveryService = new DeliveryService();
        await deliveryService.reserveSlot(confirmation.orderId, deliverySlotId);
      }

      res.status(201).json({ data: confirmation });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/orders/active
 * Get active orders (up to 20) for the authenticated user.
 * Requirements: 7.1, 10.2
 */
router.get(
  '/active',
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const orders = await orderService.getActiveOrders(userId);
      res.status(200).json({ data: orders });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/orders/:id
 * Get a single order by ID for the authenticated user.
 * Requirements: 7.1, 10.2
 */
router.get(
  '/:id',
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const orderId = req.params.id;
      const pool = getDatabasePool();

      const orderResult = await pool.query(
        `SELECT id, user_id, order_number, status, subtotal, delivery_fee, discount, grand_total,
                delivery_address, scheduled_delivery_start, scheduled_delivery_end,
                estimated_arrival, reschedule_count, promo_code, created_at, updated_at
         FROM "order"
         WHERE id = $1 AND user_id = $2`,
        [orderId, userId],
      );

      if (orderResult.rows.length === 0) {
        res.status(404).json({ message: 'Order not found' });
        return;
      }

      const row = orderResult.rows[0];

      // Get order items
      const itemsResult = await pool.query(
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

      const order: Order = {
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
      };

      res.status(200).json({ data: order });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/orders/
 * List user's orders with pagination.
 * Query params: page (default 1), limit (default 20)
 * Requirements: 7.1, 10.2
 */
router.get(
  '/',
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(
        MAX_ACTIVE_ORDERS,
        Math.max(1, parseInt(req.query.limit as string, 10) || 20),
      );
      const offset = (page - 1) * limit;
      const pool = getDatabasePool();

      // Get total count
      const countResult = await pool.query(
        'SELECT COUNT(*) as total FROM "order" WHERE user_id = $1',
        [userId],
      );
      const total = parseInt(countResult.rows[0].total, 10);

      // Get paginated orders
      const ordersResult = await pool.query(
        `SELECT id, user_id, order_number, status, subtotal, delivery_fee, discount, grand_total,
                delivery_address, scheduled_delivery_start, scheduled_delivery_end,
                estimated_arrival, reschedule_count, promo_code, created_at, updated_at
         FROM "order"
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset],
      );

      const orders: Order[] = [];

      for (const row of ordersResult.rows) {
        const itemsResult = await pool.query(
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

      res.status(200).json({
        data: orders,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
