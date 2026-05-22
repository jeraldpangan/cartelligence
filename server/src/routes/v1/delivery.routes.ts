import { Router, Response, NextFunction } from 'express';
import { DeliveryService } from '../../services/delivery.service';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth';
import { validateBody, deliveryRescheduleSchema } from '../../middleware/validation';

const router = Router();
const deliveryService = new DeliveryService();

/**
 * GET /api/v1/delivery/slots
 * Get available delivery slots for a given date (or next 3 days if no date specified).
 * Query params: date (optional, format YYYY-MM-DD)
 * Requirements: 9.1, 10.2
 */
router.get(
  '/slots',
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const dateParam = req.query.date as string | undefined;
      let date: Date | null = null;

      if (dateParam) {
        date = new Date(dateParam);
        if (isNaN(date.getTime())) {
          res.status(400).json({
            message: 'Invalid date format. Use YYYY-MM-DD.',
          });
          return;
        }
      }

      const slots = await deliveryService.getAvailableSlots(date);
      res.status(200).json({ data: slots });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/delivery/orders/:id/reschedule
 * Reschedule delivery for an order.
 * Body: { newSlotId }
 * Requirements: 9.5, 10.2, 10.8
 */
router.post(
  '/orders/:id/reschedule',
  authenticate,
  validateBody(deliveryRescheduleSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const orderId = req.params.id;
      const { newSlotId } = req.body;

      await deliveryService.reschedule(orderId, newSlotId);
      res.status(200).json({ data: { message: 'Delivery rescheduled successfully' } });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
