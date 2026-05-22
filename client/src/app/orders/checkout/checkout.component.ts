import { Component, inject, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatStepperModule } from '@angular/material/stepper';
import { Subject, takeUntil } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { DeliverySlot } from '@shared/interfaces';
import { OrderService, CheckoutSummary, StockConflictItem } from '../order.service';
import { DeliverySchedulerComponent } from '../delivery-scheduler/delivery-scheduler.component';
import { PaymentComponent, PaymentSubmitEvent } from '../payment/payment.component';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatStepperModule,
    DeliverySchedulerComponent,
    PaymentComponent,
  ],
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.scss',
})
export class CheckoutComponent implements OnInit, OnDestroy {
  private readonly orderService = inject(OrderService);
  private readonly router = inject(Router);
  private readonly destroy$ = new Subject<void>();

  @ViewChild(PaymentComponent) paymentComponent!: PaymentComponent;

  checkoutSummary: CheckoutSummary | null = null;
  selectedSlot: DeliverySlot | null = null;
  loading = true;
  errorMessage = '';
  stockConflicts: StockConflictItem[] = [];
  currentStep = 0;

  ngOnInit(): void {
    this.initiateCheckout();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initiateCheckout(): void {
    this.loading = true;
    this.errorMessage = '';
    this.stockConflicts = [];

    this.orderService
      .initiateCheckout()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (summary) => {
          this.checkoutSummary = summary;
          this.loading = false;
        },
        error: (err: HttpErrorResponse) => {
          this.loading = false;
          if (err.status === 400) {
            this.errorMessage = 'Your cart is empty. Add items before checking out.';
          } else {
            this.errorMessage = 'Unable to initiate checkout. Please try again.';
          }
        },
      });
  }

  onSlotSelected(slot: DeliverySlot): void {
    this.selectedSlot = slot;
  }

  onPaymentSubmit(event: PaymentSubmitEvent): void {
    if (!this.selectedSlot) {
      this.errorMessage = 'Please select a delivery time slot.';
      this.paymentComponent.handlePaymentSuccess();
      return;
    }

    this.orderService
      .confirmOrder({
        paymentMethod: event.paymentMethod,
        paymentDetails: event.paymentDetails,
        deliverySlotId: this.selectedSlot.id,
        retryCount: this.paymentComponent.retryCount(),
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.paymentComponent.handlePaymentSuccess();
          this.router.navigate(['/orders/confirmation', result.orderId]);
        },
        error: (err: HttpErrorResponse) => {
          this.handleOrderError(err);
        },
      });
  }

  private handleOrderError(err: HttpErrorResponse): void {
    if (err.status === 409) {
      // Stock conflict
      this.stockConflicts = err.error?.unavailableItems || [];
      this.errorMessage = 'Some items in your cart are no longer available in the requested quantity.';
      this.paymentComponent.handlePaymentSuccess();
    } else if (err.status === 402) {
      // Payment failure
      const message = err.error?.message || 'Payment failed. Please try again.';
      this.paymentComponent.handlePaymentFailure(message);
    } else {
      this.paymentComponent.handlePaymentFailure('An unexpected error occurred. Please try again.');
    }
  }

  proceedToDelivery(): void {
    this.currentStep = 1;
  }

  proceedToPayment(): void {
    if (!this.selectedSlot) {
      this.errorMessage = 'Please select a delivery time slot.';
      return;
    }
    this.errorMessage = '';
    this.currentStep = 2;
  }

  goBack(step: number): void {
    this.currentStep = step;
    this.errorMessage = '';
  }

  formatPrice(amount: number): string {
    return this.orderService.formatPrice(amount);
  }
}
