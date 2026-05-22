import jwt from 'jsonwebtoken';
import { OrderNotificationService, OrderStatusPayload } from './order-notification.service';
import { UserRole } from '@shared/enums';

/**
 * Unit tests for OrderNotificationService.
 *
 * Tests JWT authentication on WebSocket connection, room-based subscriptions,
 * missed event storage/delivery, and connection rejection for invalid tokens.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockSocket(overrides: Partial<{
  handshake: { auth: Record<string, unknown>; headers: Record<string, unknown> };
  data: Record<string, unknown>;
  join: jest.Mock;
  emit: jest.Mock;
  on: jest.Mock;
}> = {}) {
  return {
    handshake: {
      auth: {},
      headers: {},
      ...overrides.handshake,
    },
    data: overrides.data ?? {},
    join: overrides.join ?? jest.fn().mockResolvedValue(undefined),
    emit: overrides.emit ?? jest.fn(),
    on: overrides.on ?? jest.fn(),
  };
}

function createMockNamespace() {
  const sockets: Map<string, unknown> = new Map();
  const connectionHandlers: Array<(socket: unknown) => void> = [];
  const middlewares: Array<(socket: unknown, next: (err?: Error) => void) => void> = [];

  const inResult = {
    fetchSockets: jest.fn().mockResolvedValue([]),
  };

  const toResult = {
    emit: jest.fn(),
  };

  const ns = {
    use: jest.fn((middleware) => {
      middlewares.push(middleware);
    }),
    on: jest.fn((event, handler) => {
      if (event === 'connection') {
        connectionHandlers.push(handler);
      }
    }),
    in: jest.fn().mockReturnValue(inResult),
    to: jest.fn().mockReturnValue(toResult),
    _middlewares: middlewares,
    _connectionHandlers: connectionHandlers,
    _inResult: inResult,
    _toResult: toResult,
    // Helper to simulate a connection attempt
    async simulateConnection(socket: ReturnType<typeof createMockSocket>) {
      // Run through middlewares
      for (const mw of middlewares) {
        await new Promise<void>((resolve, reject) => {
          mw(socket, (err?: Error) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
      // Run connection handlers
      for (const handler of connectionHandlers) {
        await handler(socket);
      }
    },
  };

  return ns;
}

function createMockRedis() {
  const store: Map<string, string[]> = new Map();

  return {
    rpush: jest.fn(async (key: string, value: string) => {
      const list = store.get(key) ?? [];
      list.push(value);
      store.set(key, list);
      return list.length;
    }),
    expire: jest.fn().mockResolvedValue(1),
    lrange: jest.fn(async (key: string, _start: number, _end: number) => {
      return store.get(key) ?? [];
    }),
    del: jest.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
    _store: store,
  } as any;
}

// ─── Test Constants ───────────────────────────────────────────────────────────

const JWT_SECRET = 'test-secret-key';
const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORDER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function makeAccessToken(userId: string = USER_ID, role: UserRole = UserRole.Buyer): string {
  return jwt.sign(
    { sub: userId, email: 'buyer@test.com', role, type: 'access' },
    JWT_SECRET,
    { expiresIn: '30m' },
  );
}

function makeExpiredToken(): string {
  return jwt.sign(
    { sub: USER_ID, email: 'buyer@test.com', role: UserRole.Buyer, type: 'access' },
    JWT_SECRET,
    { expiresIn: '-1s' },
  );
}

function makeRefreshToken(): string {
  return jwt.sign(
    { sub: USER_ID, email: 'buyer@test.com', type: 'refresh' },
    JWT_SECRET,
    { expiresIn: '7d' },
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OrderNotificationService', () => {
  let originalJwtSecret: string | undefined;

  beforeAll(() => {
    originalJwtSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = JWT_SECRET;
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalJwtSecret;
  });

  // ─── setupSocketHandlers ────────────────────────────────────────────────────

  describe('setupSocketHandlers', () => {
    it('should do nothing when namespace is null', () => {
      const service = new OrderNotificationService(null, null);
      // Should not throw
      expect(() => service.setupSocketHandlers()).not.toThrow();
    });

    it('should register a use() middleware and on("connection") handler', () => {
      const ns = createMockNamespace();
      const service = new OrderNotificationService(ns as any, null);
      service.setupSocketHandlers();

      expect(ns.use).toHaveBeenCalledTimes(1);
      expect(ns.on).toHaveBeenCalledWith('connection', expect.any(Function));
    });

    // ─── JWT Authentication (Req 9.3, 9.4) ─────────────────────────────────

    it('should reject connection when no token is provided (Req 9.4)', async () => {
      const ns = createMockNamespace();
      const service = new OrderNotificationService(ns as any, null);
      service.setupSocketHandlers();

      const socket = createMockSocket({ handshake: { auth: {}, headers: {} } });

      await expect(ns.simulateConnection(socket)).rejects.toThrow(
        'Authentication required',
      );
    });

    it('should reject connection with an expired JWT (Req 9.4)', async () => {
      const ns = createMockNamespace();
      const service = new OrderNotificationService(ns as any, null);
      service.setupSocketHandlers();

      const expiredToken = makeExpiredToken();
      const socket = createMockSocket({
        handshake: { auth: { token: expiredToken }, headers: {} },
      });

      await expect(ns.simulateConnection(socket)).rejects.toThrow(
        'expired',
      );
    });

    it('should reject connection with a malformed JWT (Req 9.4)', async () => {
      const ns = createMockNamespace();
      const service = new OrderNotificationService(ns as any, null);
      service.setupSocketHandlers();

      const socket = createMockSocket({
        handshake: { auth: { token: 'not.a.valid.jwt' }, headers: {} },
      });

      await expect(ns.simulateConnection(socket)).rejects.toThrow(
        'Invalid access token',
      );
    });

    it('should reject connection with a refresh token (wrong type) (Req 9.4)', async () => {
      const ns = createMockNamespace();
      const service = new OrderNotificationService(ns as any, null);
      service.setupSocketHandlers();

      const refreshToken = makeRefreshToken();
      const socket = createMockSocket({
        handshake: { auth: { token: refreshToken }, headers: {} },
      });

      await expect(ns.simulateConnection(socket)).rejects.toThrow(
        'Invalid token type',
      );
    });

    it('should accept connection with a valid access token (Req 9.3)', async () => {
      const ns = createMockNamespace();
      const service = new OrderNotificationService(ns as any, null);
      service.setupSocketHandlers();

      const token = makeAccessToken();
      const socket = createMockSocket({
        handshake: { auth: { token }, headers: {} },
      });

      await expect(ns.simulateConnection(socket)).resolves.not.toThrow();
    });

    it('should accept token from Authorization header (Req 9.3)', async () => {
      const ns = createMockNamespace();
      const service = new OrderNotificationService(ns as any, null);
      service.setupSocketHandlers();

      const token = makeAccessToken();
      const socket = createMockSocket({
        handshake: {
          auth: {},
          headers: { authorization: `Bearer ${token}` },
        },
      });

      await expect(ns.simulateConnection(socket)).resolves.not.toThrow();
    });

    // ─── Room Subscription (Req 9.2) ────────────────────────────────────────

    it('should join buyer to user:{userId} room on connect (Req 9.2)', async () => {
      const ns = createMockNamespace();
      const redis = createMockRedis();
      const service = new OrderNotificationService(ns as any, redis);
      service.setupSocketHandlers();

      const token = makeAccessToken(USER_ID);
      const socket = createMockSocket({
        handshake: { auth: { token }, headers: {} },
      });

      await ns.simulateConnection(socket);

      expect(socket.join).toHaveBeenCalledWith(`user:${USER_ID}`);
    });

    it('should attach user payload to socket.data on successful auth', async () => {
      const ns = createMockNamespace();
      const redis = createMockRedis();
      const service = new OrderNotificationService(ns as any, redis);
      service.setupSocketHandlers();

      const token = makeAccessToken(USER_ID);
      const socket = createMockSocket({
        handshake: { auth: { token }, headers: {} },
      });

      await ns.simulateConnection(socket);

      expect(socket.data.user).toBeDefined();
      expect((socket.data.user as any).sub).toBe(USER_ID);
    });

    // ─── Missed Event Delivery (Req 9.2) ────────────────────────────────────

    it('should deliver missed events on reconnect in chronological order (Req 9.2)', async () => {
      const ns = createMockNamespace();
      const redis = createMockRedis();
      const service = new OrderNotificationService(ns as any, redis);
      service.setupSocketHandlers();

      // Pre-store two missed events
      const event1: OrderStatusPayload = {
        orderId: ORDER_ID,
        status: 'being_prepared',
        updatedAt: '2024-01-01T10:00:00.000Z',
      };
      const event2: OrderStatusPayload = {
        orderId: ORDER_ID,
        status: 'out_for_delivery',
        updatedAt: '2024-01-01T11:00:00.000Z',
      };

      const key = `ws:missed:${USER_ID}`;
      redis._store.set(key, [
        JSON.stringify({ ...event1, storedAt: '2024-01-01T10:00:01.000Z' }),
        JSON.stringify({ ...event2, storedAt: '2024-01-01T11:00:01.000Z' }),
      ]);

      const token = makeAccessToken(USER_ID);
      const socket = createMockSocket({
        handshake: { auth: { token }, headers: {} },
      });

      await ns.simulateConnection(socket);

      // Should have emitted both events in order
      expect(socket.emit).toHaveBeenCalledTimes(2);
      expect(socket.emit).toHaveBeenNthCalledWith(1, 'order:status', {
        orderId: ORDER_ID,
        status: 'being_prepared',
        updatedAt: '2024-01-01T10:00:00.000Z',
      });
      expect(socket.emit).toHaveBeenNthCalledWith(2, 'order:status', {
        orderId: ORDER_ID,
        status: 'out_for_delivery',
        updatedAt: '2024-01-01T11:00:00.000Z',
      });
    });

    it('should clear missed events from Redis after delivery (Req 9.2)', async () => {
      const ns = createMockNamespace();
      const redis = createMockRedis();
      const service = new OrderNotificationService(ns as any, redis);
      service.setupSocketHandlers();

      const key = `ws:missed:${USER_ID}`;
      redis._store.set(key, [
        JSON.stringify({
          orderId: ORDER_ID,
          status: 'being_prepared',
          updatedAt: '2024-01-01T10:00:00.000Z',
          storedAt: '2024-01-01T10:00:01.000Z',
        }),
      ]);

      const token = makeAccessToken(USER_ID);
      const socket = createMockSocket({
        handshake: { auth: { token }, headers: {} },
      });

      await ns.simulateConnection(socket);

      expect(redis.del).toHaveBeenCalledWith(key);
      expect(redis._store.has(key)).toBe(false);
    });

    it('should not emit anything when there are no missed events', async () => {
      const ns = createMockNamespace();
      const redis = createMockRedis();
      const service = new OrderNotificationService(ns as any, redis);
      service.setupSocketHandlers();

      const token = makeAccessToken(USER_ID);
      const socket = createMockSocket({
        handshake: { auth: { token }, headers: {} },
      });

      await ns.simulateConnection(socket);

      expect(socket.emit).not.toHaveBeenCalled();
    });
  });

  // ─── notifyOrderStatus ──────────────────────────────────────────────────────

  describe('notifyOrderStatus', () => {
    const payload: OrderStatusPayload = {
      orderId: ORDER_ID,
      status: 'being_prepared',
      updatedAt: new Date().toISOString(),
    };

    it('should emit directly to buyer room when buyer is connected (Req 9.1)', async () => {
      const ns = createMockNamespace();
      const redis = createMockRedis();

      // Simulate buyer being connected (fetchSockets returns a socket)
      ns._inResult.fetchSockets.mockResolvedValue([{ id: 'socket-1' }]);

      const service = new OrderNotificationService(ns as any, redis);
      service.setupSocketHandlers();

      await service.notifyOrderStatus(USER_ID, payload);

      expect(ns.in).toHaveBeenCalledWith(`user:${USER_ID}`);
      expect(ns.to).toHaveBeenCalledWith(`user:${USER_ID}`);
      expect(ns._toResult.emit).toHaveBeenCalledWith('order:status', payload);
    });

    it('should store missed event when buyer is offline (Req 9.2)', async () => {
      const ns = createMockNamespace();
      const redis = createMockRedis();

      // Simulate buyer being offline (fetchSockets returns empty)
      ns._inResult.fetchSockets.mockResolvedValue([]);

      const service = new OrderNotificationService(ns as any, redis);
      service.setupSocketHandlers();

      await service.notifyOrderStatus(USER_ID, payload);

      // Should NOT emit directly
      expect(ns._toResult.emit).not.toHaveBeenCalled();

      // Should store in Redis
      expect(redis.rpush).toHaveBeenCalledWith(
        `ws:missed:${USER_ID}`,
        expect.stringContaining(ORDER_ID),
      );
      expect(redis.expire).toHaveBeenCalledWith(
        `ws:missed:${USER_ID}`,
        24 * 60 * 60,
      );
    });

    it('should not throw when namespace is null', async () => {
      const service = new OrderNotificationService(null, null);
      await expect(service.notifyOrderStatus(USER_ID, payload)).resolves.not.toThrow();
    });

    it('should not store missed event when Redis is null', async () => {
      const ns = createMockNamespace();
      ns._inResult.fetchSockets.mockResolvedValue([]);

      const service = new OrderNotificationService(ns as any, null);
      service.setupSocketHandlers();

      // Should not throw even without Redis
      await expect(service.notifyOrderStatus(USER_ID, payload)).resolves.not.toThrow();
    });

    it('should store event with correct TTL of 24 hours (Req 9.2)', async () => {
      const ns = createMockNamespace();
      const redis = createMockRedis();
      ns._inResult.fetchSockets.mockResolvedValue([]);

      const service = new OrderNotificationService(ns as any, redis);
      service.setupSocketHandlers();

      await service.notifyOrderStatus(USER_ID, payload);

      expect(redis.expire).toHaveBeenCalledWith(
        `ws:missed:${USER_ID}`,
        86400, // 24 * 60 * 60
      );
    });

    it('should store multiple missed events in order', async () => {
      const ns = createMockNamespace();
      const redis = createMockRedis();
      ns._inResult.fetchSockets.mockResolvedValue([]);

      const service = new OrderNotificationService(ns as any, redis);
      service.setupSocketHandlers();

      const payload1: OrderStatusPayload = { orderId: ORDER_ID, status: 'being_prepared', updatedAt: '2024-01-01T10:00:00.000Z' };
      const payload2: OrderStatusPayload = { orderId: ORDER_ID, status: 'out_for_delivery', updatedAt: '2024-01-01T11:00:00.000Z' };

      await service.notifyOrderStatus(USER_ID, payload1);
      await service.notifyOrderStatus(USER_ID, payload2);

      const key = `ws:missed:${USER_ID}`;
      const stored = redis._store.get(key) ?? [];
      expect(stored).toHaveLength(2);

      const first = JSON.parse(stored[0]);
      const second = JSON.parse(stored[1]);
      expect(first.status).toBe('being_prepared');
      expect(second.status).toBe('out_for_delivery');
    });
  });
});
