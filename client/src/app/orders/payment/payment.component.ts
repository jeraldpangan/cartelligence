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
  private readonly fb = inject(FormBuilder);

  maxRetries = input(3);
  paymentSubmit = output<PaymentSubmitEvent>();

  selectedMethod = signal<'credit_debit_card' | 'digital_wallet'>('credit_debit_card');
  processing = signal(false);
  retryCount = signal(0);
  errorMessage = signal('');

  cardForm: FormGroup = this.fb.group({
    cardNumber: ['', [Validators.required, Validators.pattern(/^\d{16}$/)]],
    expiryDate: ['', [Validators.required, Validators.pattern(/^(0[1-9]|1[0-2])\/\d{2}$/)]],
    cvv: ['', [Validators.required, Validators.pattern(/^\d{3,4}$/)]],
    cardholderName: ['', [Validators.required, Validators.minLength(2)]],
  });

  walletForm: FormGroup = this.fb.group({
    walletId: ['', [Validators.required, Validators.email]],
  });

  get currentForm(): FormGroup {
    return this.selectedMethod() === 'credit_debit_card' ? this.cardForm : this.walletForm;
  }

  get canRetry(): boolean {
    return this.retryCount() < this.maxRetries();
  }

  get retriesRemaining(): number {
    return this.maxRetries() - this.retryCount();
  }

  selectMethod(method: 'credit_debit_card' | 'digital_wallet'): void {
    this.selectedMethod.set(method);
    this.errorMessage.set('');
  }

  submitPayment(): void {
    const form = this.currentForm;
    if (form.invalid) {
      form.markAllAsTouched();
      return;
    }

    this.processing.set(true);
    this.errorMessage.set('');

    const paymentDetails: Record<string, string> = {};
    if (this.selectedMethod() === 'credit_debit_card') {
      paymentDetails['cardNumber'] = this.cardForm.value.cardNumber;
      paymentDetails['expiryDate'] = this.cardForm.value.expiryDate;
      paymentDetails['cvv'] = this.cardForm.value.cvv;
      paymentDetails['cardholderName'] = this.cardForm.value.cardholderName;
    } else {
      paymentDetails['walletId'] = this.walletForm.value.walletId;
    }

    this.paymentSubmit.emit({
      paymentMethod: this.selectedMethod(),
      paymentDetails,
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
