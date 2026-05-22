import { CartTrackerService, RECONNECTION_CONFIG } from './cart-tracker.service';
import { OrderStatus } from '@shared/enums';

// Mock the database pool
const mockQuery = jest.fn();
const mockPool = {
  query: mockQuery,
} as any;

// Mock Socket.IO namespace
const mockEmit = jest.fn();
const mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
const mockSocketJoin = jest.fn();
const mockSocketLeave = jest.fn();
const mockSocketOn = jest.fn();
const mockNamespaceOn = jest.fn();

const mockNamespace = {
  to: mockTo,
  on: mockNamespaceOn,
} as any;

describe('CartTrackerService', () => {
  let service: CartTrackerService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    service = new CartTrackerService(mockNamespace, mockPool);
  });

  afterEach(() => {
    service.stopETABroadcast();
    jest.useRealTimers();
  });

  describe('updateStatus', () => {
    it('should update order status in database and emit via WebSocket', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE order status

      await service.updateStatus('order-123', OrderStatus.BeingPrepared);

      // Verify database update
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE "order"'),
        [OrderStatus.BeingPrepared, 'order-123'],
      );

      // Verify WebSocket emission
      expect(mockTo).toHaveBeenCalledWith('order:order-123');
      expect(mockEmit).toHaveBeenCalledWith(
        'order:status',
        expect.objectContaining({
          orderId: 'order-123',
          status: OrderStatus.BeingPrepared,
          timestamp: expect.any(String),
        }),
      );
    });

    it('should calculate and emit ETA when status changes to out_for_delivery', async () => {
      const scheduledStart = new Date('2024-01-15T10:00:00+08:00');
      const scheduledEnd = new Date('2024-01-15T12:00:00+08:00');

      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // UPDATE order status
        .mockResolvedValueOnce({
          rows: [{
            scheduled_delivery_start: scheduledStart.toISOString(),
            scheduled_delivery_end: scheduledEnd.toISOString(),
            estimated_arrival: null,
          }],
        }) // SELECT for calculateETA
        .mockResolvedValueOnce({ rows: [] }); // UPDATE estimated_arrival

      await service.updateStatus('order-123', OrderStatus.OutForDelivery);

      // Should emit both status and ETA events
      expect(mockEmit).toHaveBeenCalledWith(
        'order:status',
        expect.objectContaining({
          orderId: 'order-123',
          status: OrderStatus.OutForDelivery,
        }),
      );
      expect(mockEmit).toHaveBeenCalledWith(
        'order:eta',
        expect.objectContaining({
          orderId: 'order-123',
          eta: expect.any(String),
        }),
      );
    });

    it('should emit null ETA when delivery window is not set', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // UPDATE order status
        .mockResolvedValueOnce({
          rows: [{
            scheduled_delivery_start: null,
            scheduled_delivery_end: null,
            estimated_arrival: null,
          }],
        }); // SELECT for calculateETA

      await service.updateStatus('order-123', OrderStatus.OutForDelivery);

      expect(mockEmit).toHaveBeenCalledWith(
        'order:eta',
        expect.objectContaining({
          orderId: 'order-123',
          eta: null,
        }),
      );
    });
  });

  describe('calculateETA', () => {
    it('should return midpoint of delivery window when no estimated_arrival exists', async () => {
      const start = new Date('2024-01-15T10:00:00+08:00');
      const end = new Date('2024-01-15T12:00:00+08:00');
      const expectedMidpoint = new Date('2024-01-15T11:00:00+08:00');

      mockQuery.mockResolvedValueOnce({
        rows: [{
          scheduled_delivery_start: start.toISOString(),
          scheduled_delivery_end: end.toISOString(),
          estimated_arrival: null,
        }],
      });

      const eta = await service.calculateETA('order-123');

      expect(eta).toEqual(expectedMidpoint);
    });

    it('should return existing estimated_arrival if already set', async () => {
      const existingETA = new Date('2024-01-15T11:30:00+08:00');

      mockQuery.mockResolvedValueOnce({
        rows: [{
          scheduled_delivery_start: '2024-01-15T10:00:00+08:00',
          scheduled_delivery_end: '2024-01-15T12:00:00+08:00',
          estimated_arrival: existingETA.toISOString(),
        }],
      });

      const eta = await service.calculateETA('order-123');

      expect(eta).toEqual(existingETA);
    });

    it('should return null when order not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const eta = await service.calculateETA('nonexistent-order');

      expect(eta).toBeNull();
    });

    it('should return null when delivery window is not set', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          scheduled_delivery_start: null,
          scheduled_delivery_end: null,
          estimated_arrival: null,
        }],
      });

      const eta = await service.calculateETA('order-123');

      expect(eta).toBeNull();
    });
  });

  describe('handleDelayNotification', () => {
    it('should send delay notification when order is >15 minutes past ETA', async () => {
      const pastETA = new Date(Date.now() - 20 * 60 * 1000); // 20 minutes ago

      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 'order-123',
            estimated_arrival: pastETA.toISOString(),
            status: OrderStatus.OutForDelivery,
            scheduled_delivery_start: '2024-01-15T10:00:00+08:00',
            scheduled_delivery_end: '2024-01-15T12:00:00+08:00',
          }],
        })
        .mockResolvedValueOnce({ rows: [] }); // UPDATE estimated_arrival

      await service.handleDelayNotification('order-123');

      expect(mockEmit).toHaveBeenCalledWith(
        'order:delay',
        expect.objectContaining({
          orderId: 'order-123',
          delayMinutes: expect.any(Number),
          newEta: expect.any(String),
        }),
      );

      // Verify delay is at least 15 minutes
      const delayPayload = mockEmit.mock.calls[0][1];
      expect(delayPayload.delayMinutes).toBeGreaterThan(15);
    });

    it('should not send notification when delay is <= 15 minutes', async () => {
      const recentETA = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'order-123',
          estimated_arrival: recentETA.toISOString(),
          status: OrderStatus.OutForDelivery,
          scheduled_delivery_start: '2024-01-15T10:00:00+08:00',
          scheduled_delivery_end: '2024-01-15T12:00:00+08:00',
        }],
      });

      await service.handleDelayNotification('order-123');

      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('should not send notification for non-delivery orders', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'order-123',
          estimated_arrival: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
          status: OrderStatus.Confirmed,
          scheduled_delivery_start: '2024-01-15T10:00:00+08:00',
          scheduled_delivery_end: '2024-01-15T12:00:00+08:00',
        }],
      });

      await service.handleDelayNotification('order-123');

      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('should not send notification when ETA is not set', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'order-123',
          estimated_arrival: null,
          status: OrderStatus.OutForDelivery,
          scheduled_delivery_start: '2024-01-15T10:00:00+08:00',
          scheduled_delivery_end: '2024-01-15T12:00:00+08:00',
        }],
      });

      await service.handleDelayNotification('order-123');

      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('should not send notification when order not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.handleDelayNotification('nonexistent-order');

      expect(mockEmit).not.toHaveBeenCalled();
    });
  });

  describe('ETA broadcast', () => {
    it('should broadcast ETA updates for all out_for_delivery orders', async () => {
      const eta = new Date('2024-01-15T11:00:00+08:00');

      // broadcastETAUpdates query for out_for_delivery orders
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'order-1', estimated_arrival: eta.toISOString(), scheduled_delivery_start: '2024-01-15T10:00:00+08:00', scheduled_delivery_end: '2024-01-15T12:00:00+08:00' },
          { id: 'order-2', estimated_arrival: eta.toISOString(), scheduled_delivery_start: '2024-01-15T14:00:00+08:00', scheduled_delivery_end: '2024-01-15T16:00:00+08:00' },
        ],
      });

      // calculateETA queries for each order
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ scheduled_delivery_start: '2024-01-15T10:00:00+08:00', scheduled_delivery_end: '2024-01-15T12:00:00+08:00', estimated_arrival: eta.toISOString() }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'order-1', estimated_arrival: eta.toISOString(), status: OrderStatus.OutForDelivery, scheduled_delivery_start: '2024-01-15T10:00:00+08:00', scheduled_delivery_end: '2024-01-15T12:00:00+08:00' }],
        })
        .mockResolvedValueOnce({
          rows: [{ scheduled_delivery_start: '2024-01-15T14:00:00+08:00', scheduled_delivery_end: '2024-01-15T16:00:00+08:00', estimated_arrival: eta.toISOString() }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'order-2', estimated_arrival: eta.toISOString(), status: OrderStatus.OutForDelivery, scheduled_delivery_start: '2024-01-15T14:00:00+08:00', scheduled_delivery_end: '2024-01-15T16:00:00+08:00' }],
        });

      await service.broadcastETAUpdates();

      // Should emit ETA for both orders
      expect(mockTo).toHaveBeenCalledWith('order:order-1');
      expect(mockTo).toHaveBeenCalledWith('order:order-2');
      expect(mockEmit).toHaveBeenCalledWith(
        'order:eta',
        expect.objectContaining({ orderId: 'order-1' }),
      );
      expect(mockEmit).toHaveBeenCalledWith(
        'order:eta',
        expect.objectContaining({ orderId: 'order-2' }),
      );
    });

    it('should start and stop ETA broadcast interval', () => {
      service.startETABroadcast();

      // Verify interval is set (by checking that broadcastETAUpdates would be called)
      expect(jest.getTimerCount()).toBe(1);

      service.stopETABroadcast();

      expect(jest.getTimerCount()).toBe(0);
    });

    it('should not start multiple intervals', () => {
      service.startETABroadcast();
      service.startETABroadcast(); // Second call should be no-op

      expect(jest.getTimerCount()).toBe(1);

      service.stopETABroadcast();
    });

    it('should handle errors gracefully during broadcast', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      mockQuery.mockRejectedValueOnce(new Error('Database connection lost'));

      await service.broadcastETAUpdates();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('CartTracker: ETA broadcast error'),
      );

      consoleSpy.mockRestore();
    });
  });

  describe('setupSocketHandlers', () => {
    it('should register connection handler on namespace', () => {
      service.setupSocketHandlers();

      expect(mockNamespaceOn).toHaveBeenCalledWith('connection', expect.any(Function));
    });

    it('should handle subscribe event by joining room', () => {
      service.setupSocketHandlers();

      // Get the connection handler
      const connectionHandler = mockNamespaceOn.mock.calls[0][1];

      // Simulate a socket connection
      const mockSocket = {
        on: jest.fn(),
        join: jest.fn(),
        leave: jest.fn(),
      };
      connectionHandler(mockSocket);

      // Get the subscribe handler
      const subscribeHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'subscribe',
      )[1];

      subscribeHandler('order-456');

      expect(mockSocket.join).toHaveBeenCalledWith('order:order-456');
    });

    it('should handle unsubscribe event by leaving room', () => {
      service.setupSocketHandlers();

      const connectionHandler = mockNamespaceOn.mock.calls[0][1];

      const mockSocket = {
        on: jest.fn(),
        join: jest.fn(),
        leave: jest.fn(),
      };
      connectionHandler(mockSocket);

      const unsubscribeHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'unsubscribe',
      )[1];

      unsubscribeHandler('order-456');

      expect(mockSocket.leave).toHaveBeenCalledWith('order:order-456');
    });

    it('should ignore invalid orderId on subscribe', () => {
      service.setupSocketHandlers();

      const connectionHandler = mockNamespaceOn.mock.calls[0][1];

      const mockSocket = {
        on: jest.fn(),
        join: jest.fn(),
        leave: jest.fn(),
      };
      connectionHandler(mockSocket);

      const subscribeHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'subscribe',
      )[1];

      // Pass invalid values
      subscribeHandler(null);
      subscribeHandler(undefined);
      subscribeHandler(123);

      expect(mockSocket.join).not.toHaveBeenCalled();
    });
  });

  describe('null namespace handling', () => {
    it('should not crash when namespace is null', async () => {
      const serviceNoNamespace = new CartTrackerService(null, mockPool);

      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Should not throw
      await serviceNoNamespace.updateStatus('order-123', OrderStatus.Confirmed);

      // Database should still be updated
      expect(mockQuery).toHaveBeenCalled();
      // But no WebSocket emission
      expect(mockTo).not.toHaveBeenCalled();
    });

    it('should not set up handlers when namespace is null', () => {
      const serviceNoNamespace = new CartTrackerService(null, mockPool);
      serviceNoNamespace.setupSocketHandlers();
      // Should not throw
    });
  });

  describe('RECONNECTION_CONFIG', () => {
    it('should have correct exponential backoff configuration', () => {
      expect(RECONNECTION_CONFIG.reconnection).toBe(true);
      expect(RECONNECTION_CONFIG.reconnectionDelay).toBe(1000);
      expect(RECONNECTION_CONFIG.reconnectionDelayMax).toBe(30000);
      expect(RECONNECTION_CONFIG.reconnectionAttempts).toBe(Infinity);
    });
  });
});
