import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { Order, DeliverySlot, Cart, CostBreakdown } from '@shared/interfaces';

export interface CheckoutSummary {
  cart: Cart;
  costBreakdown: CostBreakdown;
  deliveryAddress: string;
  paymentMethods: PaymentMethodOption[];
}

export interface PaymentMethodOption {
  id: 'credit_debit_card' | 'digital_wallet';
  label: string;
  icon: string;
}

export interface OrderConfirmResult {
  orderId: string;
  orderNumber: string;
  status: string;
  grandTotal: number;
  scheduledDeliveryStart: string;
  scheduledDeliveryEnd: string;
}

export interface StockConflictItem {
  productId: string;
  productName: string;
  requestedQuantity: number;
  availableQuantity: number;
}

export interface PaymentFailureInfo {
  message: string;
  retriesRemaining: number;
  retryCount: number;
}

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly ordersUrl = '/api/v1/orders';
  private readonly deliveryUrl = '/api/v1/delivery';

  constructor(private readonly http: HttpClient) {}

  initiateCheckout(): Observable<CheckoutSummary> {
    return this.http
      .post<{ data: CheckoutSummary }>(`${this.ordersUrl}/checkout`, {})
      .pipe(map((res) => res.data));
  }

  confirmOrder(payload: {
    paymentMethod: 'credit_debit_card' | 'digital_wallet';
    paymentDetails: Record<string, string>;
    deliverySlotId: string;
    retryCount: number;
  }): Observable<OrderConfirmResult> {
    return this.http
      .post<{ data: OrderConfirmResult }>(`${this.ordersUrl}/confirm`, payload)
      .pipe(map((res) => res.data));
  }

  getDeliverySlots(date: string): Observable<DeliverySlot[]> {
    const params = new HttpParams().set('date', date);
    return this.http
      .get<{ data: DeliverySlot[] }>(`${this.deliveryUrl}/slots`, { params })
      .pipe(map((res) => res.data));
  }

  getOrder(orderId: string): Observable<Order> {
    return this.http
      .get<{ data: Order }>(`${this.ordersUrl}/${orderId}`)
      .pipe(map((res) => res.data));
  }

  getActiveOrders(): Observable<Order[]> {
    return this.http
      .get<{ data: Order[] }>(`${this.ordersUrl}/active`)
      .pipe(map((res) => res.data));
  }

  formatPrice(amount: number): string {
    return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}
