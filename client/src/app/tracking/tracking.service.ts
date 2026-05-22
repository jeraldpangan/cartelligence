import { Injectable, signal, computed, OnDestroy, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { Order } from '@shared/interfaces';
import { OrderStatus } from '@shared/enums';

export interface TrackingStatusUpdate {
  orderId: string;
  status: OrderStatus;
  updatedAt: string;
}

export interface TrackingETAUpdate {
  orderId: string;
  estimatedArrival: string;
}

export interface TrackingDelayUpdate {
  orderId: string;
  newEstimatedArrival: string;
  delayMinutes: number;
}

export interface TrackingETAUnavailable {
  orderId: string;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class TrackingService implements OnDestroy {
  private socket: Socket | null = null;
  private readonly apiUrl = '/api/v1/orders';

  /** Whether the WebSocket is currently connected */
  readonly isConnected = signal(false);

  /** Timestamp of the last successful WebSocket message */
  readonly lastUpdated = signal<Date | null>(null);

  /** Current order statuses keyed by orderId */
  readonly orderStatuses = signal<Map<string, TrackingStatusUpdate>>(new Map());

  /** Current ETAs keyed by orderId */
  readonly orderETAs = signal<Map<string, TrackingETAUpdate>>(new Map());

  /** Minutes since last update (for offline indicator) */
  readonly stalenessMinutes = computed(() => {
    const last = this.lastUpdated();
    if (!last) return 0;
    return Math.floor((Date.now() - last.getTime()) / 60000);
  });

  constructor(
    private readonly http: HttpClient,
    private readonly ngZone: NgZone,
  ) {}

  /**
   * Fetch active orders from the REST API (up to 20).
   */
  getActiveOrders(): Observable<Order[]> {
    return this.http.get<Order[]>(`${this.apiUrl}/active`);
  }

  /**
   * Connect to the WebSocket tracking namespace with exponential backoff.
   */
  connect(): void {
    if (this.socket?.connected) return;

    this.ngZone.runOutsideAngular(() => {
      this.socket = io('/ws/tracking', {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
        reconnectionAttempts: Infinity,
        transports: ['websocket', 'polling'],
      });

      this.socket.on('connect', () => {
        this.ngZone.run(() => {
          this.isConnected.set(true);
          this.lastUpdated.set(new Date());
        });
      });

      this.socket.on('disconnect', () => {
        this.ngZone.run(() => {
          this.isConnected.set(false);
        });
      });

      this.socket.on('order:status', (data: TrackingStatusUpdate) => {
        this.ngZone.run(() => {
          const statuses = new Map(this.orderStatuses());
          statuses.set(data.orderId, data);
          this.orderStatuses.set(statuses);
          this.lastUpdated.set(new Date());
        });
      });

      this.socket.on('order:eta', (data: TrackingETAUpdate) => {
        this.ngZone.run(() => {
          const etas = new Map(this.orderETAs());
          etas.set(data.orderId, data);
          this.orderETAs.set(etas);
          this.lastUpdated.set(new Date());
        });
      });

      this.socket.on('order:delay', (data: TrackingDelayUpdate) => {
        this.ngZone.run(() => {
          const etas = new Map(this.orderETAs());
          etas.set(data.orderId, {
            orderId: data.orderId,
            estimatedArrival: data.newEstimatedArrival,
          });
          this.orderETAs.set(etas);
          this.lastUpdated.set(new Date());
        });
      });

      this.socket.on('order:eta_unavailable', (data: TrackingETAUnavailable) => {
        this.ngZone.run(() => {
          const etas = new Map(this.orderETAs());
          etas.delete(data.orderId);
          this.orderETAs.set(etas);
          this.lastUpdated.set(new Date());
        });
      });
    });
  }

  /**
   * Subscribe to real-time updates for a specific order.
   */
  subscribe(orderId: string): void {
    this.socket?.emit('subscribe', orderId);
  }

  /**
   * Unsubscribe from real-time updates for a specific order.
   */
  unsubscribe(orderId: string): void {
    this.socket?.emit('unsubscribe', orderId);
  }

  /**
   * Disconnect the WebSocket connection.
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected.set(false);
    }
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
