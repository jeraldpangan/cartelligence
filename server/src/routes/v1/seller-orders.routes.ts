import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthenticatedRequest, requireRole } from '../../middleware/auth';
import { SellerOrderService } from '../../services/seller-order.service';
import { OrderStatus, UserRole } from '@shared/enums';
import { AppError } from '../../middleware/errorHandler';
import { ErrorCode } from '@shared/errors';

const router = Router();

/** UUID format regex for param validation */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates that a route param is a valid UUID.
 */
function validateUuidParam(id: string, paramName: string): void {
  if (!UUID_REGEX.test(id)) {
    throw new AppError(
      400,
      ErrorCode.ValidationError,
      `Invalid ${paramName} format`,
      [{ field: paramName, message: `${paramName} must be a valid UUID` }],
    );
  }
}

/**
 * Validates that the provided status string is a valid OrderStatus enum value.
 */
function validateOrderStatus(status: unknown): OrderStatus {
  const validStatuses = Object.values(OrderStatus) as string[];
  if (typeof status !== 'string' || !validStatuses.includes(status)) {
    throw new AppError(
      400,
      ErrorCode.ValidationError,
      `Invalid status value. Must be one of: ${validStatuses.join(', ')}`,
      [{ field: 'status', message: `status must be one of: ${validStatuses.join(', ')}` }],
    );
  }
  return status as OrderStatus;
}

/**
 * Lazily resolves the OrderNotificationService from the main app module.
 * This avoids circular imports while still allowing the routes to use the
 * singleton notification service that is wired up in index.ts.
 */
function getNotificationService() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const appModule = require('../../index');
    return appModule.orderNotificationService ?? null;
  } catch {
    return null;
  }
}

// Apply authentication and role middleware to all routes in this router
router.use(authenticate);
router.use(requireRole(UserRole.Seller));

/**
 * GET /api/v1/seller/orders
 * List seller's orders (paginated).
 * Query params: page (default 1)
 * Requirements: 4.1, 4.2
 */
router.get(
  '/',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const sellerId = req.user!.sub;
      const page = parseInt(req.query.page as string, 10) || 1;

      const sellerOrderService = new SellerOrderService(undefined, getNotificationService());
      const result = await sellerOrderService.getSellerOrders(sellerId, page);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/v1/seller/orders/:id
 * Get order detail (ownership verified).
 * Requirements: 4.1, 4.3
 */
router.get(
  '/:id',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const sellerId = req.user!.sub;
      const orderId = String(req.params.id);

      validateUuidParam(orderId, 'id');

      const sellerOrderService = new SellerOrderService(undefined, getNotificationService());
      const order = await sellerOrderService.getOrderDetail(sellerId, orderId);

      res.status(200).json({ data: order });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PATCH /api/v1/seller/orders/:id/status
 * Update order status.
 * Body: { status: OrderStatus }
 * Requirements: 4.3, 4.4, 4.5
 */
router.patch(
  '/:id/status',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const sellerId = req.user!.sub;
      const orderId = String(req.params.id);

      validateUuidParam(orderId, 'id');

      if (req.body.status === undefined || req.body.status === null) {
        throw new AppError(
          400,
          ErrorCode.ValidationError,
          'status is required',
          [{ field: 'status', message: 'status is required' }],
        );
      }

      const newStatus = validateOrderStatus(req.body.status);

      const sellerOrderService = new SellerOrderService(undefined, getNotificationService());
      const order = await sellerOrderService.updateOrderStatus(sellerId, orderId, newStatus);

      res.status(200).json({ data: order });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
