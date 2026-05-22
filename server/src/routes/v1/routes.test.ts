import request from 'supertest';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import v1Routes from './index';
import { globalErrorHandler, notFoundHandler } from '../../middleware';

// Mock the database module to prevent actual DB connections
jest.mock('../../config/database', () => ({
  getDatabasePool: jest.fn(() => ({
    query: jest.fn().mockResolvedValue({ rows: [] }),
  })),
}));

// Mock Redis to prevent actual Redis connections
jest.mock('../../config/redis', () => ({
  getRedisClient: jest.fn(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
  })),
}));

function createTestApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: 'http://localhost:4200' }));
  app.use(express.json());
  app.use('/api/v1', v1Routes);
  app.use(notFoundHandler);
  app.use(globalErrorHandler);
  return app;
}

describe('API v1 Routes', () => {
  const app = createTestApp();

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
  });

  afterAll(() => {
    delete process.env.JWT_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
  });

  describe('Health check', () => {
    it('GET /api/v1/health should return status ok', async () => {
      const res = await request(app).get('/api/v1/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('Auth routes', () => {
    it('POST /api/v1/auth/register should return 400 without valid body', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('POST /api/v1/auth/login should return 400 without valid body', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('POST /api/v1/auth/logout should return 401 without token', async () => {
      const res = await request(app).post('/api/v1/auth/logout');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('POST /api/v1/auth/password-reset/request should return 400 without email', async () => {
      const res = await request(app).post('/api/v1/auth/password-reset/request').send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('POST /api/v1/auth/password-reset/confirm should return 400 without token', async () => {
      const res = await request(app).post('/api/v1/auth/password-reset/confirm').send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('POST /api/v1/auth/token/refresh should return 400 without refreshToken', async () => {
      const res = await request(app).post('/api/v1/auth/token/refresh').send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Products routes', () => {
    it('GET /api/v1/products/categories should return 200', async () => {
      const res = await request(app).get('/api/v1/products/categories');
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });

    it('GET /api/v1/products/categories/:id/products should return 400 for invalid category', async () => {
      const res = await request(app).get('/api/v1/products/categories/invalid/products');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('GET /api/v1/products/search should return 400 without valid query', async () => {
      const res = await request(app).get('/api/v1/products/search?q=a');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('GET /api/v1/products/:id should return 400 for invalid UUID', async () => {
      const res = await request(app).get('/api/v1/products/some-id');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Cart routes require authentication', () => {
    it('GET /api/v1/cart/ should return 401 without auth', async () => {
      const res = await request(app).get('/api/v1/cart/');
      expect(res.status).toBe(401);
    });

    it('POST /api/v1/cart/items should return 401 without auth', async () => {
      const res = await request(app).post('/api/v1/cart/items');
      expect(res.status).toBe(401);
    });

    it('PATCH /api/v1/cart/items/:id should return 401 without auth', async () => {
      const res = await request(app).patch('/api/v1/cart/items/item-1');
      expect(res.status).toBe(401);
    });

    it('DELETE /api/v1/cart/items/:id should return 401 without auth', async () => {
      const res = await request(app).delete('/api/v1/cart/items/item-1');
      expect(res.status).toBe(401);
    });
  });

  describe('Recommendations routes (auth-protected)', () => {
    it('GET /api/v1/recommendations/personalized should return 401 without auth', async () => {
      const res = await request(app).get('/api/v1/recommendations/personalized');
      expect(res.status).toBe(401);
    });

    it('GET /api/v1/recommendations/cart-based should return 401 without auth', async () => {
      const res = await request(app).get('/api/v1/recommendations/cart-based');
      expect(res.status).toBe(401);
    });

    it('GET /api/v1/recommendations/product/:id/related should return 401 without auth', async () => {
      const res = await request(app).get('/api/v1/recommendations/product/p1/related');
      expect(res.status).toBe(401);
    });

    it('POST /api/v1/recommendations/dismiss/:productId should return 401 without auth', async () => {
      const res = await request(app).post('/api/v1/recommendations/dismiss/p1');
      expect(res.status).toBe(401);
    });
  });

  describe('Orders routes (auth required)', () => {
    it('POST /api/v1/orders/checkout should return 401 without auth', async () => {
      const res = await request(app).post('/api/v1/orders/checkout');
      expect(res.status).toBe(401);
    });

    it('POST /api/v1/orders/confirm should return 401 without auth', async () => {
      const res = await request(app).post('/api/v1/orders/confirm');
      expect(res.status).toBe(401);
    });

    it('GET /api/v1/orders/active should return 401 without auth', async () => {
      const res = await request(app).get('/api/v1/orders/active');
      expect(res.status).toBe(401);
    });

    it('GET /api/v1/orders/:id should return 401 without auth', async () => {
      const res = await request(app).get('/api/v1/orders/order-1');
      expect(res.status).toBe(401);
    });

    it('GET /api/v1/orders/ should return 401 without auth', async () => {
      const res = await request(app).get('/api/v1/orders/');
      expect(res.status).toBe(401);
    });
  });

  describe('Delivery routes (auth required)', () => {
    it('GET /api/v1/delivery/slots should return 401 without auth', async () => {
      const res = await request(app).get('/api/v1/delivery/slots?date=2024-01-01');
      expect(res.status).toBe(401);
    });

    it('POST /api/v1/delivery/orders/:id/reschedule should return 401 without auth', async () => {
      const res = await request(app).post('/api/v1/delivery/orders/order-1/reschedule');
      expect(res.status).toBe(401);
    });
  });

  describe('Seller products routes (auth required)', () => {
    it('GET /api/v1/seller/products should return 401 without auth', async () => {
      const res = await request(app).get('/api/v1/seller/products');
      expect(res.status).toBe(401);
    });

    it('POST /api/v1/seller/products should return 401 without auth', async () => {
      const res = await request(app).post('/api/v1/seller/products');
      expect(res.status).toBe(401);
    });

    it('PUT /api/v1/seller/products/:id should return 401 without auth', async () => {
      const res = await request(app).put('/api/v1/seller/products/some-id');
      expect(res.status).toBe(401);
    });

    it('DELETE /api/v1/seller/products/:id should return 401 without auth', async () => {
      const res = await request(app).delete('/api/v1/seller/products/some-id');
      expect(res.status).toBe(401);
    });

    it('PATCH /api/v1/seller/products/:id/availability should return 401 without auth', async () => {
      const res = await request(app).patch('/api/v1/seller/products/some-id/availability');
      expect(res.status).toBe(401);
    });
  });

  describe('Seller orders routes (auth required)', () => {
    it('GET /api/v1/seller/orders should return 401 without auth', async () => {
      const res = await request(app).get('/api/v1/seller/orders');
      expect(res.status).toBe(401);
    });

    it('GET /api/v1/seller/orders/:id should return 401 without auth', async () => {
      const res = await request(app).get('/api/v1/seller/orders/some-id');
      expect(res.status).toBe(401);
    });

    it('PATCH /api/v1/seller/orders/:id/status should return 401 without auth', async () => {
      const res = await request(app).patch('/api/v1/seller/orders/some-id/status');
      expect(res.status).toBe(401);
    });
  });

  describe('Reviews routes', () => {
    it('POST /api/v1/reviews should return 401 without auth', async () => {
      const res = await request(app).post('/api/v1/reviews');
      expect(res.status).toBe(401);
    });

    it('GET /api/v1/reviews/product/:productId should return 400 for invalid UUID (public)', async () => {
      const res = await request(app).get('/api/v1/reviews/product/not-a-uuid');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('GET /api/v1/reviews/product/:productId/summary should return 400 for invalid UUID (public)', async () => {
      const res = await request(app).get('/api/v1/reviews/product/not-a-uuid/summary');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('DELETE /api/v1/reviews/:id should return 401 without auth', async () => {
      const res = await request(app).delete('/api/v1/reviews/some-id');
      expect(res.status).toBe(401);
    });
  });

  describe('404 handling', () => {
    it('should return 404 for unknown routes', async () => {
      const res = await request(app).get('/api/v1/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 404 for routes outside /api/v1', async () => {
      const res = await request(app).get('/some/random/path');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('CORS headers', () => {
    it('should include CORS headers in response', async () => {
      const res = await request(app)
        .get('/api/v1/health')
        .set('Origin', 'http://localhost:4200');

      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:4200');
    });
  });
});
