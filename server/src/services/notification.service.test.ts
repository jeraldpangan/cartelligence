import { Namespace } from 'socket.io';
import {
  NotificationService,
  StatusNotification,
  DelayNotification,
  EtaNotification,
  EtaUnavailableNotification,
} from './notification.service';
import { OrderStatus } from '@shared/enums';

/**
 * Creates a mock Socket.IO namespace for testing.
 */
function createMockNamespace() {
  const emitFn = jest.fn();
  const toFn = jest.fn().mockReturnValue({ emit: emitFn });
  const namespace = { to: toFn } as unknown as Namespace;
  return { namespace, toFn, emitFn };
}

describe('NotificationService', () => {
  let service: NotificationService;
  let mockNs: ReturnType<typeof createMockNamespace>;

  beforeEach(() => {
    jest.useFakeTimers();
    mockNs = createMockNamespace();
    service = new NotificationService(mockNs.namespace);
  });

  afterEach(() => {
    service.clearAllRetries();
    jest.useRealTimers();
  });

  describe('notifyStatusChange', () => {
    it('should emit order:status event to the correct room', () => {
      const orderId = 'order-123';
      const status = OrderStatus.BeingPrepared;

      service.notifyStatusChange(orderId, status);

      expect(mockNs.toFn).toHaveBeenCalledWith(`order:${orderId}`);
      expect(mockNs.emitFn).toHaveBeenCalledWith(
        'order:status',
        expect.objectContaining({
          orderId,
          status,
          timestamp: expect.any(String),
        }),
      );
    });

    it('should include a valid ISO timestamp', () => {
      const orderId = 'order-456';
      service.notifyStatusChange(orderId, OrderStatus.Confirmed);

      const payload = mockNs.emitFn.mock.calls[0][1] as StatusNotification;
      expect(new Date(payload.timestamp).toISOString()).toBe(payload.timestamp);
    });

    it('should emit for all order status types', () => {
      const orderId = 'order-789';
      const statuses = [
        OrderStatus.Confirmed,
        OrderStatus.BeingPrepared,
        OrderStatus.OutForDelivery,
        OrderStatus.Delivered,
      ];

      statuses.forEach((status) => {
        service.notifyStatusChange(orderId, status);
      });

      expect(mockNs.emitFn).toHaveBeenCalledTimes(4);
    });
  });

  describe('notifyDelay', () => {
    it('should emit order:delay when delay exceeds 15 minutes', () => {
      const orderId = 'order-delay-1';
      const originalEta = new Date(Date.now() - 20 * 60 * 1000); // 20 min ago
      const updatedEta = new Date(Date.now() + 10 * 60 * 1000); // 10 min from now

      service.notifyDelay(orderId, originalEta, updatedEta);

      expect(mockNs.toFn).toHaveBeenCalledWith(`order:${orderId}`);
      expect(mockNs.emitFn).toHaveBeenCalledWith(
        'order:delay',
        expect.objectContaining({
          orderId,
          delayMinutes: expect.any(Number),
          updatedEta: updatedEta.toISOString(),
          timestamp: expect.any(String),
        }),
      );

      const payload = mockNs.emitFn.mock.calls[0][1] as DelayNotification;
      expect(payload.delayMinutes).toBeGreaterThanOrEqual(20);
    });

    it('should NOT emit when delay is less than 15 minutes', () => {
      const orderId = 'order-delay-2';
      const originalEta = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago

      service.notifyDelay(orderId, originalEta, null);

      expect(mockNs.emitFn).not.toHaveBeenCalled();
    });

    it('should NOT emit when delay is exactly 15 minutes', () => {
      const orderId = 'order-delay-3';
      const originalEta = new Date(Date.now() - 15 * 60 * 1000); // exactly 15 min ago

      service.notifyDelay(orderId, originalEta, null);

      // At exactly 15 minutes, delayMs === DELAY_THRESHOLD_MS, so <= check means no emit
      expect(mockNs.emitFn).not.toHaveBeenCalled();
    });

    it('should handle null updatedEta', () => {
      const orderId = 'order-delay-4';
      const originalEta = new Date(Date.now() - 30 * 60 * 1000); // 30 min ago

      service.notifyDelay(orderId, originalEta, null);

      const payload = mockNs.emitFn.mock.calls[0][1] as DelayNotification;
      expect(payload.updatedEta).toBeNull();
    });
  });

  describe('notifyEtaUpdate', () => {
    it('should emit order:eta event with estimated arrival', () => {
      const orderId = 'order-eta-1';
      const eta = new Date(Date.now() + 30 * 60 * 1000);

      service.notifyEtaUpdate(orderId, eta);

      expect(mockNs.toFn).toHaveBeenCalledWith(`order:${orderId}`);
      expect(mockNs.emitFn).toHaveBeenCalledWith(
        'order:eta',
        expect.objectContaining({
          orderId,
          estimatedArrival: eta.toISOString(),
          timestamp: expect.any(String),
        }),
      );
    });
  });

  describe('notifyEtaUnavailable', () => {
    it('should emit order:eta_unavailable event', () => {
      const orderId = 'order-unavail-1';

      service.notifyEtaUnavailable(orderId);

      expect(mockNs.toFn).toHaveBeenCalledWith(`order:${orderId}`);
      expect(mockNs.emitFn).toHaveBeenCalledWith(
        'order:eta_unavailable',
        expect.objectContaining({
          orderId,
          message: 'Estimated time of arrival is temporarily unavailable',
          retryInSeconds: 60,
          timestamp: expect.any(String),
        }),
      );
    });

    it('should schedule retry when etaResolver is provided', () => {
      const orderId = 'order-unavail-2';
      const resolver = jest.fn().mockResolvedValue(null);

      service.notifyEtaUnavailable(orderId, resolver);

      // Initial emit
      expect(mockNs.emitFn).toHaveBeenCalledTimes(1);

      // Advance 60 seconds — should trigger retry
      jest.advanceTimersByTime(60 * 1000);

      // resolver returns null, so another eta_unavailable is emitted
      expect(resolver).toHaveBeenCalledTimes(1);
    });

    it('should emit order:eta and stop retrying when ETA becomes available', async () => {
      const orderId = 'order-unavail-3';
      const resolvedEta = new Date(Date.now() + 20 * 60 * 1000);
      const resolver = jest.fn().mockResolvedValue(resolvedEta);

      service.notifyEtaUnavailable(orderId, resolver);

      // Initial eta_unavailable emit
      expect(mockNs.emitFn).toHaveBeenCalledTimes(1);
      expect(mockNs.emitFn).toHaveBeenCalledWith('order:eta_unavailable', expect.anything());

      // Advance timer and flush promises
      jest.advanceTimersByTime(60 * 1000);
      await Promise.resolve(); // flush microtasks

      expect(resolver).toHaveBeenCalledTimes(1);
      // After resolver returns a date, order:eta should be emitted
      expect(mockNs.emitFn).toHaveBeenCalledWith(
        'order:eta',
        expect.objectContaining({
          orderId,
          estimatedArrival: resolvedEta.toISOString(),
        }),
      );
    });

    it('should not schedule retry when no etaResolver is provided', () => {
      const orderId = 'order-unavail-4';

      service.notifyEtaUnavailable(orderId);

      jest.advanceTimersByTime(120 * 1000);

      // Only the initial emit, no retries
      expect(mockNs.emitFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('clearEtaRetry', () => {
    it('should stop retry timer for a specific order', () => {
      const orderId = 'order-clear-1';
      const resolver = jest.fn().mockResolvedValue(null);

      service.notifyEtaUnavailable(orderId, resolver);
      service.clearEtaRetry(orderId);

      jest.advanceTimersByTime(120 * 1000);

      // Resolver should never be called since timer was cleared
      expect(resolver).not.toHaveBeenCalled();
    });

    it('should handle clearing a non-existent timer gracefully', () => {
      expect(() => service.clearEtaRetry('non-existent')).not.toThrow();
    });
  });

  describe('clearAllRetries', () => {
    it('should stop all active retry timers', () => {
      const resolver1 = jest.fn().mockResolvedValue(null);
      const resolver2 = jest.fn().mockResolvedValue(null);

      service.notifyEtaUnavailable('order-a', resolver1);
      service.notifyEtaUnavailable('order-b', resolver2);

      service.clearAllRetries();

      jest.advanceTimersByTime(120 * 1000);

      expect(resolver1).not.toHaveBeenCalled();
      expect(resolver2).not.toHaveBeenCalled();
    });
  });

  describe('static constants', () => {
    it('should expose DELAY_THRESHOLD_MS as 15 minutes', () => {
      expect(NotificationService.DELAY_THRESHOLD_MS).toBe(15 * 60 * 1000);
    });

    it('should expose ETA_RETRY_INTERVAL_MS as 60 seconds', () => {
      expect(NotificationService.ETA_RETRY_INTERVAL_MS).toBe(60 * 1000);
    });

    it('should expose STATUS_NOTIFICATION_DEADLINE_MS as 5 seconds', () => {
      expect(NotificationService.STATUS_NOTIFICATION_DEADLINE_MS).toBe(5000);
    });
  });
});
