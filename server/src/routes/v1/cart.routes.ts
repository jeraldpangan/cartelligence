import { Router, Response, NextFunction } from 'express';
import { SmartCartService } from '../../services/cart.service';
import {
  validateBody,
  cartItemSchema,
  quantityUpdateSchema,
} from '../../middleware/validation';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth';

const router = Router();
const cartService = new SmartCartService();

/**
 * GET /api/v1/cart/
 * Get current cart contents with full cost breakdown.
 * Requirements: 3.4, 5.2, 10.2
 */
router.get(
  '/',
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      console.log(`[DEBUG] GET /api/v1/cart/ for user ${userId}`);
      const cart = await cartService.getCart(userId);
      console.log(`[DEBUG] Cart loaded successfully for user ${userId}`);
      res.status(200).json({ data: cart });
    } catch (err) {
      console.error(`[DEBUG] Error in GET /api/v1/cart/:`, err);
      next(err);
    }
  },
);

/**
 * POST /api/v1/cart/items
 * Add an item to the cart.
 * Requirements: 3.1, 3.6, 10.2
 */
router.post(
  '/items',
  authenticate,
  validateBody(cartItemSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const { productId, quantity } = req.body;
      const cart = await cartService.addItem(userId, productId, quantity);
      res.status(201).json({ data: cart });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/cart/items/:id
 * Update the quantity of a cart item.
 * Requirements: 3.3, 3.7, 10.2
 */
router.patch(
  '/items/:id',
  authenticate,
  validateBody(quantityUpdateSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const itemId = req.params.id as string;
      const { quantity } = req.body;
      const cart = await cartService.updateQuantity(userId, itemId, quantity);
      res.status(200).json({ data: cart });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/cart/items/:id
 * Remove an item from the cart.
 * Requirements: 3.2, 10.2
 */
router.delete(
  '/items/:id',
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const itemId = req.params.id as string;
      const cart = await cartService.removeItem(userId, itemId);
      res.status(200).json({ data: cart });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
