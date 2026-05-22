import { Component, inject, output, signal, input } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

export interface PaymentSubmitEvent {
  paymentMethod: 'credit_debit_card' | 'digital_wallet';
  paymentDetails: Record<string, string>;
}

@Component({
  selector: 'app-payment',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './payment.component.html',
  styleUrl: './payment.component.scss',
})
export class PaymentComponent {
  maxRetries = input(3);
  paymentSubmit = output<PaymentSubmitEvent>();

  processing = signal(false);
  retryCount = signal(0);
  errorMessage = signal('');

  get canRetry(): boolean {
    return this.retryCount() < this.maxRetries();
  }

  get retriesRemaining(): number {
    return this.maxRetries() - this.retryCount();
  }

  submitPayment(): void {
    this.processing.set(true);
    this.errorMessage.set('');

    this.paymentSubmit.emit({
      paymentMethod: 'digital_wallet',
      paymentDetails: { walletId: 'test@cartelligence.com' },
    });
  }

  handlePaymentFailure(message: string): void {
    this.processing.set(false);
    this.retryCount.update((count) => count + 1);
    this.errorMessage.set(message);
  }

  handlePaymentSuccess(): void {
    this.processing.set(false);
  }

  resetRetries(): void {
    this.retryCount.set(0);
    this.errorMessage.set('');
  }
}
