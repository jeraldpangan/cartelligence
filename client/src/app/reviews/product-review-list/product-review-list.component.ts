import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  inject,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { Subject, takeUntil, forkJoin } from 'rxjs';
import { PaginatedResponse } from '@shared/interfaces';
import { ReviewService, ProductReview, ReviewSummary } from '../review.service';

/** Number of reviews per page as per Requirement 6.5 */
const PAGE_SIZE = 10;

/**
 * ProductReviewListComponent
 *
 * Displays a paginated list of product reviews (10/page, newest first) along
 * with a review summary showing average rating, total count, and rating
 * distribution bar chart.
 *
 * Handles the empty state when no reviews exist yet.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
@Component({
  selector: 'app-product-review-list',
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatPaginatorModule,
  ],
  templateUrl: './product-review-list.component.html',
  styleUrl: './product-review-list.component.scss',
})
export class ProductReviewListComponent implements OnInit, OnDestroy, OnChanges {
  /** The product ID whose reviews to display. Required input. */
  @Input({ required: true }) productId!: string;

  private readonly reviewService = inject(ReviewService);
  private readonly destroy$ = new Subject<void>();

  // ─── State ─────────────────────────────────────────────────────────────────

  loading = true;
  error: string | null = null;

  reviews: ProductReview[] = [];
  totalItems = 0;
  currentPage = 1;
  readonly pageSize = PAGE_SIZE;

  summary: ReviewSummary | null = null;

  /** Star values for template iteration */
  readonly stars = [1, 2, 3, 4, 5];

  /** Rating levels for distribution bar chart (descending order for display) */
  readonly ratingLevels = [5, 4, 3, 2, 1] as const;

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['productId'] && !changes['productId'].firstChange) {
      this.currentPage = 1;
      this.loadData();
    }
  }

  // ─── Data Loading ───────────────────────────────────────────────────────────

  loadData(): void {
    this.loading = true;
    this.error = null;

    forkJoin({
      reviews: this.reviewService.getProductReviews(this.productId, this.currentPage),
      summary: this.reviewService.getProductReviewSummary(this.productId),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ reviews, summary }) => {
          this.reviews = reviews.data;
          this.totalItems = reviews.totalItems;
          this.summary = summary;
          this.loading = false;
        },
        error: () => {
          this.error = 'Failed to load reviews. Please try again.';
          this.loading = false;
        },
      });
  }

  loadReviews(): void {
    this.reviewService
      .getProductReviews(this.productId, this.currentPage)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: PaginatedResponse<ProductReview>) => {
          this.reviews = response.data;
          this.totalItems = response.totalItems;
        },
        error: () => {
          this.error = 'Failed to load reviews. Please try again.';
        },
      });
  }

  onPageChange(event: PageEvent): void {
    this.currentPage = event.pageIndex + 1;
    this.loadReviews();
  }

  // ─── Summary Helpers ────────────────────────────────────────────────────────

  /**
   * Returns the percentage width for a rating distribution bar.
   * Returns 0 if there are no reviews.
   */
  getDistributionPercent(level: 1 | 2 | 3 | 4 | 5): number {
    if (!this.summary || this.summary.totalReviews === 0) return 0;
    const count = this.summary.ratingDistribution[level] ?? 0;
    return Math.round((count / this.summary.totalReviews) * 100);
  }

  /**
   * Returns the count of reviews at a given rating level.
   */
  getDistributionCount(level: 1 | 2 | 3 | 4 | 5): number {
    if (!this.summary) return 0;
    return this.summary.ratingDistribution[level] ?? 0;
  }

  // ─── Star Rating Helpers ────────────────────────────────────────────────────

  /**
   * Returns true if the star at `index` should be filled for a given rating.
   * Supports half-star display by checking if index <= floor(rating) for full
   * stars, or index === ceil(rating) for a half star.
   */
  isStarFilled(index: number, rating: number): boolean {
    return index <= Math.floor(rating);
  }

  isStarHalf(index: number, rating: number): boolean {
    return index === Math.ceil(rating) && rating % 1 >= 0.5;
  }

  /**
   * Returns an array of star states ('full' | 'half' | 'empty') for a rating.
   */
  getStarStates(rating: number): Array<'full' | 'half' | 'empty'> {
    return this.stars.map((star) => {
      if (star <= Math.floor(rating)) return 'full';
      if (star === Math.ceil(rating) && rating % 1 >= 0.5) return 'half';
      return 'empty';
    });
  }

  /**
   * Returns the Material icon name for a star state.
   */
  getStarIcon(state: 'full' | 'half' | 'empty'): string {
    switch (state) {
      case 'full': return 'star';
      case 'half': return 'star_half';
      case 'empty': return 'star_border';
    }
  }

  // ─── Track By ───────────────────────────────────────────────────────────────

  trackByReviewId(_index: number, review: ProductReview): string {
    return review.id;
  }
}
