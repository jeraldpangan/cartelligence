import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Order } from '@shared/interfaces';
import { OrderStatus } from '@shared/enums';
import { TrackingService } from '../tracking.service';
import { OrderTrackerComponent } from '../order-tracker/order-tracker.component';
import { ETADisplayComponent } from '../eta-display/eta-display.component';
import { OfflineIndicatorComponent } from '../offline-indicator/offline-indicator.component';

@Component({
  selector: 'app-order-list',
  standalone: true,
  imports: [
    MatCardModule,
    MatListModule,
    MatIconModule,
    MatProgressSpinnerModule,
    OrderTrackerComponent,
    ETADisplayComponent,
    OfflineIndicatorComponent,
  ],
  templateUrl: './order-list.component.html',
  styleUrl: './order-list.component.scss',
})
export class OrderListComponent implements OnInit, OnDestroy {
  private readonly trackingService = inject(TrackingService);

  readonly orders = signal<Order[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly isConnected = this.trackingService.isConnected;
  readonly orderStatuses = this.trackingService.orderStatuses;
  readonly orderETAs = this.trackingService.orderETAs;

  ngOnInit(): void {
    this.trackingService.connect();
    this.loadActiveOrders();
  }

  ngOnDestroy(): void {
    const orders = this.orders();
    for (const order of orders) {
      this.trackingService.unsubscribe(order.id);
    }
    this.trackingService.disconnect();
  }

  private loadActiveOrders(): void {
    this.loading.set(true);
    this.error.set(null);

    this.trackingService.getActiveOrders().subscribe({
      next: (orders) => {
        this.orders.set(orders);
        this.loading.set(false);

        // Subscribe to real-time updates for each active order
        for (const order of orders) {
          this.trackingService.subscribe(order.id);
        }
      },
      error: () => {
        this.error.set('Failed to load active orders. Please try again.');
        this.loading.set(false);
      },
    });
  }

  getOrderStatus(order: Order): OrderStatus {
    const realtimeStatus = this.orderStatuses().get(order.id);
    return realtimeStatus ? realtimeStatus.status : order.status;
  }

  getOrderETA(order: Order): string | null {
    const realtimeETA = this.orderETAs().get(order.id);
    if (realtimeETA) return realtimeETA.estimatedArrival;
    return order.estimatedArrival;
  }

  isOutForDelivery(order: Order): boolean {
    return this.getOrderStatus(order) === OrderStatus.OutForDelivery;
  }

  trackByOrderId(_index: number, order: Order): string {
    return order.id;
  }
}
