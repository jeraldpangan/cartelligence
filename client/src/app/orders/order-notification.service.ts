import { Inject, Injectable, InjectionToken, NgZone, OnDestroy, Optional, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { io, Socket } from 'socket.io-client';
import { AuthService } from '../auth/auth.service';
import { OrderStatus } from '@shared/enums';

/**
 * Payload received on the `order:status` WebSocket event.
 * Matches the backend OrderStatusPayload interface.
 */
export interface OrderStatusUpdate {
  orderId: string;
  status: OrderStatus;
  updatedAt: string;
}

/** Human-readable labels for each order status. */
const STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.Confirmed]: 'Confirmed',
  [OrderStatus.BeingPrepared]: 'Being Prepared',
  [OrderStatus.OutForDelivery]: 'Out for Delivery',
  [OrderStatus.Delivered]: 'Delivered',
  [OrderStatus.Cancelled]: 'Cancelled',
};

/**
 * Optional injection token for a socket factory function.
 * Provide this in tests to inject a mock socket instead of a real Socket.IO connection.
 */
export type SocketFactory = (url: string, options: object) => Socket;
export const SOCKET_FACTORY = new InjectionToken<SocketFactory>('SOCKET_FACTORY');

/**
 * OrderNotificationService
 *
 * Manages the buyer-side WebSocket connection to the `/ws/notifications`
 * Socket.IO namespace for real-time order status updates.
 *
 * Features:
 * - Connects with JWT authentication on user login (Req 9.3)
 * - Rejects connections with invalid/expired JWT (Req 9.4)
 * - Listens for `order:status` events and updates in-memory order state (Req 9.1)
 * - Handles reconnection with exponential backoff; missed events are delivered
 *   by the server on reconnect (Req 9.2)
 * - Displays a Material snackbar notification to the buyer on each status change
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */
@Injectable({ providedIn: 'root' })
export class OrderNotificationService implements OnDestroy {
  private socket: Socket | null = null;
  private readonly socketFactory: SocketFactory;

  /** Whether the WebSocket is currently connected. */
  readonly isConnected = signal(false);

  /**
   * Current order statuses keyed by orderId.
   * Components can read this signal to get the latest real-time status
   * without re-fetching from the REST API.
   */
  readonly orderStatuses = signal<Map<string, OrderStatusUpdate>>(new Map());

  constructor(
    private readonly authService: AuthService,
    private readonly snackBar: MatSnackBar,
    private readonly ngZone: NgZone,
    @Optional() @Inject(SOCKET_FACTORY) socketFactory: SocketFactory | null,
  ) {
    // Use the injected factory in tests; fall back to the real socket.io `io` function
    this.socketFactory = socketFactory ?? ((url, options) => io(url, options));
  }

  /**
   * Establishes the WebSocket connection to the notifications namespace.
   *
   * The JWT access token is passed in the Socket.IO handshake `auth` object
   * so the server can authenticate the connection before accepting it.
   *
   * Call this after a successful login (buyer role only).
   *
   * Requirements: 9.3
   */
  connect(): void {
    if (this.socket?.connected) {
      return;
    }

    const token = this.authService.getAccessToken();
    if (!token) {
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      this.socket = this.socketFactory('/ws/notifications', {
        auth: { token },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
        reconnectionAttempts: Infinity,
        transports: ['websocket', 'polling'],
      });

      this.socket.on('connect', () => {
        this.ngZone.run(() => {
          this.isConnected.set(true);
        });
      });

      this.socket.on('disconnect', () => {
        this.ngZone.run(() => {
          this.isConnected.set(false);
        });
      });

      /**
       * Handle `order:status` events emitted by the server.
       *
       * Updates the in-memory orderStatuses map and shows a snackbar
       * notification to the buyer.
       *
       * Requirements: 9.1, 9.2
       */
      this.socket.on('order:status', (data: OrderStatusUpdate) => {
        this.ngZone.run(() => {
          // Update the reactive state map
          const statuses = new Map(this.orderStatuses());
          statuses.set(data.orderId, data);
          this.orderStatuses.set(statuses);

          // Show a toast notification to the buyer
          this.showStatusNotification(data);
        });
      });

      /**
       * Handle authentication errors from the server.
       * The server rejects connections with invalid/expired JWTs (Req 9.4).
       */
      this.socket.on('connect_error', (err: Error) => {
        this.ngZone.run(() => {
          this.isConnected.set(false);
          console.warn(`OrderNotification: connection error — ${err.message}`);
        });
      });
    });
  }

  /**
   * Disconnects the WebSocket and clears all state.
   *
   * Call this on user logout.
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected.set(false);
    this.orderStatuses.set(new Map());
  }

  /**
   * Returns the latest known status for a given order.
   * Returns null if no real-time update has been received for this order.
   */
  getOrderStatus(orderId: string): OrderStatusUpdate | null {
    return this.orderStatuses().get(orderId) ?? null;
  }

  /**
   * Displays a Material snackbar notification informing the buyer of the
   * new order status.
   */
  private showStatusNotification(update: OrderStatusUpdate): void {
    const label = STATUS_LABELS[update.status] ?? update.status;
    const message = `Order update: your order is now "${label}"`;

    this.snackBar.open(message, 'Dismiss', {
      duration: 6000,
      panelClass: ['order-notification-snackbar'],
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
    });
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
