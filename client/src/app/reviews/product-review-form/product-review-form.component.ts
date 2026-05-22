import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  inject,
} from '@angular/core';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
  AbstractControl,
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, takeUntil } from 'rxjs';
import { ReviewService, ProductReview } from '../review.service';

/** Minimum and maximum comment length as per Requirement 5.4 */
const COMMENT_MIN_LENGTH = 10;
const COMMENT_MAX_LENGTH = 500;

/**
 * ProductReviewFormComponent
 *
 * Allows a buyer to submit a star rating (1–5) and text comment for a product
 * they have purchased. Handles:
 *   - Star rating input with hover/click interaction
 *   - Comment validation (10–500 chars) with live character counter
 *   - 403 error: buyer hasn't purchased the product (Requirement 5.2)
 *   - 409 error: duplicate review (Requirement 5.3)
 *   - Success confirmation on submission (Requirement 5.6)
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */
@Component({
  selector: 'app-product-review-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './product-review-form.component.html',
  styleUrl: './product-review-form.component.scss',
})
export class ProductReviewFormComponent implements OnInit, OnDestroy {
  /** The product ID to review. Required input. */
  @Input({ required: true }) productId!: string;

  /** Emitted when a review is successfully submitted. */
  @Output() reviewSubmitted = new EventEmitter<ProductReview>();

  private readonly fb = inject(FormBuilder);
  private readonly reviewService = inject(ReviewService);
  private readonly destroy$ = new Subject<void>();

  reviewForm!: FormGroup;

  /** Currently hovered star index (1–5), used for hover highlight. */
  hoveredStar = 0;

  /** Submission state flags */
  submitting = false;
  submitted = false;

  /** Error messages for specific HTTP error scenarios */
  errorMessage = '';

  readonly commentMinLength = COMMENT_MIN_LENGTH;
  readonly commentMaxLength = COMMENT_MAX_LENGTH;

  /** Star values for template iteration */
  readonly stars = [1, 2, 3, 4, 5];

  ngOnInit(): void {
    this.reviewForm = this.fb.group({
      rating: [0, [Validators.required, Validators.min(1), Validators.max(5)]],
      comment: [
        '',
        [
          Validators.required,
          Validators.minLength(COMMENT_MIN_LENGTH),
          Validators.maxLength(COMMENT_MAX_LENGTH),
        ],
      ],
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Star Rating Helpers ────────────────────────────────────────────────────

  get selectedRating(): number {
    return this.reviewForm.get('rating')?.value as number ?? 0;
  }

  /**
   * Returns true if the star at `index` should be filled (highlighted).
   * Uses hovered star when hovering, otherwise uses the selected rating.
   */
  isStarFilled(index: number): boolean {
    const active = this.hoveredStar > 0 ? this.hoveredStar : this.selectedRating;
    return index <= active;
  }

  onStarHover(star: number): void {
    this.hoveredStar = star;
  }

  onStarLeave(): void {
    this.hoveredStar = 0;
  }

  onStarClick(star: number): void {
    this.reviewForm.get('rating')?.setValue(star);
    this.reviewForm.get('rating')?.markAsTouched();
  }

  // ─── Comment Helpers ────────────────────────────────────────────────────────

  get commentControl(): AbstractControl {
    return this.reviewForm.get('comment')!;
  }

  get commentLength(): number {
    return (this.commentControl.value as string)?.length ?? 0;
  }

  get commentLengthClass(): string {
    if (this.commentLength > COMMENT_MAX_LENGTH) return 'over-limit';
    if (this.commentLength >= COMMENT_MAX_LENGTH - 50) return 'near-limit';
    return '';
  }

  // ─── Form Submission ────────────────────────────────────────────────────────

  onSubmit(): void {
    if (this.reviewForm.invalid || this.submitting) {
      this.reviewForm.markAllAsTouched();
      return;
    }

    this.submitting = true;
    this.errorMessage = '';

    const { rating, comment } = this.reviewForm.value as { rating: number; comment: string };

    this.reviewService
      .createReview({
        productId: this.productId,
        rating,
        comment: comment.trim(),
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (review) => {
          this.submitting = false;
          this.submitted = true;
          this.reviewSubmitted.emit(review);
        },
        error: (err: HttpErrorResponse) => {
          this.submitting = false;
          this.handleSubmitError(err);
        },
      });
  }

  private handleSubmitError(err: HttpErrorResponse): void {
    switch (err.status) {
      case 403:
        // Requirement 5.2: buyer hasn't purchased the product
        this.errorMessage =
          'You can only review products you have purchased and received.';
        break;
      case 409:
        // Requirement 5.3: duplicate review
        this.errorMessage = 'You have already submitted a review for this product.';
        break;
      case 400:
        // Requirement 5.5: validation error from backend
        this.errorMessage =
          err.error?.error?.message ??
          'Please check your rating and comment and try again.';
        break;
      case 404:
        this.errorMessage = 'Product not found. Please refresh and try again.';
        break;
      default:
        this.errorMessage = 'An unexpected error occurred. Please try again.';
        break;
    }
  }

  /** Reset the form to allow submitting another review (e.g., after navigating). */
  resetForm(): void {
    this.reviewForm.reset({ rating: 0, comment: '' });
    this.submitted = false;
    this.errorMessage = '';
    this.hoveredStar = 0;
  }
}
