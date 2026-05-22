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

/**
 * POST /api/v1/recommendations/survey
 * Saves the user shopping preferences survey (budget, preferred categories).
 * Requirements: A. Hybrid Recommendation Algorithm
 */
router.post(
  '/survey',
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const { budget, preferredCategories, browsingHistory } = req.body;

      if (budget == null || isNaN(parseFloat(budget)) || parseFloat(budget) < 0) {
        return res.status(400).json({ error: 'Valid weekly budget is required' });
      }
      if (!Array.isArray(preferredCategories) || preferredCategories.length === 0) {
        return res.status(400).json({ error: 'At least one preferred category is required' });
      }

      await recommendationService.saveUserSurvey(
        userId,
        parseFloat(budget),
        preferredCategories,
        browsingHistory || []
      );

      return res.status(200).json({
        data: { message: 'Preferences survey saved successfully' }
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/recommendations/survey
 * Retrieves the current user preference survey.
 */
router.get(
  '/survey',
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const survey = await recommendationService.getUserSurvey(userId);

      return res.status(200).json({
        data: survey
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/recommendations/hybrid
 * Computes high-accuracy hybrid recommendations based on survey budget, categories,
 * similarity, reviews, and seller reliability.
 * Requirements: A. Hybrid Recommendation Algorithm
 */
router.get(
  '/hybrid',
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const result = await recommendationService.getHybridRecommendations(userId, limit);

      if (result.products === null) {
        return res.status(200).json({
          data: { products: [], status: 'unavailable' }
        });
      }

      return res.status(200).json({
        data: { products: result.products, status: result.status }
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/recommendations/track-click
 * Tracks a product click/view to update the user's browsing history.
 * This feeds into the hybrid recommendation algorithm for real-time personalization.
 * Fire-and-forget pattern — returns immediately and processes asynchronously.
 * Requirements: A. Hybrid Recommendation Algorithm (Real-time Browsing Signal)
 */
router.post(
  '/track-click',
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const { productId, category } = req.body;

      if (!productId) {
        return res.status(400).json({ error: 'productId is required' });
      }

      // Fire-and-forget: don't await the tracking, respond immediately
      recommendationService.trackProductClick(userId, productId, category).catch((err) => {
        console.error('Background click tracking error:', err);
      });

      return res.status(200).json({
        data: { message: 'Click tracked' }
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

