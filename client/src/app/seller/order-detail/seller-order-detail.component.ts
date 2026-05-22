import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { OrderStatus } from '@shared/enums';
import { SellerService, SellerOrder } from '../seller.service';
import { StatusConfirmDialogComponent } from './status-confirm-dialog.component';
import { DialogService } from '../../core/confirm-dialog/dialog.service';

/**
 * Valid status transitions for the seller order state machine.
 * Requirements: 4.5, 4.6, 4.7
 */
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.Confirmed]: [OrderStatus.BeingPrepared, OrderStatus.Cancelled],
  [OrderStatus.BeingPrepared]: [OrderStatus.OutForDelivery, OrderStatus.Cancelled],
  [OrderStatus.OutForDelivery]: [OrderStatus.Delivered],
  [OrderStatus.Delivered]: [],
  [OrderStatus.Cancelled]: [],
};

/**
 * Human-readable labels for each status.
 */
const STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.Confirmed]: 'Confirmed',
  [OrderStatus.BeingPrepared]: 'Being Prepared',
  [OrderStatus.OutForDelivery]: 'Out for Delivery',
  [OrderStatus.Delivered]: 'Delivered',
  [OrderStatus.Cancelled]: 'Cancelled',
};

/**
 * Displays the full detail of a single seller order and provides
 * status transition controls with confirmation dialogs.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.5, 4.6, 4.7
 */
@Component({
  selector: 'app-seller-order-detail',
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatDialogModule,
    MatTooltipModule,
    MatSnackBarModule,
  ],
  templateUrl: './seller-order-detail.component.html',
  styleUrl: './seller-order-detail.component.scss',
})
export class SellerOrderDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly sellerService = inject(SellerService);
  private readonly dialog = inject(MatDialog);
  private readonly dialogService = inject(DialogService);
  private readonly snackBar = inject(MatSnackBar);

  readonly loading = signal(true);
  readonly updating = signal(false);
  readonly error = signal<string | null>(null);
  readonly order = signal<SellerOrder | null>(null);

  ngOnInit(): void {
    const orderId = this.route.snapshot.paramMap.get('id');
    if (orderId) {
      this.loadOrder(orderId);
    }
  }

  retryLoad(): void {
    const orderId = this.route.snapshot.paramMap.get('id');
    if (orderId) {
      this.loadOrder(orderId);
    }
  }

  private loadOrder(orderId: string): void {
    this.loading.set(true);
    this.error.set(null);

    this.sellerService.getOrder(orderId).subscribe({
      next: (order) => {
        this.order.set(order);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load order details. Please try again.');
        this.loading.set(false);
      },
    });
  }

  /**
   * Returns the list of valid next statuses for the current order status.
   * An empty array means the order is in a terminal state.
   */
  getAvailableTransitions(currentStatus: OrderStatus): OrderStatus[] {
    return VALID_TRANSITIONS[currentStatus] ?? [];
  }

  /**
   * Returns true if the given status is a valid next transition from the current status.
   */
  canTransitionTo(currentStatus: OrderStatus, targetStatus: OrderStatus): boolean {
    return VALID_TRANSITIONS[currentStatus]?.includes(targetStatus) ?? false;
  }

  getStatusLabel(status: OrderStatus): string {
    return STATUS_LABELS[status] ?? status;
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

  isTerminalStatus(status: OrderStatus): boolean {
    return status === OrderStatus.Delivered || status === OrderStatus.Cancelled;
  }

  formatPrice(amount: number): string {
    return this.sellerService.formatPrice(amount);
  }

  /**
   * Opens a confirmation dialog before transitioning the order status.
   * Requirements: 4.3, 4.5, 4.6, 4.7
   */
  onTransitionClick(targetStatus: OrderStatus): void {
    const currentOrder = this.order();
    if (!currentOrder) return;

    const dialogRef = this.dialog.open(StatusConfirmDialogComponent, {
      width: '400px',
      data: {
        currentStatus: currentOrder.status,
        targetStatus,
        currentStatusLabel: this.getStatusLabel(currentOrder.status),
        targetStatusLabel: this.getStatusLabel(targetStatus),
        orderNumber: currentOrder.orderNumber,
      },
    });

    dialogRef.afterClosed().subscribe((confirmed: boolean) => {
      if (confirmed) {
        this.updateStatus(currentOrder.id, targetStatus);
      }
    });
  }

  private updateStatus(orderId: string, newStatus: OrderStatus): void {
    this.updating.set(true);

    this.sellerService.updateOrderStatus(orderId, newStatus).subscribe({
      next: (updatedOrder) => {
        this.order.set(updatedOrder);
        this.updating.set(false);
        this.snackBar.open(
          `Order status updated to "${this.getStatusLabel(newStatus)}"`,
          'Dismiss',
          { duration: 4000 },
        );
      },
      error: (err: { error?: { message?: string } }) => {
        this.updating.set(false);
        const message = err?.error?.message ?? 'Failed to update order status. Please try again.';
        this.dialogService.error('Status Update Failed', message);
      },
    });
  }
}
