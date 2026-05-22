import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireRole, AuthenticatedRequest } from '../../middleware/auth';
import { ReviewService } from '../../services/review.service';
import { CreateReviewDto } from '../../services/review.dto';
import { UserRole } from '@shared/enums';
import { AppError } from '../../middleware/errorHandler';
import { ErrorCode } from '@shared/errors';

const router = Router();
const reviewService = new ReviewService();

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
 * POST /api/v1/reviews
 * Submit a product review.
 * Requires authentication and buyer role.
 * Body: { productId, rating, comment }
 * Requirements: 5.1, 5.4
 */
router.post(
  '/',
  authenticate,
  requireRole(UserRole.Buyer),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const dto: CreateReviewDto = {
        productId: req.body.productId,
        rating: typeof req.body.rating === 'string' ? parseInt(req.body.rating, 10) : req.body.rating,
        comment: req.body.comment,
      };

      const review = await reviewService.createReview(userId, dto);

      res.status(201).json({ data: review });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/v1/reviews/product/:productId
 * Get paginated reviews for a product (public).
 * Query params: page (default 1)
 * Requirements: 6.1, 6.5
 */
router.get(
  '/product/:productId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const productId = String(req.params.productId);

      validateUuidParam(productId, 'productId');

      const page = parseInt(req.query.page as string, 10) || 1;

      const result = await reviewService.getProductReviews(productId, page);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/v1/reviews/product/:productId/summary
 * Get review summary (average rating, total count, distribution) for a product (public).
 * Requirements: 6.1, 6.5
 */
router.get(
  '/product/:productId/summary',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const productId = String(req.params.productId);

      validateUuidParam(productId, 'productId');

      const summary = await reviewService.getProductReviewSummary(productId);

      res.status(200).json({ data: summary });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * DELETE /api/v1/reviews/:id
 * Delete own review.
 * Requires authentication and buyer role.
 * Requirements: 5.4
 */
router.delete(
  '/:id',
  authenticate,
  requireRole(UserRole.Buyer),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const reviewId = String(req.params.id);

      validateUuidParam(reviewId, 'id');

      await reviewService.deleteReview(userId, reviewId);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

export default router;
