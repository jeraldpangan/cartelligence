import { Component, OnInit, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { forkJoin, catchError, of } from 'rxjs';
import { SellerService, SellerProduct, SellerOrder } from '../seller.service';
import { OrderStatus } from '@shared/enums';

/** Pending order statuses — orders that still require seller action. */
const PENDING_STATUSES: OrderStatus[] = [
  OrderStatus.Confirmed,
  OrderStatus.BeingPrepared,
  OrderStatus.OutForDelivery,
];

/** Number of recent orders to show in the activity feed. */
const RECENT_ACTIVITY_COUNT = 5;

@Component({
  selector: 'app-seller-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatChipsModule,
  ],
  template: `
    <div class="dashboard-container">
      <header class="dashboard-header">
        <h1 class="dashboard-title">Seller Dashboard</h1>
        <p class="dashboard-subtitle">Manage your products and orders</p>
      </header>

      <!-- Loading state -->
      @if (isLoading()) {
        <div class="loading-container">
          <mat-spinner diameter="48" />
          <p>Loading dashboard…</p>
        </div>
      }

      <!-- Error state -->
      @if (hasError() && !isLoading()) {
        <mat-card class="error-card">
          <mat-card-content>
            <mat-icon class="error-icon">error_outline</mat-icon>
            <p>Failed to load dashboard data. Please try again.</p>
            <button mat-stroked-button (click)="loadDashboardData()">
              <mat-icon>refresh</mat-icon>
              Retry
            </button>
          </mat-card-content>
        </mat-card>
      }

      <!-- Dashboard content -->
      @if (!isLoading() && !hasError()) {
        <!-- Stats cards -->
        <section class="stats-section" aria-label="Dashboard statistics">
          <mat-card class="stat-card">
            <mat-card-content>
              <div class="stat-icon-wrapper">
                <mat-icon class="stat-icon">inventory_2</mat-icon>
              </div>
              <div class="stat-info">
                <span class="stat-value">{{ totalProducts() }}</span>
                <span class="stat-label">Total Products</span>
              </div>
            </mat-card-content>
          </mat-card>

          <mat-card class="stat-card">
            <mat-card-content>
              <div class="stat-icon-wrapper">
                <mat-icon class="stat-icon">check_circle</mat-icon>
              </div>
              <div class="stat-info">
                <span class="stat-value">{{ activeProducts() }}</span>
                <span class="stat-label">Active Products</span>
              </div>
            </mat-card-content>
          </mat-card>

          <mat-card class="stat-card stat-card--highlight">
            <mat-card-content>
              <div class="stat-icon-wrapper">
                <mat-icon class="stat-icon">pending_actions</mat-icon>
              </div>
              <div class="stat-info">
                <span class="stat-value">{{ pendingOrders() }}</span>
                <span class="stat-label">Pending Orders</span>
              </div>
            </mat-card-content>
          </mat-card>
        </section>

        <!-- Quick navigation -->
        <section class="quick-nav-section" aria-label="Quick navigation">
          <h2 class="section-title">Quick Actions</h2>
          <div class="quick-nav-grid">
            <a
              routerLink="/seller/products"
              mat-raised-button
              class="quick-nav-btn"
              aria-label="Go to product management"
            >
              <mat-icon>inventory_2</mat-icon>
              Manage Products
            </a>
            <a
              routerLink="/seller/products/new"
              mat-stroked-button
              class="quick-nav-btn"
              aria-label="Add a new product"
            >
              <mat-icon>add_box</mat-icon>
              Add New Product
            </a>
            <a
              routerLink="/seller/orders"
              mat-raised-button
              class="quick-nav-btn"
              aria-label="Go to order management"
            >
              <mat-icon>receipt_long</mat-icon>
              Manage Orders
            </a>
          </div>
        </section>

        <mat-divider />

        <!-- Recent activity -->
        <section class="activity-section" aria-label="Recent order activity">
          <div class="section-header">
            <h2 class="section-title">Recent Activity</h2>
            <a routerLink="/seller/orders" mat-button class="view-all-link">
              View all <mat-icon>arrow_forward</mat-icon>
            </a>
          </div>

          @if (recentOrders().length === 0) {
            <mat-card class="empty-state-card">
              <mat-card-content>
                <mat-icon class="empty-icon">inbox</mat-icon>
                <p>No orders yet. Share your products to start receiving orders.</p>
              </mat-card-content>
            </mat-card>
          } @else {
            <div class="activity-list" role="list">
              @for (order of recentOrders(); track order.id) {
                <mat-card class="activity-card" role="listitem">
                  <mat-card-content>
                    <div class="activity-row">
                      <div class="activity-info">
                        <span class="order-number">Order #{{ order.orderNumber }}</span>
                        <span class="order-buyer">{{ order.buyerName }}</span>
                        <span class="order-date">{{ order.createdAt | date: 'mediumDate' }}</span>
                      </div>
                      <div class="activity-meta">
                        <span class="order-total">{{ formatPrice(order.grandTotal) }}</span>
                        <mat-chip
                          [class]="'status-chip status-chip--' + order.status"
                          [attr.aria-label]="'Order status: ' + order.status"
                        >
                          {{ formatStatus(order.status) }}
                        </mat-chip>
                      </div>
                    </div>
                  </mat-card-content>
                </mat-card>
              }
            </div>
          }
        </section>
      }
    </div>
  `,
  styles: [`
    .dashboard-container {
      max-width: 960px;
      margin: 0 auto;
      padding: 24px 16px;
    }

    .dashboard-header {
      margin-bottom: 32px;
    }

    .dashboard-title {
      font: var(--mat-sys-headline-large);
      margin: 0 0 4px;
    }

    .dashboard-subtitle {
      font: var(--mat-sys-body-large);
      color: var(--mat-sys-on-surface-variant);
      margin: 0;
    }

    /* Loading */
    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 48px 0;
      color: var(--mat-sys-on-surface-variant);
    }

    /* Error */
    .error-card {
      text-align: center;
      padding: 24px;
    }

    .error-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: var(--color-error);
      margin-bottom: 8px;
    }

    /* Stats */
    .stats-section {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }

    .stat-card mat-card-content {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px;
    }

    .stat-card--highlight {
      border-left: 4px solid var(--mat-sys-primary);
    }

    .stat-icon-wrapper {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: var(--mat-sys-surface-variant);
      flex-shrink: 0;
    }

    .stat-icon {
      color: var(--mat-sys-on-surface-variant);
    }

    .stat-info {
      display: flex;
      flex-direction: column;
    }

    .stat-value {
      font: var(--mat-sys-headline-medium);
      font-weight: 700;
      line-height: 1;
    }

    .stat-label {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
      margin-top: 4px;
    }

    /* Quick nav */
    .quick-nav-section {
      margin-bottom: 32px;
    }

    .section-title {
      font: var(--mat-sys-title-large);
      margin: 0 0 16px;
    }

    .quick-nav-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    .quick-nav-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
    }

    /* Divider */
    mat-divider {
      margin: 24px 0;
    }

    /* Activity */
    .activity-section {
      margin-top: 8px;
    }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }

    .section-header .section-title {
      margin: 0;
    }

    .view-all-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      text-decoration: none;
    }

    .activity-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .activity-card mat-card-content {
      padding: 16px;
    }

    .activity-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }

    .activity-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .order-number {
      font: var(--mat-sys-body-large);
      font-weight: 600;
    }

    .order-buyer {
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }

    .order-date {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }

    .activity-meta {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .order-total {
      font: var(--mat-sys-body-large);
      font-weight: 600;
    }

    /* Status chips */
    .status-chip {
      font-size: 12px;
    }

    .status-chip--confirmed { background: #e3f2fd; color: #1565c0; }
    .status-chip--being_prepared { background: #fff8e1; color: #e65100; }
    .status-chip--out_for_delivery { background: #e8f5e9; color: #2e7d32; }
    .status-chip--delivered { background: #f3e5f5; color: #6a1b9a; }
    .status-chip--cancelled { background: #fce4ec; color: #b71c1c; }

    /* Empty state */
    .empty-state-card mat-card-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 32px;
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
    }

    .empty-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      margin-bottom: 12px;
    }
  `],
})
export class SellerDashboardComponent implements OnInit {
  // ─── State signals ──────────────────────────────────────────────────────────
  private readonly products = signal<SellerProduct[]>([]);
  private readonly orders = signal<SellerOrder[]>([]);

  readonly isLoading = signal(true);
  readonly hasError = signal(false);

  // ─── Computed metrics ───────────────────────────────────────────────────────

  /** Total number of products owned by this seller. */
  readonly totalProducts = computed(() => this.products().length);

  /** Number of products with isAvailable = true. */
  readonly activeProducts = computed(
    () => this.products().filter((p) => p.isAvailable).length,
  );

  /**
   * Number of orders in a pending state (confirmed, being_prepared, out_for_delivery).
   * Requirements: 4.1
   */
  readonly pendingOrders = computed(
    () =>
      this.orders().filter((o) => PENDING_STATUSES.includes(o.status as OrderStatus)).length,
  );

  /** Most recent orders for the activity feed. */
  readonly recentOrders = computed(() =>
    [...this.orders()]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, RECENT_ACTIVITY_COUNT),
  );

  constructor(private readonly sellerService: SellerService) {}

  ngOnInit(): void {
    this.loadDashboardData();
  }

  /**
   * Loads products and orders in parallel.
   * Requirements: 2.2, 4.1
   */
  loadDashboardData(): void {
    this.isLoading.set(true);
    this.hasError.set(false);

    forkJoin({
      products: this.sellerService.getSellerProducts(1).pipe(catchError(() => of(null))),
      orders: this.sellerService.getOrders(1).pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ products, orders }) => {
        if (products === null || orders === null) {
          this.hasError.set(true);
        } else {
          this.products.set(products.data);
          this.orders.set(orders.data);
        }
        this.isLoading.set(false);
      },
      error: () => {
        this.hasError.set(true);
        this.isLoading.set(false);
      },
    });
  }

  /** Formats a monetary amount in Philippine Peso. */
  formatPrice(amount: number): string {
    return this.sellerService.formatPrice(amount);
  }

  /** Converts an OrderStatus enum value to a human-readable label. */
  formatStatus(status: string): string {
    const labels: Record<string, string> = {
      [OrderStatus.Confirmed]: 'Confirmed',
      [OrderStatus.BeingPrepared]: 'Being Prepared',
      [OrderStatus.OutForDelivery]: 'Out for Delivery',
      [OrderStatus.Delivered]: 'Delivered',
      [OrderStatus.Cancelled]: 'Cancelled',
    };
    return labels[status] ?? status;
  }
}
