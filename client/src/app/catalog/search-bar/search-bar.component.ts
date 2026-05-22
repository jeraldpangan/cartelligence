import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  Subject,
  debounceTime,
  distinctUntilChanged,
  filter,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs';
import { Product, PaginatedResponse } from '@shared/interfaces';
import { CatalogService } from '../catalog.service';

@Component({
  selector: 'app-search-bar',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatCardModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './search-bar.component.html',
  styleUrl: './search-bar.component.scss',
})
export class SearchBarComponent implements OnInit, OnDestroy {
  private readonly catalogService = inject(CatalogService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy$ = new Subject<void>();

  searchControl = new FormControl('');
  searchResults: Product[] = [];
  totalItems = 0;
  currentPage = 1;
  pageSize = 20;
  loading = false;
  hasSearched = false;
  noResults = false;
  currentQuery = '';

  ngOnInit(): void {
    this.searchControl.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(300),
        distinctUntilChanged(),
        tap((query) => {
          const trimmed = (query || '').trim();
          if (trimmed.length < 2) {
            this.searchResults = [];
            this.hasSearched = false;
            this.noResults = false;
            this.totalItems = 0;
          }
        }),
        filter((query) => {
          const trimmed = (query || '').trim();
          return trimmed.length >= 2 && trimmed.length <= 100;
        }),
        tap(() => {
          this.loading = true;
          this.currentPage = 1;
        }),
        switchMap((query) => {
          this.currentQuery = (query || '').trim();
          return this.catalogService.searchProducts(this.currentQuery, this.currentPage);
        })
      )
      .subscribe({
        next: (response: PaginatedResponse<Product>) => {
          this.searchResults = response.data;
          this.totalItems = response.totalItems;
          this.hasSearched = true;
          this.noResults = response.data.length === 0;
          this.loading = false;
        },
        error: () => {
          this.searchResults = [];
          this.noResults = true;
          this.hasSearched = true;
          this.loading = false;
        },
      });

    // Listen to query parameters from header searches after setting up form listener
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const q = params['q'] || '';
      if (this.searchControl.value !== q) {
        this.searchControl.setValue(q);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onPageChange(event: PageEvent): void {
    this.currentPage = event.pageIndex + 1;
    this.loading = true;

    this.catalogService
      .searchProducts(this.currentQuery, this.currentPage)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: PaginatedResponse<Product>) => {
          this.searchResults = response.data;
          this.totalItems = response.totalItems;
          this.noResults = response.data.length === 0;
          this.loading = false;
        },
        error: () => {
          this.searchResults = [];
          this.noResults = true;
          this.loading = false;
        },
      });
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
}
