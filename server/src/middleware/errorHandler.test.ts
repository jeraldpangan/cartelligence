import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { globalErrorHandler, notFoundHandler, AppError } from './errorHandler';
import { ErrorCode } from '@shared/errors';

function createTestApp() {
  const app = express();
  app.use(express.json());

  // Route that throws an AppError
  app.get('/app-error', () => {
    throw new AppError(400, ErrorCode.ValidationError, 'Validation failed', [
      { field: 'email', message: 'Email is invalid' },
    ]);
  });

  // Route that throws a generic error
  app.get('/server-error', () => {
    throw new Error('Something went wrong internally');
  });

  // Route that simulates a JSON parse error
  app.post('/json-error', (req: Request, res: Response) => {
    res.json(req.body);
  });

  // Route that throws a 503 service unavailable
  app.get('/service-unavailable', () => {
    throw new AppError(
      503,
      ErrorCode.ServiceUnavailable,
      'Database connection failed',
    );
  });

  // 404 handler
  app.use(notFoundHandler);

  // Global error handler
  app.use(globalErrorHandler);

  return app;
}

describe('Error Handler Middleware', () => {
  const app = createTestApp();

  describe('AppError handling', () => {
    it('should return structured error response for AppError', async () => {
      const res = await request(app).get('/app-error');

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe(ErrorCode.ValidationError);
      expect(res.body.error.message).toBe('Validation failed');
      expect(res.body.error.details).toHaveLength(1);
      expect(res.body.error.details[0].field).toBe('email');
      expect(res.body.error.details[0].message).toBe('Email is invalid');
      expect(res.body.error.timestamp).toBeDefined();
    });

    it('should return 503 for service unavailable errors', async () => {
      const res = await request(app).get('/service-unavailable');

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe(ErrorCode.ServiceUnavailable);
      expect(res.body.error.message).toBe('Database connection failed');
      expect(res.body.error.details).toEqual([]);
    });
  });

  describe('Generic error handling', () => {
    it('should return 500 with generic message for unknown errors', async () => {
      const res = await request(app).get('/server-error');

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe(ErrorCode.ServerError);
      expect(res.body.error.message).toBe(
        'An unexpected error occurred. Please try again later.',
      );
      // Should not leak internal error details
      expect(res.body.error.message).not.toContain('Something went wrong internally');
    });
  });

  describe('JSON parse error handling', () => {
    it('should return 400 for malformed JSON body', async () => {
      const res = await request(app)
        .post('/json-error')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.ValidationError);
      expect(res.body.error.message).toBe('Invalid JSON in request body');
    });
  });

  describe('404 Not Found handler', () => {
    it('should return 404 for unmatched routes', async () => {
      const res = await request(app).get('/nonexistent-route');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe(ErrorCode.NotFound);
      expect(res.body.error.message).toContain('/nonexistent-route');
    });

    it('should include the HTTP method in the 404 message', async () => {
      const res = await request(app).post('/nonexistent-route');

      expect(res.status).toBe(404);
      expect(res.body.error.message).toContain('POST');
    });
  });

  describe('Error response structure', () => {
    it('should always include timestamp in ISO format', async () => {
      const res = await request(app).get('/app-error');

      const timestamp = res.body.error.timestamp;
      expect(timestamp).toBeDefined();
      expect(new Date(timestamp).toISOString()).toBe(timestamp);
    });

    it('should always include error wrapper object', async () => {
      const res = await request(app).get('/server-error');

      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toHaveProperty('code');
      expect(res.body.error).toHaveProperty('message');
      expect(res.body.error).toHaveProperty('details');
      expect(res.body.error).toHaveProperty('timestamp');
    });
  });
});
