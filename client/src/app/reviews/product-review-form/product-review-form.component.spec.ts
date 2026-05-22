import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ProductReviewFormComponent } from './product-review-form.component';
import { ReviewService, ProductReview } from '../review.service';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeReview(overrides: Partial<ProductReview> = {}): ProductReview {
  return {
    id: 'review-1',
    productId: 'product-1',
    userId: 'user-1',
    reviewerName: 'Test Buyer',
    rating: 4,
    comment: 'Great product, very fresh!',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeHttpError(status: number, message = 'Error'): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    error: { error: { message } },
    statusText: 'Error',
  });
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('ProductReviewFormComponent', () => {
  let fixture: ComponentFixture<ProductReviewFormComponent>;
  let component: ProductReviewFormComponent;
  let reviewServiceMock: { createReview: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    reviewServiceMock = { createReview: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [ProductReviewFormComponent],
      providers: [
        provideAnimationsAsync(),
        { provide: ReviewService, useValue: reviewServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductReviewFormComponent);
    component = fixture.componentInstance;
    component.productId = 'product-1';
    fixture.detectChanges();
  });

  // ── Component Creation ────────────────────────────────────────────────────

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize the form with rating 0 and empty comment', () => {
    expect(component.reviewForm.get('rating')?.value).toBe(0);
    expect(component.reviewForm.get('comment')?.value).toBe('');
  });

  it('should start in non-submitted state with no error', () => {
    expect(component.submitted).toBe(false);
    expect(component.errorMessage).toBe('');
  });

  // ── Star Rating Interaction ───────────────────────────────────────────────

  it('should update selectedRating when a star is clicked', () => {
    component.onStarClick(3);
    expect(component.selectedRating).toBe(3);
  });

  it('should update hoveredStar on mouse enter', () => {
    component.onStarHover(4);
    expect(component.hoveredStar).toBe(4);
  });

  it('should reset hoveredStar on mouse leave', () => {
    component.onStarHover(4);
    component.onStarLeave();
    expect(component.hoveredStar).toBe(0);
  });

  it('isStarFilled returns true for stars up to selectedRating when not hovering', () => {
    component.onStarClick(3);
    expect(component.isStarFilled(1)).toBe(true);
    expect(component.isStarFilled(2)).toBe(true);
    expect(component.isStarFilled(3)).toBe(true);
    expect(component.isStarFilled(4)).toBe(false);
    expect(component.isStarFilled(5)).toBe(false);
  });

  it('isStarFilled uses hoveredStar when hovering', () => {
    component.onStarClick(2);
    component.onStarHover(4);
    expect(component.isStarFilled(4)).toBe(true);
    expect(component.isStarFilled(5)).toBe(false);
  });

  it('should mark rating as touched when a star is clicked', () => {
    component.onStarClick(5);
    expect(component.reviewForm.get('rating')?.touched).toBe(true);
  });

  // ── Comment Validation ────────────────────────────────────────────────────

  it('should report commentLength correctly', () => {
    component.commentControl.setValue('Hello world');
    expect(component.commentLength).toBe(11);
  });

  it('should be invalid when comment is shorter than 10 characters', () => {
    component.commentControl.setValue('Short');
    expect(component.commentControl.errors?.['minlength']).toBeTruthy();
  });

  it('should be invalid when comment exceeds 500 characters', () => {
    component.commentControl.setValue('a'.repeat(501));
    expect(component.commentControl.errors?.['maxlength']).toBeTruthy();
  });

  it('should be valid when comment is exactly 10 characters', () => {
    component.commentControl.setValue('1234567890');
    expect(component.commentControl.errors).toBeNull();
  });

  it('should be valid when comment is exactly 500 characters', () => {
    component.commentControl.setValue('a'.repeat(500));
    expect(component.commentControl.errors).toBeNull();
  });

  it('commentLengthClass is empty for normal length', () => {
    component.commentControl.setValue('a'.repeat(100));
    expect(component.commentLengthClass).toBe('');
  });

  it('commentLengthClass is near-limit when within 50 chars of max', () => {
    component.commentControl.setValue('a'.repeat(455));
    expect(component.commentLengthClass).toBe('near-limit');
  });

  it('commentLengthClass is over-limit when exceeding max', () => {
    component.commentControl.setValue('a'.repeat(501));
    expect(component.commentLengthClass).toBe('over-limit');
  });

  // ── Form Submission ───────────────────────────────────────────────────────

  it('should not submit when form is invalid (no rating, no comment)', () => {
    component.onSubmit();
    expect(reviewServiceMock.createReview).not.toHaveBeenCalled();
  });

  it('should mark all controls as touched on invalid submit', () => {
    component.onSubmit();
    expect(component.reviewForm.get('rating')?.touched).toBe(true);
    expect(component.reviewForm.get('comment')?.touched).toBe(true);
  });

  it('should call createReview with correct payload on valid submit', () => {
    reviewServiceMock.createReview.mockReturnValue(of(makeReview()));

    component.onStarClick(4);
    component.commentControl.setValue('Great product, very fresh!');
    component.onSubmit();

    expect(reviewServiceMock.createReview).toHaveBeenCalledWith({
      productId: 'product-1',
      rating: 4,
      comment: 'Great product, very fresh!',
    });
  });

  it('should trim whitespace from comment before submitting', () => {
    reviewServiceMock.createReview.mockReturnValue(of(makeReview()));

    component.onStarClick(5);
    component.commentControl.setValue('  Great product!  ');
    component.onSubmit();

    const callArg = reviewServiceMock.createReview.mock.calls[0][0] as { comment: string };
    expect(callArg.comment).toBe('Great product!');
  });

  it('should set submitted=true and emit reviewSubmitted on success', () => {
    const review = makeReview();
    reviewServiceMock.createReview.mockReturnValue(of(review));

    const emittedReviews: ProductReview[] = [];
    component.reviewSubmitted.subscribe((r) => emittedReviews.push(r));

    component.onStarClick(4);
    component.commentControl.setValue('Great product, very fresh!');
    component.onSubmit();

    expect(component.submitted).toBe(true);
    expect(emittedReviews).toHaveLength(1);
    expect(emittedReviews[0]).toEqual(review);
  });

  // ── Error Handling ────────────────────────────────────────────────────────

  it('should show purchase-required error on 403 response (Requirement 5.2)', () => {
    reviewServiceMock.createReview.mockReturnValue(
      throwError(() => makeHttpError(403, 'Purchase required')),
    );

    component.onStarClick(4);
    component.commentControl.setValue('Great product, very fresh!');
    component.onSubmit();

    expect(component.errorMessage).toContain('purchased and received');
    expect(component.submitted).toBe(false);
  });

  it('should show duplicate review error on 409 response (Requirement 5.3)', () => {
    reviewServiceMock.createReview.mockReturnValue(
      throwError(() => makeHttpError(409, 'Duplicate review')),
    );

    component.onStarClick(4);
    component.commentControl.setValue('Great product, very fresh!');
    component.onSubmit();

    expect(component.errorMessage).toContain('already submitted a review');
    expect(component.submitted).toBe(false);
  });

  it('should show validation error message on 400 response', () => {
    reviewServiceMock.createReview.mockReturnValue(
      throwError(() => makeHttpError(400, 'Rating must be between 1 and 5')),
    );

    component.onStarClick(4);
    component.commentControl.setValue('Great product, very fresh!');
    component.onSubmit();

    expect(component.errorMessage).toBeTruthy();
    expect(component.submitted).toBe(false);
  });

  it('should show product not found error on 404 response', () => {
    reviewServiceMock.createReview.mockReturnValue(
      throwError(() => makeHttpError(404, 'Product not found')),
    );

    component.onStarClick(4);
    component.commentControl.setValue('Great product, very fresh!');
    component.onSubmit();

    expect(component.errorMessage).toContain('Product not found');
    expect(component.submitted).toBe(false);
  });

  it('should show generic error on unexpected error status', () => {
    reviewServiceMock.createReview.mockReturnValue(
      throwError(() => makeHttpError(500, 'Internal server error')),
    );

    component.onStarClick(4);
    component.commentControl.setValue('Great product, very fresh!');
    component.onSubmit();

    expect(component.errorMessage).toContain('unexpected error');
    expect(component.submitted).toBe(false);
  });

  it('should reset submitting flag to false after error', () => {
    reviewServiceMock.createReview.mockReturnValue(
      throwError(() => makeHttpError(403)),
    );

    component.onStarClick(4);
    component.commentControl.setValue('Great product, very fresh!');
    component.onSubmit();

    expect(component.submitting).toBe(false);
  });

  // ── Reset ─────────────────────────────────────────────────────────────────

  it('should reset form state when resetForm() is called', () => {
    reviewServiceMock.createReview.mockReturnValue(of(makeReview()));

    component.onStarClick(4);
    component.commentControl.setValue('Great product, very fresh!');
    component.onSubmit();

    component.resetForm();

    expect(component.submitted).toBe(false);
    expect(component.errorMessage).toBe('');
    expect(component.selectedRating).toBe(0);
    expect(component.commentControl.value).toBe('');
  });
});
