import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject, takeUntil } from 'rxjs';
import { Cart, Product } from '@shared/interfaces';
import { CartService } from '../cart.service';
import { CartItemComponent } from '../cart-item/cart-item.component';
import { CostBreakdownComponent } from '../cost-breakdown/cost-breakdown.component';
import { RecommendationPanelComponent } from '../recommendation-panel/recommendation-panel.component';

@Component({
  selector: 'app-smart-cart',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    CartItemComponent,
    CostBreakdownComponent,
    RecommendationPanelComponent,
  ],
  templateUrl: './smart-cart.component.html',
  styleUrl: './smart-cart.component.scss',
})
export class SmartCartComponent implements OnInit, OnDestroy {
  private readonly cartService = inject(CartService);
  private readonly router = inject(Router);
  private readonly destroy$ = new Subject<void>();

  cart: Cart | null = null;
  loading = false;
  updating = false;
  error: string | null = null;

  ngOnInit(): void {
    this.loadCart();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadCart(): void {
    this.loading = true;
    this.error = null;

    this.cartService
      .getCart()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (cart) => {
          this.cart = cart;
          this.loading = false;
        },
        error: () => {
          this.error = 'Failed to load cart. Please try again.';
          this.loading = false;
        },
      });
  }

  onQuantityChanged(event: { itemId: string; quantity: number }): void {
    this.updating = true;

    this.cartService
      .updateQuantity(event.itemId, event.quantity)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (cart) => {
          this.cart = cart;
          this.updating = false;
        },
        error: () => {
          this.updating = false;
        },
      });
  }

  onItemRemoved(itemId: string): void {
    this.updating = true;

    this.cartService
      .removeItem(itemId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (cart) => {
          this.cart = cart;
          this.updating = false;
        },
        error: () => {
          this.updating = false;
        },
      });
  }

  onRecommendationAdded(product: Product): void {
    this.updating = true;

    this.cartService
      .addItem(product.id, 1)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (cart) => {
          this.cart = cart;
          this.updating = false;
        },
        error: () => {
          this.updating = false;
        },
      });
  }

  onCheckout(): void {
    this.router.navigate(['/orders/checkout']);
  }

  onContinueShopping(): void {
    this.router.navigate(['/catalog']);
  }

  get isEmpty(): boolean {
    return !this.cart || this.cart.items.length === 0;
  }

  get itemCount(): number {
    return this.cart?.items.length ?? 0;
  }
}
