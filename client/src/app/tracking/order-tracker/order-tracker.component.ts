import { Component, input, computed } from '@angular/core';
import { MatStepperModule } from '@angular/material/stepper';
import { MatIconModule } from '@angular/material/icon';
import { OrderStatus } from '@shared/enums';

const STATUS_STEPS: { status: OrderStatus; label: string; icon: string }[] = [
  { status: OrderStatus.Confirmed, label: 'Confirmed', icon: 'check_circle' },
  { status: OrderStatus.BeingPrepared, label: 'Being Prepared', icon: 'inventory_2' },
  { status: OrderStatus.OutForDelivery, label: 'Out for Delivery', icon: 'local_shipping' },
  { status: OrderStatus.Delivered, label: 'Delivered', icon: 'home' },
];

@Component({
  selector: 'app-order-tracker',
  standalone: true,
  imports: [MatStepperModule, MatIconModule],
  templateUrl: './order-tracker.component.html',
  styleUrl: './order-tracker.component.scss',
})
export class OrderTrackerComponent {
  readonly currentStatus = input.required<OrderStatus>();
  readonly orderNumber = input.required<string>();

  readonly steps = STATUS_STEPS;

  readonly activeStepIndex = computed(() => {
    const status = this.currentStatus();
    const index = STATUS_STEPS.findIndex((s) => s.status === status);
    return index >= 0 ? index : 0;
  });

  isStepCompleted(stepIndex: number): boolean {
    return stepIndex < this.activeStepIndex();
  }

  isStepActive(stepIndex: number): boolean {
    return stepIndex === this.activeStepIndex();
  }
}
