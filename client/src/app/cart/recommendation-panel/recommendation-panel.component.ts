import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Product } from '@shared/interfaces';
import { CartService } from '../cart.service';

@Component({
  selector: 'app-recommendation-panel',
  standalone: true,
  imports: [MatCardModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './recommendation-panel.component.html',
  styleUrl: './recommendation-panel.component.scss',
})
export class RecommendationPanelComponent implements OnChanges {
  @Input() cartItemCount = 0;
  @Output() addToCart = new EventEmitter<Product>();

  private readonly cartService = inject(CartService);

  recommendations: Product[] = [];
  loading = false;
  unavailable = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['cartItemCount']) {
      if (this.cartItemCount >= 3) {
        this.loadRecommendations();
      } else {
        this.recommendations = [];
        this.unavailable = false;
      }
    }
  }

  private loadRecommendations(): void {
    this.loading = true;
    this.unavailable = false;

    this.cartService.getCartBasedRecommendations().subscribe({
      next: (products) => {
        this.recommendations = products.slice(0, 5);
        this.loading = false;
      },
      error: () => {
        this.recommendations = [];
        this.unavailable = true;
        this.loading = false;
      },
    });
  }

  onAddToCart(product: Product): void {
    this.addToCart.emit(product);
  }

  formatPrice(amount: number): string {
    return this.cartService.formatPrice(amount);
  }
}
