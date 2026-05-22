import { Pool } from 'pg';
import { Namespace, Server as SocketIOServer } from 'socket.io';
import { getDatabasePool } from '../config/database';
import { OrderStatus } from '@shared/enums';

/**
 * WebSocket event payloads for order tracking.
 */
export interface StatusUpdatePayload {
  orderId: string;
  status: OrderStatus;
  timestamp: string;
}

export interface ETAUpdatePayload {
  orderId: string;
  eta: string | null;
  timestamp: string;
}

export interface DelayNotificationPayload {
  orderId: string;
  newEta: string | null;
  delayMinutes: number;
}

/** Default interval for ETA broadcasts (60 seconds) */
const DEFAULT_ETA_BROADCAST_INTERVAL_MS = 60_000;

/** Delay threshold in minutes before sending delay notification */
const DELAY_THRESHOLD_MINUTES = 15;

/**
 * CartTrackerService
 *
 * Manages real-time order tracking via WebSocket (Socket.IO).
 * Pushes order status changes, ETA updates, and delay notifications.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.5, 6.6, 6.7
 */
export class CartTrackerService {
  private pool: Pool;
  private trackingNamespace: Namespace | null;
  private etaBroadcastInterval: ReturnType<typeof setInterval> | null = null;
  private etaBroadcastIntervalMs: number;

  constructor(
    trackingNamespace: Namespace | null,
    pool?: Pool,
    etaBroadcastIntervalMs?: number,
  ) {
    this.pool = pool || getDatabasePool();
    this.trackingNamespace = trackingNamespace;
    this.etaBroadcastIntervalMs = etaBroadcastIntervalMs ?? DEFAULT_ETA_BROADCAST_INTERVAL_MS;
  }

  /**
   * Starts the periodic ETA broadcast for orders in "out_for_delivery" status.
   * Broadcasts updated ETA every configured interval (default 60 seconds).
   */
  startETABroadcast(): void {
    if (this.etaBroadcastInterval) {
      return; // Already running
    }

    this.etaBroadcastInterval = setInterval(async () => {
      await this.broadcastETAUpdates();
    }, this.etaBroadcastIntervalMs);
  }

  /**
   * Stops the periodic ETA broadcast interval.
   * Useful for testing and graceful shutdown.
   */
  stopETABroadcast(): void {
    if (this.etaBroadcastInterval) {
      clearInterval(this.etaBroadcastInterval);
      this.etaBroadcastInterval = null;
    }
  }

  /**
   * Updates an order's status and pushes the change via WebSocket within 5 seconds.
   *
   * @param orderId - The order UUID
   * @param status - The new order status
   */
  async updateStatus(orderId: string, status: OrderStatus): Promise<void> {
    // Update the order status in the database
    await this.pool.query(
      `UPDATE "order"
       SET status = $1, updated_at = NOW()
       WHERE id = $2`,
      [status, orderId],
    );

    // Push status change via WebSocket
    const payload: StatusUpdatePayload = {
      orderId,
      status,
      timestamp: new Date().toISOString(),
    };

    this.emitToOrder(orderId, 'order:status', payload);

    // If the order is now out for delivery, check and set initial ETA
    if (status === OrderStatus.OutForDelivery) {
      const eta = await this.calculateETA(orderId);
      if (eta) {
        await this.pool.query(
          `UPDATE "order"
           SET estimated_arrival = $1, updated_at = NOW()
           WHERE id = $2`,
          [eta.toISOString(), orderId],
        );
      }

      const etaPayload: ETAUpdatePayload = {
        orderId,
        eta: eta ? eta.toISOString() : null,
        timestamp: new Date().toISOString(),
      };
      this.emitToOrder(orderId, 'order:eta', etaPayload);
    }
  }

  /**
   * Calculates the estimated time of arrival for an order.
   * Uses the midpoint of the scheduled delivery window as the estimate.
   * Returns null if the delivery window is not set.
   *
   * @param orderId - The order UUID
   * @returns Estimated arrival Date or null if unavailable
   */
  async calculateETA(orderId: string): Promise<Date | null> {
    const result = await this.pool.query(
      `SELECT scheduled_delivery_start, scheduled_delivery_end, estimated_arrival
       FROM "order"
       WHERE id = $1`,
      [orderId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const order = result.rows[0];

    // If we already have an estimated_arrival set, return it
    if (order.estimated_arrival) {
      return new Date(order.estimated_arrival);
    }

    // Calculate ETA as midpoint of delivery window
    const start = order.scheduled_delivery_start
      ? new Date(order.scheduled_delivery_start)
      : null;
    const end = order.scheduled_delivery_end
      ? new Date(order.scheduled_delivery_end)
      : null;

    if (!start || !end) {
      return null;
    }

    const midpoint = new Date(
      start.getTime() + (end.getTime() - start.getTime()) / 2,
    );

    return midpoint;
  }

  /**
   * Checks if an order is delayed beyond the ETA by more than 15 minutes.
   * If delayed, sends a delay notification via WebSocket with the delay amount.
   *
   * @param orderId - The order UUID
   */
  async handleDelayNotification(orderId: string): Promise<void> {
    const result = await this.pool.query(
      `SELECT id, estimated_arrival, status, scheduled_delivery_start, scheduled_delivery_end
       FROM "order"
       WHERE id = $1`,
      [orderId],
    );

    if (result.rows.length === 0) {
      return;
    }

    const order = result.rows[0];

    // Only check delay for orders that are out for delivery
    if (order.status !== OrderStatus.OutForDelivery) {
      return;
    }

    const estimatedArrival = order.estimated_arrival
      ? new Date(order.estimated_arrival)
      : null;

    if (!estimatedArrival) {
      return;
    }

    const now = new Date();
    const delayMs = now.getTime() - estimatedArrival.getTime();
    const delayMinutes = Math.floor(delayMs / (1000 * 60));

    if (delayMinutes > DELAY_THRESHOLD_MINUTES) {
      // Calculate a new ETA estimate (add the delay to the original ETA)
      const newEta = new Date(now.getTime() + 10 * 60 * 1000); // Estimate 10 more minutes

      // Update the estimated_arrival in the database
      await this.pool.query(
        `UPDATE "order"
         SET estimated_arrival = $1, updated_at = NOW()
         WHERE id = $2`,
        [newEta.toISOString(), orderId],
      );

      const payload: DelayNotificationPayload = {
        orderId,
        newEta: newEta.toISOString(),
        delayMinutes,
      };

      this.emitToOrder(orderId, 'order:delay', payload);
    }
  }

  /**
   * Broadcasts ETA updates for all orders currently in "out_for_delivery" status.
   * Called periodically (every 60 seconds by default).
   */
  async broadcastETAUpdates(): Promise<void> {
    try {
      const result = await this.pool.query(
        `SELECT id, estimated_arrival, scheduled_delivery_start, scheduled_delivery_end
         FROM "order"
         WHERE status = $1`,
        [OrderStatus.OutForDelivery],
      );

      for (const order of result.rows) {
        const orderId = order.id;
        const eta = await this.calculateETA(orderId);

        const payload: ETAUpdatePayload = {
          orderId,
          eta: eta ? eta.toISOString() : null,
          timestamp: new Date().toISOString(),
        };

        this.emitToOrder(orderId, 'order:eta', payload);

        // Also check for delays
        await this.handleDelayNotification(orderId);
      }
    } catch (err) {
      // Log but don't crash the interval
      const message = err instanceof Error ? err.message : String(err);
      console.error(`CartTracker: ETA broadcast error - ${message}`);
    }
  }

  /**
   * Sets up WebSocket event handlers for the tracking namespace.
   * Handles client subscribe/unsubscribe events.
   *
   * Reconnection with exponential backoff (1s, 2s, 4s, max 30s) is configured
   * on the client side via Socket.IO client options.
   */
  setupSocketHandlers(): void {
    if (!this.trackingNamespace) {
      return;
    }

    this.trackingNamespace.on('connection', (socket) => {
      // Handle subscribe to order updates
      socket.on('subscribe', (orderId: string) => {
        if (orderId && typeof orderId === 'string') {
          socket.join(`order:${orderId}`);
        }
      });

      // Handle unsubscribe from order updates
      socket.on('unsubscribe', (orderId: string) => {
        if (orderId && typeof orderId === 'string') {
          socket.leave(`order:${orderId}`);
        }
      });

      // Handle disconnect (cleanup is automatic with Socket.IO rooms)
      socket.on('disconnect', () => {
        // Socket.IO automatically removes the socket from all rooms on disconnect
      });
    });
  }

  /**
   * Emits an event to all clients subscribed to a specific order.
   *
   * @param orderId - The order UUID (used as room name)
   * @param event - The event name to emit
   * @param payload - The data payload to send
   */
  private emitToOrder(orderId: string, event: string, payload: unknown): void {
    if (!this.trackingNamespace) {
      return;
    }
    this.trackingNamespace.to(`order:${orderId}`).emit(event, payload);
  }
}

/**
 * Socket.IO client reconnection configuration.
 * This should be used on the client side when connecting to the tracking namespace.
 *
 * Implements exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s.
 */
export const RECONNECTION_CONFIG = {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000, // Start at 1 second
  reconnectionDelayMax: 30000, // Max 30 seconds
  randomizationFactor: 0, // No randomization for predictable backoff
};
