import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject, takeUntil, switchMap, catchError, of } from 'rxjs';
import { Product } from '@shared/interfaces';
import { CatalogService } from '../catalog.service';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './product-detail.component.html',
  styleUrl: './product-detail.component.scss',
})
export class ProductDetailComponent implements OnInit, OnDestroy {
  private readonly catalogService = inject(CatalogService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroy$ = new Subject<void>();

  product: Product | null = null;
  relatedProducts: Product[] = [];
  loading = true;
  error = false;

  ngOnInit(): void {
    this.route.params
      .pipe(
        takeUntil(this.destroy$),
        switchMap((params) => {
          this.loading = true;
          this.error = false;
          return this.catalogService.getProductById(params['productId']);
        })
      )
      .subscribe({
        next: (product) => {
          this.product = product;
          this.loading = false;
          this.loadRelatedProducts(product.id);
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

  onRelatedProductSelect(product: Product): void {
    this.router.navigate(['/catalog/product', product.id]);
  }

  goBack(): void {
    this.router.navigate(['/catalog']);
  }
}
