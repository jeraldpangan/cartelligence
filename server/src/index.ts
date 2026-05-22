import 'dotenv/config';
import path from 'path';

import express from 'express';
// import path from 'path'; // Already imported above
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import { globalErrorHandler, notFoundHandler, databaseErrorHandler } from './middleware';
import { getRedisClient, getDatabasePool, connectWithRetry } from './config';
import { UPLOAD_DIR } from './config/upload';
import v1Routes from './routes/v1';
import { OrderNotificationService } from './services/order-notification.service';

const app = express();
const httpServer = createServer(app);

// CORS configuration - allow Angular client
const corsOptions: cors.CorsOptions = {
  origin: process.env.CLIENT_URL || 'http://localhost:4200',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400, // 24 hours preflight cache
};

// Socket.IO server with CORS
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:4200',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Security middleware
app.use(helmet({
  // Allow HTTPS enforcement in production
  hsts: process.env.NODE_ENV === 'production' ? {
    maxAge: 31536000,
    includeSubDomains: true,
  } : false,
}));

// CORS
app.use(cors(corsOptions));

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Serve uploaded files statically with cache headers (Requirement 3.4)
// Images are immutable (UUID-based filenames), so a long max-age is safe.
app.use(
  '/uploads',
  express.static(UPLOAD_DIR, {
    maxAge: '30d',           // Cache for 30 days in browser
    immutable: true,         // Tell browsers the file will never change
    etag: true,              // Enable ETag for conditional requests
    lastModified: true,      // Enable Last-Modified header
  }),
);

// API versioned routes
app.use('/api/v1', v1Routes);

// 404 handler for unmatched routes
app.use(notFoundHandler);

// Database error handler (converts pg errors to 503 responses)
app.use(databaseErrorHandler);

// Global error handler (must be last middleware)
app.use(globalErrorHandler);

// WebSocket tracking namespace (for delivery ETA tracking)
const trackingNamespace = io.of('/ws/tracking');

// WebSocket notifications namespace (for order status notifications to buyers)
const notificationsNamespace = io.of('/ws/notifications');

// Initialize CartTrackerService with the tracking namespace
import { CartTrackerService } from './services/cart-tracker.service';
const cartTrackerService = new CartTrackerService(trackingNamespace);
cartTrackerService.setupSocketHandlers();

// Initialize OrderNotificationService with the notifications namespace
// Redis client is initialized later in startServer(); pass null for now and set after connect
let orderNotificationService: OrderNotificationService = new OrderNotificationService(
  notificationsNamespace,
  null,
);

const PORT = process.env.PORT || 3000;

/**
 * Starts the server and initializes connections.
 * Database and Redis connections are attempted but server starts regardless
 * to allow health checks and graceful degradation.
 */
async function startServer(): Promise<void> {
  // Initialize Redis connection (non-blocking)
  try {
    const redis = getRedisClient();
    await redis.connect();

    // Re-initialize OrderNotificationService with the connected Redis client
    orderNotificationService = new OrderNotificationService(notificationsNamespace, redis);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Redis: failed to connect - ${message}. Caching disabled.`);
  }

  // Set up WebSocket handlers for order notifications (after Redis is ready)
  orderNotificationService.setupSocketHandlers();

  // Initialize database connection with retry logic
  try {
    const pool = getDatabasePool();
    await connectWithRetry(pool);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Database: ${message}`);
    // Server still starts - will return 503 on DB-dependent requests
  }

  httpServer.listen(PORT, () => {
    console.log(`Cartelligence API server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

    // Start periodic ETA broadcasts for orders in delivery
    cartTrackerService.startETABroadcast();
  });
}

// Start server unless in test environment
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export { app, httpServer, io, startServer, trackingNamespace, cartTrackerService, notificationsNamespace, orderNotificationService };
