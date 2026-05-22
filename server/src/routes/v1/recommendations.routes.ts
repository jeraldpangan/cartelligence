import { Router, Response, NextFunction } from 'express';
import { RecommendationService } from '../../services/recommendation.service';
import { SmartCartService } from '../../services/cart.service';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth';

const router = Router();
const recommendationService = new RecommendationService();
const cartService = new SmartCartService();

/**
 * GET /api/v1/recommendations/personalized
 * Returns personalized product recommendations (up to 10) based on purchase history.
 * Falls back to top-selling products if user has no orders or engine is unavailable.
 * Requirements: 4.1, 4.6, 4.7, 10.2
 */
router.get(
  '/personalized',
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const result = await recommendationService.getPersonalized(userId);

      // Engine unavailable — products is null
      if (result.products === null) {
        // Try fallback
        const fallback = await recommendationService.getFallback();
        if (fallback.products === null) {
          return res.status(200).json({
            data: { products: null, recommendations_status: 'unavailable' },
          });
        }
        return res.status(200).json({
          data: { products: fallback.products, status: 'fallback' },
        });
      }

      // User has no orders — return fallback (popular products)
      if (result.products.length === 0 && result.status === 'No previous orders found') {
        const fallback = await recommendationService.getFallback();
        if (fallback.products === null) {
          return res.status(200).json({
            data: { products: null, recommendations_status: 'unavailable' },
          });
        }
        return res.status(200).json({
          data: { products: fallback.products, status: 'fallback' },
        });
      }

      return res.status(200).json({
        data: { products: result.products, status: result.status },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/recommendations/cart-based
 * Returns cart-based product suggestions (up to 5) based on co-purchase patterns.
 * Requires at least 3 items in the user's current cart.
 * Requirements: 3.5, 10.2
 */
router.get(
  '/cart-based',
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;

      // Get the user's current cart items
      const cart = await cartService.getCart(userId);
      const cartItems = cart.items.map((item) => ({ productId: item.productId }));

      const result = await recommendationService.getCartBased(cartItems);

      // Engine unavailable — products is null
      if (result.products === null) {
        return res.status(200).json({
          data: { products: null, recommendations_status: 'unavailable' },
        });
      }

      return res.status(200).json({
        data: { products: result.products, status: result.status },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/recommendations/product/:id/related
 * Returns up to 5 related products based on category affinity and purchase correlation.
 * Requirements: 4.3, 10.2
 */
router.get(
  '/product/:id/related',
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const productId = req.params.id as string;
      const result = await recommendationService.getRelated(productId);

      // Engine unavailable — products is null
      if (result.products === null) {
        return res.status(200).json({
          data: { products: null, recommendations_status: 'unavailable' },
        });
      }

      return res.status(200).json({
        data: { products: result.products, status: result.status },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/recommendations/dismiss/:productId
 * Dismisses a recommendation for 30 days.
 * Requirements: 4.5, 10.2
 */
router.post(
  '/dismiss/:productId',
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const productId = req.params.productId as string;

      await recommendationService.dismissRecommendation(userId, productId);

      return res.status(200).json({
        data: { message: 'Recommendation dismissed successfully' },
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
