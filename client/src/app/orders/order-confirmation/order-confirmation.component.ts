import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject, takeUntil } from 'rxjs';
import { Order } from '@shared/interfaces';
import { OrderService } from '../order.service';

@Component({
  selector: 'app-order-confirmation',
  standalone: true,
  imports: [
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './order-confirmation.component.html',
  styleUrl: './order-confirmation.component.scss',
})
export class OrderConfirmationComponent implements OnInit, OnDestroy {
  private readonly orderService = inject(OrderService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroy$ = new Subject<void>();

  order: Order | null = null;
  loading = true;
  errorMessage = '';

  ngOnInit(): void {
    const orderId = this.route.snapshot.paramMap.get('orderId');
    if (!orderId) {
      this.router.navigate(['/catalog']);
      return;
    }
    this.loadOrder(orderId);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadOrder(orderId: string): void {
    this.loading = true;
    this.orderService
      .getOrder(orderId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (order) => {
          this.order = order;
          this.loading = false;
        },
        error: () => {
          this.errorMessage = 'Unable to load order details.';
          this.loading = false;
        },
      });
  }

  formatPrice(amount: number): string {
    return this.orderService.formatPrice(amount);
  }

  formatDeliveryTime(): string {
    if (!this.order) return '';
    const start = new Date(this.order.scheduledDeliveryStart);
    const end = new Date(this.order.scheduledDeliveryEnd);

    const dateStr = start.toLocaleDateString('en-PH', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
    const startTime = start.toLocaleTimeString('en-PH', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    const endTime = end.toLocaleTimeString('en-PH', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    return `${dateStr}, ${startTime} – ${endTime}`;
  }
}
