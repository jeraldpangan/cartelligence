import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule } from '@angular/material/dialog';
import { Subject, takeUntil } from 'rxjs';
import { SellerService, SellerProduct } from '../seller.service';
import { DialogService } from '../../core/confirm-dialog/dialog.service';
import { PaginatedResponse } from '@shared/interfaces';

@Component({
  selector: 'app-product-management',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatTableModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatDialogModule,
  ],
  template: `
    <div class="product-management">
      <div class="product-management__header">
        <h1 class="product-management__title">Product Management</h1>
        <a
          mat-raised-button
          color="primary"
          routerLink="../products/new"
          class="product-management__add-btn"
          aria-label="Add new product"
        >
          <mat-icon>add</mat-icon>
          Add Product
        </a>
      </div>

      @if (loading) {
        <div class="product-management__loading" role="status" aria-label="Loading products">
          <mat-spinner diameter="48"></mat-spinner>
        </div>
      }

      @if (!loading && products.length === 0) {
        <div class="product-management__empty" role="status">
          <mat-icon class="product-management__empty-icon">inventory_2</mat-icon>
          <p class="product-management__empty-text">No products yet. Add your first product to get started.</p>
          <a mat-raised-button color="primary" routerLink="../products/new">Add Product</a>
        </div>
      }

      @if (!loading && products.length > 0) {
        <div class="product-management__table-container" role="region" aria-label="Product list">
          <table
            mat-table
            [dataSource]="products"
            class="product-management__table"
            aria-label="Seller products"
          >
            <!-- Name Column -->
            <ng-container matColumnDef="name">
              <th mat-header-cell *matHeaderCellDef scope="col">Product Name</th>
              <td mat-cell *matCellDef="let product">
                <span class="product-management__product-name">{{ product.name }}</span>
              </td>
            </ng-container>

            <!-- Category Column -->
            <ng-container matColumnDef="category">
              <th mat-header-cell *matHeaderCellDef scope="col">Category</th>
              <td mat-cell *matCellDef="let product">
                <span class="product-management__category">{{ formatCategory(product.category) }}</span>
              </td>
            </ng-container>

            <!-- Price Column -->
            <ng-container matColumnDef="price">
              <th mat-header-cell *matHeaderCellDef scope="col">Price</th>
              <td mat-cell *matCellDef="let product">
                <span class="product-management__price">{{ formatPrice(product.unitPrice) }}</span>
                <span class="product-management__unit"> / {{ product.unit }}</span>
              </td>
            </ng-container>

            <!-- Stock Column -->
            <ng-container matColumnDef="stock">
              <th mat-header-cell *matHeaderCellDef scope="col">Stock</th>
              <td mat-cell *matCellDef="let product">
                <span
                  class="product-management__stock"
                  [class.product-management__stock--low]="product.stockQuantity <= 10"
                >
                  {{ product.stockQuantity }}
                </span>
              </td>
            </ng-container>

            <!-- Availability Column -->
            <ng-container matColumnDef="availability">
              <th mat-header-cell *matHeaderCellDef scope="col">Status</th>
              <td mat-cell *matCellDef="let product">
                <span
                  class="product-management__status-badge"
                  [class.product-management__status-badge--available]="product.isAvailable"
                  [class.product-management__status-badge--unavailable]="!product.isAvailable"
                  [attr.aria-label]="product.isAvailable ? 'Available' : 'Unavailable'"
                >
                  {{ product.isAvailable ? 'Available' : 'Unavailable' }}
                </span>
              </td>
            </ng-container>

            <!-- Actions Column -->
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef scope="col">Actions</th>
              <td mat-cell *matCellDef="let product">
                <div class="product-management__actions">
                  <button
                    mat-icon-button
                    [routerLink]="['../products', product.id, 'edit']"
                    matTooltip="Edit product"
                    aria-label="Edit {{ product.name }}"
                    color="primary"
                  >
                    <mat-icon>edit</mat-icon>
                  </button>

                  <button
                    mat-icon-button
                    (click)="onToggleAvailability(product)"
                    [matTooltip]="product.isAvailable ? 'Mark as unavailable' : 'Mark as available'"
                    [attr.aria-label]="(product.isAvailable ? 'Deactivate' : 'Activate') + ' ' + product.name"
                    [disabled]="togglingId === product.id"
                    color="accent"
                  >
                    <mat-icon>{{ product.isAvailable ? 'visibility_off' : 'visibility' }}</mat-icon>
                  </button>

                  <button
                    mat-icon-button
                    (click)="onDelete(product)"
                    matTooltip="Delete product"
                    [attr.aria-label]="'Delete ' + product.name"
                    [disabled]="deletingId === product.id"
                    color="warn"
                  >
                    <mat-icon>delete</mat-icon>
                  </button>
                </div>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
            <tr
              mat-row
              *matRowDef="let row; columns: displayedColumns;"
              class="product-management__row"
            ></tr>
          </table>

          <mat-paginator
            [length]="totalItems"
            [pageSize]="pageSize"
            [pageIndex]="currentPage - 1"
            [hidePageSize]="true"
            (page)="onPageChange($event)"
            aria-label="Select page of products"
          ></mat-paginator>
        </div>
      }
    </div>
  `,
  styles: [`
    .product-management {
      padding: 1.5rem;
      max-width: 1200px;
      margin: 0 auto;

      &__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 1.5rem;
        flex-wrap: wrap;
        gap: 1rem;
      }

      &__title {
        font-size: 1.75rem;
        font-weight: 500;
        color: #1a1a1a;
        margin: 0;
      }

      &__add-btn {
        display: flex;
        align-items: center;
        gap: 0.25rem;
      }

      &__loading {
        display: flex;
        justify-content: center;
        padding: 4rem;
      }

      &__empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 4rem 2rem;
        gap: 1rem;
        color: #666666;
        text-align: center;
      }

      &__empty-icon {
        font-size: 4rem;
        width: 4rem;
        height: 4rem;
        color: #cccccc;
      }

      &__empty-text {
        font-size: 1rem;
        color: #666666;
        margin: 0;
      }

      &__table-container {
        overflow-x: auto;
        border-radius: 8px;
        border: 1px solid #e0e0e0;
      }

      &__table {
        width: 100%;
      }

      &__row {
        &:hover {
          background-color: #f9f9f9;
        }
      }

      &__product-name {
        font-weight: 500;
        color: #1a1a1a;
      }

      &__category {
        color: #555555;
        text-transform: capitalize;
      }

      &__price {
        font-weight: 600;
        color: #1a1a1a;
      }

      &__unit {
        font-size: 0.8125rem;
        color: #888888;
      }

      &__stock {
        font-weight: 500;

        &--low {
          color: #c0392b;
          font-weight: 600;
        }
      }

      &__status-badge {
        display: inline-block;
        padding: 0.25rem 0.625rem;
        border-radius: 12px;
        font-size: 0.75rem;
        font-weight: 500;

        &--available {
          background-color: #e8f5e9;
          color: #2e7d32;
        }

        &--unavailable {
          background-color: #fce4ec;
          color: #c62828;
        }
      }

      &__actions {
        display: flex;
        align-items: center;
        gap: 0.25rem;
      }
    }
  `],
})
export class ProductManagementComponent implements OnInit, OnDestroy {
  private readonly sellerService = inject(SellerService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogService = inject(DialogService);
  private readonly destroy$ = new Subject<void>();

  products: SellerProduct[] = [];
  totalItems = 0;
  currentPage = 1;
  readonly pageSize = 20;
  loading = false;
  togglingId: string | null = null;
  deletingId: string | null = null;

  readonly displayedColumns = ['name', 'category', 'price', 'stock', 'availability', 'actions'];

  ngOnInit(): void {
    this.loadProducts();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadProducts(): void {
    this.loading = true;

    this.sellerService
      .getSellerProducts(this.currentPage)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: PaginatedResponse<SellerProduct>) => {
          this.products = response.data;
          this.totalItems = response.totalItems;
          this.loading = false;
        },
        error: () => {
          this.products = [];
          this.loading = false;
          this.snackBar.open('Failed to load products. Please try again.', 'Dismiss', {
            duration: 4000,
          });
        },
      });
  }

  onPageChange(event: PageEvent): void {
    this.currentPage = event.pageIndex + 1;
    this.loadProducts();
  }

  onToggleAvailability(product: SellerProduct): void {
    const action = product.isAvailable ? 'mark as unavailable' : 'mark as available';
    this.dialogService
      .confirm(
        product.isAvailable ? 'Hide Product' : 'Show Product',
        `Are you sure you want to ${action} "${product.name}"?`,
        { confirmLabel: product.isAvailable ? 'Hide' : 'Show' },
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.togglingId = product.id;

        this.sellerService
          .toggleAvailability(product.id)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (updated: SellerProduct) => {
              const index = this.products.findIndex((p) => p.id === updated.id);
              if (index !== -1) {
                this.products = [
                  ...this.products.slice(0, index),
                  updated,
                  ...this.products.slice(index + 1),
                ];
              }
              this.togglingId = null;
              const statusLabel = updated.isAvailable ? 'available' : 'unavailable';
              this.snackBar.open(`"${updated.name}" marked as ${statusLabel}.`, 'Dismiss', { duration: 3000 });
            },
            error: () => {
              this.togglingId = null;
              this.dialogService.error(
                'Update Failed',
                `Could not update availability for "${product.name}". Please try again.`,
              );
            },
          });
      });
  }

  onDelete(product: SellerProduct): void {
    this.dialogService
      .confirmDelete(
        'Delete Product',
        `Are you sure you want to delete "${product.name}"? This cannot be undone and the product will be removed from all listings.`,
        'Delete',
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.deletingId = product.id;

        this.sellerService
          .deleteProduct(product.id)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => {
              this.deletingId = null;
              this.snackBar.open(`"${product.name}" has been deleted.`, 'Dismiss', { duration: 3000 });
              if (this.products.length === 1 && this.currentPage > 1) {
                this.currentPage -= 1;
              }
              this.loadProducts();
            },
            error: () => {
              this.deletingId = null;
              this.dialogService.error(
                'Delete Failed',
                `Could not delete "${product.name}". Please try again.`,
              );
            },
          });
      });
  }

  formatPrice(amount: number): string {
    return this.sellerService.formatPrice(amount);
  }

  formatCategory(category: string): string {
    return category.replace(/_/g, ' ');
  }
}
