import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PaginatedResponse } from '@shared/interfaces';

/** A product review returned from the API. */
export interface ProductReview {
  id: string;
  productId: string;
  userId: string;
  reviewerName: string;
  rating: number;
  comment: string;
  createdAt: string;
  isFake?: boolean;
  fakeProbability?: number;
  imageVerified?: boolean;
}

/** Review summary aggregation for a product. */
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

/** DTO for submitting a new review. */
export interface CreateReviewDto {
  productId: string;
  rating: number;
  comment: string;
}

export interface FakeReviewDetectionResult {
  data: {
    isFake: boolean;
    probability: number;
    reason: string[];
  };
}

const API_BASE = '/api/v1/reviews';

@Injectable({ providedIn: 'root' })
export class ReviewService {
  constructor(private readonly http: HttpClient) {}

  /**
   * Submit a new product review.
   * Requires buyer role (enforced by backend).
   * Returns 201 on success, 403 if not purchased, 409 if duplicate.
   */
  createReview(dto: CreateReviewDto): Observable<ProductReview> {
    return this.http.post<ProductReview>(API_BASE, dto);
  }

  /**
   * Get paginated reviews for a product (public endpoint).
   */
  getProductReviews(
    productId: string,
    page = 1,
  ): Observable<PaginatedResponse<ProductReview>> {
    const params = new HttpParams().set('page', page.toString());
    return this.http.get<PaginatedResponse<ProductReview>>(
      `${API_BASE}/product/${productId}`,
      { params },
    );
  }

  /**
   * Get review summary (average rating, distribution) for a product (public endpoint).
   */
  getProductReviewSummary(productId: string): Observable<ReviewSummary> {
    return this.http.get<ReviewSummary>(
      `${API_BASE}/product/${productId}/summary`,
    );
  }

  /**
   * Delete the authenticated buyer's own review.
   */
  deleteReview(reviewId: string): Observable<void> {
    return this.http.delete<void>(`${API_BASE}/${reviewId}`);
  }

  /**
   * Ad-hoc check to see if a review is fake.
   */
  checkFakeReview(text: string, hasImage: boolean = false): Observable<FakeReviewDetectionResult> {
    return this.http.post<FakeReviewDetectionResult>(`${API_BASE}/check-fake`, { text, hasImage });
  }
}
