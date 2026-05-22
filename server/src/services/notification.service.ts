import { Namespace } from 'socket.io';
import { OrderStatus } from '@shared/enums';

/** Delay threshold in milliseconds (15 minutes) */
const DELAY_THRESHOLD_MS = 15 * 60 * 1000;

/** ETA retry interval in milliseconds (60 seconds) */
const ETA_RETRY_INTERVAL_MS = 60 * 1000;

/** Maximum time allowed for status notification delivery (5 seconds) */
const STATUS_NOTIFICATION_DEADLINE_MS = 5000;

/**
 * Payload emitted on `order:status` events.
 */
export interface StatusNotification {
  orderId: string;
  status: OrderStatus;
  timestamp: string;
}

/**
 * Payload emitted on `order:delay` events.
 */
export interface DelayNotification {
  orderId: string;
  delayMinutes: number;
  updatedEta: string | null;
  timestamp: string;
}

/**
 * Payload emitted on `order:eta` events.
 */
export interface EtaNotification {
  orderId: string;
  estimatedArrival: string;
  timestamp: string;
}

/**
 * Payload emitted on `order:eta_unavailable` events.
 */
export interface EtaUnavailableNotification {
  orderId: string;
  message: string;
  retryInSeconds: number;
  timestamp: string;
}

/**
 * NotificationService is a thin wrapper around Socket.IO that emits
 * real-time tracking events to clients subscribed to specific order rooms.
 *
 * Clients join rooms named `order:${orderId}` via the `subscribe` event
 * on the `/ws/tracking` namespace.
 */
export class NotificationService {
  private namespace: Namespace;
  private etaRetryTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(namespace: Namespace) {
    this.namespace = namespace;
  }

  /**
   * Push an order status change notification to all clients subscribed
   * to the given order. Must be delivered within 5 seconds of the status change.
   *
   * Requirements: 6.2
   */
  notifyStatusChange(orderId: string, status: OrderStatus): void {
    const payload: StatusNotification = {
      orderId,
      status,
      timestamp: new Date().toISOString(),
    };

    this.namespace.to(`order:${orderId}`).emit('order:status', payload);
  }

  /**
   * Push a delay notification when delivery is more than 15 minutes past ETA.
   * Calculates the delay from the original ETA and includes an updated ETA if available.
   *
   * Requirements: 6.5
   */
  notifyDelay(orderId: string, originalEta: Date, updatedEta: Date | null): void {
    const now = new Date();
    const delayMs = now.getTime() - originalEta.getTime();

    // Only notify if delay exceeds 15-minute threshold
    if (delayMs <= DELAY_THRESHOLD_MS) {
      return;
    }

    const delayMinutes = Math.floor(delayMs / (60 * 1000));

    const payload: DelayNotification = {
      orderId,
      delayMinutes,
      updatedEta: updatedEta ? updatedEta.toISOString() : null,
      timestamp: now.toISOString(),
    };

    this.namespace.to(`order:${orderId}`).emit('order:delay', payload);
  }

  /**
   * Push an ETA update to subscribed clients. Called every 60 seconds
   * while an order is in "out_for_delivery" status.
   *
   * Requirements: 6.3
   */
  notifyEtaUpdate(orderId: string, estimatedArrival: Date): void {
    const payload: EtaNotification = {
      orderId,
      estimatedArrival: estimatedArrival.toISOString(),
      timestamp: new Date().toISOString(),
    };

    this.namespace.to(`order:${orderId}`).emit('order:eta', payload);
  }

  /**
   * Push an ETA unavailability message and schedule automatic retries
   * every 60 seconds until ETA becomes available or the order is no longer
   * in "out_for_delivery" status.
   *
   * Requirements: 6.7
   *
   * @param orderId - The order whose ETA is unavailable
   * @param etaResolver - Async function that attempts to resolve the ETA.
   *   Returns a Date if ETA becomes available, or null if still unavailable.
   */
  notifyEtaUnavailable(
    orderId: string,
    etaResolver?: () => Promise<Date | null>,
  ): void {
    const payload: EtaUnavailableNotification = {
      orderId,
      message: 'Estimated time of arrival is temporarily unavailable',
      retryInSeconds: ETA_RETRY_INTERVAL_MS / 1000,
      timestamp: new Date().toISOString(),
    };

    this.namespace.to(`order:${orderId}`).emit('order:eta_unavailable', payload);

    // Schedule retry if a resolver is provided
    if (etaResolver) {
      this.scheduleEtaRetry(orderId, etaResolver);
    }
  }

  /**
   * Schedule periodic ETA resolution attempts every 60 seconds.
   * When ETA becomes available, emits an `order:eta` event and stops retrying.
   */
  private scheduleEtaRetry(
    orderId: string,
    etaResolver: () => Promise<Date | null>,
  ): void {
    // Clear any existing retry timer for this order
    this.clearEtaRetry(orderId);

    const timer = setInterval(async () => {
      try {
        const eta = await etaResolver();
        if (eta) {
          // ETA resolved — emit update and stop retrying
          this.notifyEtaUpdate(orderId, eta);
          this.clearEtaRetry(orderId);
        } else {
          // Still unavailable — notify again
          const retryPayload: EtaUnavailableNotification = {
            orderId,
            message: 'Estimated time of arrival is temporarily unavailable',
            retryInSeconds: ETA_RETRY_INTERVAL_MS / 1000,
            timestamp: new Date().toISOString(),
          };
          this.namespace.to(`order:${orderId}`).emit('order:eta_unavailable', retryPayload);
        }
      } catch {
        // Silently continue retrying on errors
      }
    }, ETA_RETRY_INTERVAL_MS);

    this.etaRetryTimers.set(orderId, timer);
  }

  /**
   * Clear the ETA retry timer for a specific order.
   * Should be called when the order leaves "out_for_delivery" status
   * or when ETA becomes available.
   */
  clearEtaRetry(orderId: string): void {
    const timer = this.etaRetryTimers.get(orderId);
    if (timer) {
      clearInterval(timer);
      this.etaRetryTimers.delete(orderId);
    }
  }

  /**
   * Clear all active ETA retry timers. Useful for graceful shutdown.
   */
  clearAllRetries(): void {
    for (const [orderId] of this.etaRetryTimers) {
      this.clearEtaRetry(orderId);
    }
  }

  /**
   * Returns the delay threshold in milliseconds (15 minutes).
   * Exposed for testing purposes.
   */
  static get DELAY_THRESHOLD_MS(): number {
    return DELAY_THRESHOLD_MS;
  }

  /**
   * Returns the ETA retry interval in milliseconds (60 seconds).
   * Exposed for testing purposes.
   */
  static get ETA_RETRY_INTERVAL_MS(): number {
    return ETA_RETRY_INTERVAL_MS;
  }

  /**
   * Returns the status notification deadline in milliseconds (5 seconds).
   * Exposed for testing purposes.
   */
  static get STATUS_NOTIFICATION_DEADLINE_MS(): number {
    return STATUS_NOTIFICATION_DEADLINE_MS;
  }
}
