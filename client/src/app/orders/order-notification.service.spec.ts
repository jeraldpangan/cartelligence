import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { vi } from 'vitest';
import {
  OrderNotificationService,
  OrderStatusUpdate,
  SOCKET_FACTORY,
  SocketFactory,
} from './order-notification.service';
import { AuthService } from '../auth/auth.service';
import { OrderStatus } from '@shared/enums';

// ─── Socket mock ─────────────────────────────────────────────────────────────

/**
 * Minimal mock of a Socket.IO client socket.
 * Captures registered event handlers so tests can trigger them directly.
 */
function createMockSocket() {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};

  const socket = {
    connected: false,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    }),
    disconnect: vi.fn(() => {
      socket.connected = false;
    }),
    /** Test helper: trigger all registered handlers for an event. */
    _emit(event: string, ...args: unknown[]) {
      (handlers[event] ?? []).forEach((h) => h(...args));
    },
  };

  return socket;
}

type MockSocket = ReturnType<typeof createMockSocket>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal fake JWT access token. */
function makeToken(sub = 'user-1'): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({ sub, email: 'a@b.com', role: 'buyer', exp: 9999999999, type: 'access' }),
  );
  return `${header}.${payload}.fakesig`;
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('OrderNotificationService', () => {
  let service: OrderNotificationService;
  let mockSocket: MockSocket;
  let snackBarOpenSpy: ReturnType<typeof vi.fn>;
  let getAccessTokenMock: ReturnType<typeof vi.fn>;
  let socketFactorySpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSocket = createMockSocket();
    snackBarOpenSpy = vi.fn();
    getAccessTokenMock = vi.fn().mockReturnValue(makeToken());

    // Factory spy returns our mock socket; captures the URL and options passed
    socketFactorySpy = vi.fn().mockReturnValue(mockSocket);

    TestBed.configureTestingModule({
      providers: [
        OrderNotificationService,
        {
          provide: AuthService,
          useValue: { getAccessToken: getAccessTokenMock },
        },
        {
          provide: MatSnackBar,
          useValue: { open: snackBarOpenSpy },
        },
        {
          provide: SOCKET_FACTORY,
          useValue: socketFactorySpy as SocketFactory,
        },
      ],
    });

    service = TestBed.inject(OrderNotificationService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (service) {
      service.disconnect();
    }
  });

  // ─── Initial state ──────────────────────────────────────────────────────────

  it('starts disconnected with an empty orderStatuses map', () => {
    expect(service.isConnected()).toBe(false);
    expect(service.orderStatuses().size).toBe(0);
  });

  // ─── connect() ─────────────────────────────────────────────────────────────

  it('does not connect when no access token is available (Req 9.3)', () => {
    getAccessTokenMock.mockReturnValue(null);
    service.connect();
    expect(socketFactorySpy).not.toHaveBeenCalled();
    expect(service.isConnected()).toBe(false);
  });

  it('connects to the /ws/notifications namespace with the JWT token (Req 9.3)', () => {
    service.connect();
    expect(socketFactorySpy).toHaveBeenCalledOnce();
    const [url, options] = socketFactorySpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('/ws/notifications');
    expect((options['auth'] as { token: string }).token).toBe(makeToken());
  });

  it('sets isConnected to true when the socket emits "connect"', () => {
    service.connect();
    mockSocket._emit('connect');
    expect(service.isConnected()).toBe(true);
  });

  it('sets isConnected to false when the socket emits "disconnect"', () => {
    service.connect();
    mockSocket._emit('connect');
    expect(service.isConnected()).toBe(true);

    mockSocket._emit('disconnect');
    expect(service.isConnected()).toBe(false);
  });

  it('does not create a second socket if already connected', () => {
    mockSocket.connected = true;
    service.connect();
    service.connect(); // second call should be a no-op

    expect(socketFactorySpy).toHaveBeenCalledTimes(1);
  });

  it('configures reconnection with exponential backoff', () => {
    service.connect();
    const [, options] = socketFactorySpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(options['reconnection']).toBe(true);
    expect(options['reconnectionDelay']).toBe(1000);
    expect(options['reconnectionDelayMax']).toBe(30000);
    expect(options['reconnectionAttempts']).toBe(Infinity);
  });

  // ─── order:status event handling (Req 9.1) ─────────────────────────────────

  it('updates orderStatuses map when an order:status event is received (Req 9.1)', () => {
    service.connect();

    const update: OrderStatusUpdate = {
      orderId: 'order-abc',
      status: OrderStatus.BeingPrepared,
      updatedAt: '2024-06-01T10:00:00Z',
    };

    mockSocket._emit('order:status', update);

    const stored = service.orderStatuses().get('order-abc');
    expect(stored).toEqual(update);
  });

  it('accumulates multiple order status updates in the map', () => {
    service.connect();

    mockSocket._emit('order:status', {
      orderId: 'order-1',
      status: OrderStatus.BeingPrepared,
      updatedAt: '2024-06-01T10:00:00Z',
    });
    mockSocket._emit('order:status', {
      orderId: 'order-2',
      status: OrderStatus.OutForDelivery,
      updatedAt: '2024-06-01T11:00:00Z',
    });

    expect(service.orderStatuses().size).toBe(2);
    expect(service.orderStatuses().get('order-1')?.status).toBe(OrderStatus.BeingPrepared);
    expect(service.orderStatuses().get('order-2')?.status).toBe(OrderStatus.OutForDelivery);
  });

  it('overwrites an existing entry when the same order receives a new status', () => {
    service.connect();

    mockSocket._emit('order:status', {
      orderId: 'order-1',
      status: OrderStatus.BeingPrepared,
      updatedAt: '2024-06-01T10:00:00Z',
    });
    mockSocket._emit('order:status', {
      orderId: 'order-1',
      status: OrderStatus.OutForDelivery,
      updatedAt: '2024-06-01T12:00:00Z',
    });

    expect(service.orderStatuses().size).toBe(1);
    expect(service.orderStatuses().get('order-1')?.status).toBe(OrderStatus.OutForDelivery);
  });

  // ─── Snackbar notification ──────────────────────────────────────────────────

  it('shows a snackbar notification when an order:status event is received', () => {
    service.connect();

    mockSocket._emit('order:status', {
      orderId: 'order-abc',
      status: OrderStatus.Delivered,
      updatedAt: '2024-06-01T15:00:00Z',
    });

    expect(snackBarOpenSpy).toHaveBeenCalledOnce();
    const [message, action, config] = snackBarOpenSpy.mock.calls[0] as [
      string,
      string,
      { duration: number },
    ];
    expect(message).toContain('Delivered');
    expect(action).toBe('Dismiss');
    expect(config.duration).toBeGreaterThan(0);
  });

  it('shows a snackbar for each distinct status update', () => {
    service.connect();

    mockSocket._emit('order:status', {
      orderId: 'order-1',
      status: OrderStatus.BeingPrepared,
      updatedAt: '2024-06-01T10:00:00Z',
    });
    mockSocket._emit('order:status', {
      orderId: 'order-2',
      status: OrderStatus.OutForDelivery,
      updatedAt: '2024-06-01T11:00:00Z',
    });

    expect(snackBarOpenSpy).toHaveBeenCalledTimes(2);
  });

  it('includes the human-readable status label in the snackbar message', () => {
    service.connect();

    mockSocket._emit('order:status', {
      orderId: 'order-1',
      status: OrderStatus.OutForDelivery,
      updatedAt: '2024-06-01T11:00:00Z',
    });

    const [message] = snackBarOpenSpy.mock.calls[0] as [string];
    expect(message).toContain('Out for Delivery');
  });

  // ─── getOrderStatus() ───────────────────────────────────────────────────────

  it('getOrderStatus returns null for an unknown orderId', () => {
    expect(service.getOrderStatus('unknown-order')).toBeNull();
  });

  it('getOrderStatus returns the latest update for a known orderId', () => {
    service.connect();

    const update: OrderStatusUpdate = {
      orderId: 'order-xyz',
      status: OrderStatus.Confirmed,
      updatedAt: '2024-06-01T09:00:00Z',
    };
    mockSocket._emit('order:status', update);

    expect(service.getOrderStatus('order-xyz')).toEqual(update);
  });

  // ─── disconnect() ──────────────────────────────────────────────────────────

  it('disconnect() sets isConnected to false and clears orderStatuses', () => {
    service.connect();
    mockSocket._emit('connect');
    mockSocket._emit('order:status', {
      orderId: 'order-1',
      status: OrderStatus.BeingPrepared,
      updatedAt: '2024-06-01T10:00:00Z',
    });

    expect(service.isConnected()).toBe(true);
    expect(service.orderStatuses().size).toBe(1);

    service.disconnect();

    expect(service.isConnected()).toBe(false);
    expect(service.orderStatuses().size).toBe(0);
  });

  it('disconnect() calls socket.disconnect()', () => {
    service.connect();
    service.disconnect();
    expect(mockSocket.disconnect).toHaveBeenCalledOnce();
  });

  it('disconnect() is safe to call when not connected', () => {
    expect(() => service.disconnect()).not.toThrow();
  });

  // ─── connect_error handling (Req 9.4) ──────────────────────────────────────

  it('logs a warning and stays disconnected on connect_error (Req 9.4)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    service.connect();

    mockSocket._emit('connect_error', new Error('Authentication required'));

    expect(service.isConnected()).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Authentication required'),
    );
  });

  // ─── ngOnDestroy ────────────────────────────────────────────────────────────

  it('ngOnDestroy disconnects the socket', () => {
    service.connect();
    service.ngOnDestroy();
    expect(mockSocket.disconnect).toHaveBeenCalledOnce();
  });
});
