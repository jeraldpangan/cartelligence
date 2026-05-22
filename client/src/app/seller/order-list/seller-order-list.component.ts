import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PaginatedResponse } from '@shared/interfaces';
import { OrderStatus } from '@shared/enums';
import { SellerService, SellerOrder } from '../seller.service';

/**
 * Displays a paginated list of orders containing the seller's products.
 * Supports filtering by order status.
 *
 * Requirements: 4.1, 4.2
 */
@Component({
  selector: 'app-seller-order-list',
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatFormFieldModule,
    MatPaginatorModule,
    MatChipsModule,
    MatTooltipModule,
  ],
  templateUrl: './seller-order-list.component.html',
  styleUrl: './seller-order-list.component.scss',
})
export class SellerOrderListComponent implements OnInit {
  private readonly sellerService = inject(SellerService);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly orders = signal<SellerOrder[]>([]);
  readonly totalItems = signal(0);
  readonly currentPage = signal(1);
  readonly pageSize = 20;

  /** Currently selected status filter; null means "all statuses" */
  selectedStatus: OrderStatus | null = null;

  readonly statusOptions: { value: OrderStatus | null; label: string }[] = [
    { value: null, label: 'All Orders' },
    { value: OrderStatus.Confirmed, label: 'Confirmed' },
    { value: OrderStatus.BeingPrepared, label: 'Being Prepared' },
    { value: OrderStatus.OutForDelivery, label: 'Out for Delivery' },
    { value: OrderStatus.Delivered, label: 'Delivered' },
  ];

  ngOnInit(): void {
    this.loadOrders();
  }

  loadOrders(): void {
    this.loading.set(true);
    this.error.set(null);

    this.sellerService.getOrders(this.currentPage(), this.selectedStatus ?? undefined).subscribe({
      next: (response: PaginatedResponse<SellerOrder>) => {
        this.orders.set(response.data);
        this.totalItems.set(response.totalItems);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load orders. Please try again.');
        this.loading.set(false);
      },
    });
  }

  onStatusFilterChange(): void {
    this.currentPage.set(1);
    this.loadOrders();
  }

  onPageChange(event: PageEvent): void {
    this.currentPage.set(event.pageIndex + 1);
    this.loadOrders();
  }

  viewOrderDetail(orderId: string): void {
    this.router.navigate(['/seller/orders', orderId]);
  }

  getStatusLabel(status: OrderStatus): string {
    const option = this.statusOptions.find((o) => o.value === status);
    return option?.label ?? status;
  }

  getStatusClass(status: OrderStatus): string {
    const map: Record<OrderStatus, string> = {
      [OrderStatus.Confirmed]: 'status--confirmed',
      [OrderStatus.BeingPrepared]: 'status--preparing',
      [OrderStatus.OutForDelivery]: 'status--delivering',
      [OrderStatus.Delivered]: 'status--delivered',
      [OrderStatus.Cancelled]: 'status--cancelled',
    };
    return map[status] ?? '';
  }

  formatPrice(amount: number): string {
    return this.sellerService.formatPrice(amount);
  }

  trackByOrderId(_index: number, order: SellerOrder): string {
    return order.id;
  }
}
