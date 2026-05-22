import jwt from 'jsonwebtoken';
import Redis from 'ioredis';
import { Namespace, Socket } from 'socket.io';
import { AuthPayload } from '../middleware/auth';
import { withTimeout } from '../config/redis';

/**
 * Payload emitted on the `order:status` event.
 */
export interface OrderStatusPayload {
  orderId: string;
  status: string;
  updatedAt: string;
}

/**
 * A missed event stored in Redis for offline buyers.
 */
interface MissedEvent {
  orderId: string;
  status: string;
  updatedAt: string;
  storedAt: string;
}

/** TTL for missed events in Redis: 24 hours in seconds */
const MISSED_EVENT_TTL_SECONDS = 24 * 60 * 60;

/** Redis key prefix for missed events per user */
const MISSED_EVENTS_KEY_PREFIX = 'ws:missed:';

/**
 * OrderNotificationService
 *
 * Manages real-time order status notifications to buyers via Socket.IO.
 *
 * Features:
 * - JWT authentication on WebSocket connection (rejects invalid/expired tokens)
 * - Room-based subscriptions: each buyer joins `user:{userId}` room on connect
 * - Emits `order:status` events with `{ orderId, status, updatedAt }` payload
 * - Stores missed events in Redis for disconnected buyers (24-hour window)
 * - Delivers missed events in chronological order on reconnect
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 4.8
 */
export class OrderNotificationService {
  private namespace: Namespace | null;
  private redis: Redis | null;

  constructor(namespace: Namespace | null, redis?: Redis | null) {
    this.namespace = namespace;
    this.redis = redis ?? null;
  }

  /**
   * Sets up Socket.IO connection handlers for the notifications namespace.
   *
   * On connection:
   * 1. Validates the JWT from the handshake auth token
   * 2. Rejects the connection if the token is invalid or expired (Req 9.4)
   * 3. Joins the buyer to their personal room `user:{userId}` (Req 9.2)
   * 4. Delivers any missed events stored during disconnection (Req 9.2)
   *
   * Requirements: 9.2, 9.3, 9.4
   */
  setupSocketHandlers(): void {
    if (!this.namespace) {
      return;
    }

    // JWT authentication middleware for the namespace
    this.namespace.use((socket, next) => {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

      if (!token) {
        return next(new Error('Authentication required. Please provide a valid access token.'));
      }

      const secret = process.env.JWT_SECRET;
      if (!secret) {
        return next(new Error('Server configuration error.'));
      }

      try {
        const payload = jwt.verify(token, secret) as AuthPayload;

        if (payload.type !== 'access') {
          return next(new Error('Invalid token type. Access token required.'));
        }

        // Attach user payload to socket data for use in connection handler
        socket.data.user = payload;
        next();
      } catch (err) {
        if (err instanceof jwt.TokenExpiredError) {
          return next(new Error('Access token has expired. Please refresh your token.'));
        }
        return next(new Error('Invalid access token.'));
      }
    });

    this.namespace.on('connection', async (socket: Socket) => {
      const user = socket.data.user as AuthPayload;
      const userId = user.sub;
      const userRoom = `user:${userId}`;

      // Join the buyer's personal room
      await socket.join(userRoom);

      // Deliver any missed events from the last 24 hours
      await this.deliverMissedEvents(socket, userId);

      // Handle disconnect — no explicit cleanup needed; Socket.IO removes from rooms automatically
      socket.on('disconnect', () => {
        // Socket.IO automatically removes the socket from all rooms on disconnect
      });
    });
  }

  /**
   * Emits an `order:status` event to the buyer's room.
   * If the buyer is not connected, stores the event in Redis for later delivery.
   *
   * Called by SellerOrderService after a successful status update.
   *
   * Requirements: 9.1, 9.2, 4.8
   *
   * @param buyerUserId - The UUID of the buyer who placed the order
   * @param payload - The order status event payload
   */
  async notifyOrderStatus(buyerUserId: string, payload: OrderStatusPayload): Promise<void> {
    const userRoom = `user:${buyerUserId}`;

    // Check if the buyer has any active sockets in their room
    const socketsInRoom = this.namespace
      ? await this.namespace.in(userRoom).fetchSockets()
      : [];

    if (socketsInRoom.length > 0) {
      // Buyer is connected — emit directly
      this.namespace!.to(userRoom).emit('order:status', payload);
    } else {
      // Buyer is offline — store the event for later delivery (Req 9.2)
      await this.storeMissedEvent(buyerUserId, payload);
    }
  }

  /**
   * Stores a missed event in Redis for a disconnected buyer.
   * Events are stored as a Redis list with a 24-hour TTL.
   *
   * Requirements: 9.2
   */
  private async storeMissedEvent(
    userId: string,
    payload: OrderStatusPayload,
  ): Promise<void> {
    if (!this.redis) {
      return;
    }

    const key = `${MISSED_EVENTS_KEY_PREFIX}${userId}`;
    const event: MissedEvent = {
      orderId: payload.orderId,
      status: payload.status,
      updatedAt: payload.updatedAt,
      storedAt: new Date().toISOString(),
    };

    try {
      // Append to the list and set/refresh the TTL
      await withTimeout(this.redis.rpush(key, JSON.stringify(event)));
      await withTimeout(this.redis.expire(key, MISSED_EVENT_TTL_SECONDS));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`OrderNotification: failed to store missed event for user ${userId} - ${message}`);
    }
  }

  /**
   * Delivers all missed events to a reconnected buyer in chronological order,
   * then clears the stored events from Redis.
   *
   * Requirements: 9.2
   */
  private async deliverMissedEvents(socket: Socket, userId: string): Promise<void> {
    if (!this.redis) {
      return;
    }

    const key = `${MISSED_EVENTS_KEY_PREFIX}${userId}`;

    try {
      // Fetch all stored events (chronological order — LRANGE returns left-to-right)
      const rawEvents = await withTimeout(this.redis.lrange(key, 0, -1));

      if (rawEvents.length === 0) {
        return;
      }

      // Parse and emit each missed event in order
      for (const raw of rawEvents) {
        try {
          const event: MissedEvent = JSON.parse(raw);
          socket.emit('order:status', {
            orderId: event.orderId,
            status: event.status,
            updatedAt: event.updatedAt,
          } satisfies OrderStatusPayload);
        } catch {
          // Skip malformed events
        }
      }

      // Clear the delivered events
      await withTimeout(this.redis.del(key));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`OrderNotification: failed to deliver missed events for user ${userId} - ${message}`);
    }
  }
}
