import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject, takeUntil } from 'rxjs';
import { Product, PaginatedResponse } from '@shared/interfaces';
import { CatalogService } from '../catalog.service';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [
    MatCardModule,
    MatPaginatorModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './product-list.component.html',
  styleUrl: './product-list.component.scss',
})
export class ProductListComponent implements OnInit, OnDestroy {
  private readonly catalogService = inject(CatalogService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroy$ = new Subject<void>();

  products: Product[] = [];
  totalItems = 0;
  currentPage = 1;
  pageSize = 20;
  loading = false;
  categoryId: string | null = null;
  categoryName = '';
  noResults = false;

  ngOnInit(): void {
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.categoryId = params['categoryId'] || null;
      this.categoryName = this.getCategoryDisplayName(this.categoryId);
      this.currentPage = 1;
      this.loadProducts();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadProducts(): void {
    if (!this.categoryId) return;

    this.loading = true;
    this.noResults = false;

    this.catalogService
      .getProductsByCategory(this.categoryId, this.currentPage)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: PaginatedResponse<Product>) => {
          this.products = response.data;
          this.totalItems = response.totalItems;
          this.noResults = response.data.length === 0;
          this.loading = false;
        },
        error: () => {
          this.products = [];
          this.noResults = true;
          this.loading = false;
        },
      });
  }

  onPageChange(event: PageEvent): void {
    this.currentPage = event.pageIndex + 1;
    this.loadProducts();
  }

  onProductSelect(product: Product): void {
    this.router.navigate(['/catalog/product', product.id]);
  }

  formatPrice(amount: number): string {
    return this.catalogService.formatPrice(amount);
  }

  isOutOfStock(product: Product): boolean {
    return !product.isAvailable || product.stockQuantity === 0;
  }

  private getCategoryDisplayName(categoryId: string | null): string {
    if (!categoryId) return '';
    const category = this.catalogService
      .getCategories()
      .find((c) => c.id === categoryId);
    return category?.name || categoryId;
  }
}
