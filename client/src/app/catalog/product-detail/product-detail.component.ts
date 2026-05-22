import { Component, inject, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subject, takeUntil, switchMap, catchError, of } from 'rxjs';
import { Product } from '@shared/interfaces';
import { CatalogService } from '../catalog.service';
import { CartService } from '../../cart/cart.service';
import { ProductReviewListComponent } from '../../reviews/product-review-list/product-review-list.component';
import { ProductReviewFormComponent } from '../../reviews/product-review-form/product-review-form.component';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DecimalPipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    ProductReviewListComponent,
    ProductReviewFormComponent,
  ],
  templateUrl: './product-detail.component.html',
  styleUrl: './product-detail.component.scss',
})
export class ProductDetailComponent implements OnInit, OnDestroy {
  private readonly catalogService = inject(CatalogService);
  private readonly cartService = inject(CartService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroy$ = new Subject<void>();

  @ViewChild('reviewList') reviewList!: ProductReviewListComponent;

  product: Product | null = null;
  relatedProducts: Product[] = [];
  loading = true;
  error = false;

  // ─── Purchase Controls State ───────────────────────────────────────────────
  quantity = 1;
  addingToCart = false;
  buyingNow = false;
  showReviewForm = false;

  ngOnInit(): void {
    this.route.params
      .pipe(
        takeUntil(this.destroy$),
        switchMap((params) => {
          this.loading = true;
          this.error = false;
          this.quantity = 1;
          this.showReviewForm = false;
          return this.catalogService.getProductById(params['productId']);
        })
      )
      .subscribe({
        next: (product) => {
          this.product = product;
          this.loading = false;
          this.loadRelatedProducts(product.id);

          // Track product view for real-time recommendation adaptation
          this.catalogService.trackProductClick(product.id, product.category);
        },
        error: () => {
          this.error = true;
          this.loading = false;
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadRelatedProducts(productId: string): void {
    this.catalogService
      .getRelatedProducts(productId)
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of([]))
      )
      .subscribe((products) => {
        this.relatedProducts = products;
      });
  }

  formatPrice(amount: number): string {
    return this.catalogService.formatPrice(amount);
  }

  isOutOfStock(): boolean {
    return !this.product?.isAvailable || this.product.stockQuantity === 0;
  }

  isLowStock(): boolean {
    if (!this.product) return false;
    return this.product.stockQuantity > 0 && this.product.stockQuantity <= 5;
  }

  // ─── Purchase Controls Methods ─────────────────────────────────────────────
  incrementQuantity(): void {
    if (!this.product) return;
    const maxQty = Math.min(99, this.product.stockQuantity);
    if (this.quantity < maxQty) {
      this.quantity++;
    }
  }

  decrementQuantity(): void {
    if (this.quantity > 1) {
      this.quantity--;
    }
  }

  addToCart(): void {
    if (!this.product || this.isOutOfStock() || this.addingToCart) return;

    this.addingToCart = true;
    this.cartService.addItem(this.product.id, this.quantity)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.addingToCart = false;
          this.snackBar.open(
            `🛒 Added ${this.quantity}x ${this.product?.name} to your cart successfully!`,
            'Close',
            { duration: 4000, horizontalPosition: 'center', verticalPosition: 'top' }
          );
        },
        error: (err) => {
          this.addingToCart = false;
          const msg = err.error?.error?.message || 'Failed to add item to cart.';
          this.snackBar.open(`⚠️ ${msg}`, 'Close', { duration: 4000 });
        }
      });
  }

  buyNow(): void {
    if (!this.product || this.isOutOfStock() || this.buyingNow) return;

    this.buyingNow = true;
    this.cartService.addItem(this.product.id, this.quantity)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.buyingNow = false;
          this.snackBar.open('⚡ Cart configured. Opening checkout...', 'Close', {
            duration: 2000,
            horizontalPosition: 'center',
            verticalPosition: 'top',
          });
          setTimeout(() => {
            this.router.navigate(['/orders/checkout']);
          }, 1000);
        },
        error: (err) => {
          this.buyingNow = false;
          const msg = err.error?.error?.message || 'Failed to initialize instant purchase.';
          this.snackBar.open(`⚠️ ${msg}`, 'Close', { duration: 4000 });
        }
      });
  }

  // ─── Review Section Methods ────────────────────────────────────────────────
  toggleReviewForm(): void {
    this.showReviewForm = !this.showReviewForm;
  }

  onReviewSubmitted(): void {
    this.showReviewForm = false;
    this.snackBar.open('⭐ Thank you for your review! Updating synthesis insights...', 'Close', {
      duration: 4000,
      horizontalPosition: 'center',
      verticalPosition: 'top',
    });
    if (this.reviewList) {
      this.reviewList.loadData();
    }
  }

  onRelatedProductSelect(product: Product): void {
    this.router.navigate(['/catalog/product', product.id]);
  }

  goBack(): void {
    this.router.navigate(['/catalog']);
  }
}
