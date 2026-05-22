import { ErrorDetail } from '@shared/errors';

/**
 * DTO for creating a new product review.
 */
export interface CreateReviewDto {
  productId: string;
  rating: number;
  comment: string;
}

/**
 * Represents a product review returned from the service.
 */
export interface ProductReview {
  id: string;
  productId: string;
  userId: string;
  rating: number;
  comment: string;
  isFake?: boolean;
  fakeProbability?: number;
  imageVerified?: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Represents a product review with reviewer name for display.
 */
export interface ProductReviewWithReviewer extends ProductReview {
  reviewerName: string;
}

/**
 * Aggregated review summary for a product.
 */
export interface ReviewSummary {
  averageRating: number;
  totalReviews: number;
  ratingDistribution: Record<1 | 2 | 3 | 4 | 5, number>;
  nlpSummary?: {
    summaryText: string;
    productQuality: string;
    sellerCredibility: string;
    customerSatisfaction: string;
  };
}

/** Validation constants for review fields */
export const REVIEW_RATING_MIN = 1;
export const REVIEW_RATING_MAX = 5;
export const REVIEW_COMMENT_MIN_LENGTH = 10;
export const REVIEW_COMMENT_MAX_LENGTH = 500;
export const REVIEWS_PER_PAGE = 10;

/**
 * Validates a CreateReviewDto and returns an array of field-level errors.
 * Returns an empty array if all fields are valid.
 */
export function validateCreateReviewDto(dto: CreateReviewDto): ErrorDetail[] {
  const errors: ErrorDetail[] = [];

  // productId: required, non-empty string
  if (!dto.productId || typeof dto.productId !== 'string' || dto.productId.trim().length === 0) {
    errors.push({ field: 'productId', message: 'Product ID is required' });
  }

  // rating: integer between 1 and 5
  if (dto.rating == null || typeof dto.rating !== 'number' || isNaN(dto.rating)) {
    errors.push({ field: 'rating', message: 'Rating is required and must be a number' });
  } else {
    if (!Number.isInteger(dto.rating)) {
      errors.push({ field: 'rating', message: 'Rating must be a whole number' });
    }
    if (dto.rating < REVIEW_RATING_MIN || dto.rating > REVIEW_RATING_MAX) {
      errors.push({
        field: 'rating',
        message: `Rating must be between ${REVIEW_RATING_MIN} and ${REVIEW_RATING_MAX}`,
      });
    }
  }

  // comment: 10–500 characters after trimming
  if (!dto.comment || typeof dto.comment !== 'string') {
    errors.push({ field: 'comment', message: 'Comment is required' });
  } else {
    const trimmed = dto.comment.trim();
    if (trimmed.length < REVIEW_COMMENT_MIN_LENGTH) {
      errors.push({
        field: 'comment',
        message: `Comment must be at least ${REVIEW_COMMENT_MIN_LENGTH} characters`,
      });
    } else if (trimmed.length > REVIEW_COMMENT_MAX_LENGTH) {
      errors.push({
        field: 'comment',
        message: `Comment must be at most ${REVIEW_COMMENT_MAX_LENGTH} characters`,
      });
    }
  }

  return errors;
}
