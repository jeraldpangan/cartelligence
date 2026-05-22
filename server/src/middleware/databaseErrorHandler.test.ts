import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { databaseErrorHandler } from './databaseErrorHandler';
import { globalErrorHandler, AppError } from './errorHandler';
import { ErrorCode } from '@shared/errors';

function createTestApp() {
  const app = express();
  app.use(express.json());

  // Route that simulates a PostgreSQL connection refused error
  app.get('/db-connection-refused', () => {
    const err = new Error('connect ECONNREFUSED 127.0.0.1:5432') as any;
    err.code = 'ECONNREFUSED';
    throw err;
  });

  // Route that simulates a PostgreSQL connection timeout
  app.get('/db-connection-timeout', () => {
    const err = new Error('Connection terminated unexpectedly') as any;
    err.code = 'ETIMEDOUT';
    throw err;
  });

  // Route that simulates a pg connection_exception (08000)
  app.get('/db-pg-connection-exception', () => {
    const err = new Error('connection exception') as any;
    err.code = '08000';
    err.severity = 'FATAL';
    throw err;
  });

  // Route that simulates a pg connection_failure (08006)
  app.get('/db-pg-connection-failure', () => {
    const err = new Error('connection failure') as any;
    err.code = '08006';
    err.routine = 'auth_failed';
    throw err;
  });

  // Route that simulates a statement_timeout (57014)
  app.get('/db-query-timeout', () => {
    const err = new Error(
      'canceling statement due to statement timeout',
    ) as any;
    err.code = '57014';
    err.severity = 'ERROR';
    throw err;
  });

  // Route that simulates connection retries exhausted
  app.get('/db-retries-exhausted', () => {
    throw new Error(
      'Database: all connection retries exhausted. Service unavailable.',
    );
  });

  // Route that simulates a connection terminated message
  app.get('/db-connection-terminated', () => {
    throw new Error('Connection terminated unexpectedly');
  });

  // Route that throws a regular non-DB error
  app.get('/regular-error', () => {
    throw new Error('Something else went wrong');
  });

  // Route that throws an AppError (should pass through)
  app.get('/app-error', () => {
    throw new AppError(400, ErrorCode.ValidationError, 'Bad input');
  });

  // Database error handler (before global)
  app.use(databaseErrorHandler);

  // Global error handler
  app.use(globalErrorHandler);

  return app;
}

describe('Database Error Handler Middleware', () => {
  const app = createTestApp();

  describe('Connection errors → 503', () => {
    it('should return 503 for ECONNREFUSED errors', async () => {
      const res = await request(app).get('/db-connection-refused');

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe(ErrorCode.ServiceUnavailable);
      expect(res.body.error.message).toContain('temporarily unavailable');
      expect(res.body.error.details[0].field).toBe('database');
      expect(res.body.error.details[0].message).toContain('connection failed');
    });

    it('should return 503 for ETIMEDOUT errors', async () => {
      const res = await request(app).get('/db-connection-timeout');

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe(ErrorCode.ServiceUnavailable);
    });

    it('should return 503 for pg connection_exception (08000)', async () => {
      const res = await request(app).get('/db-pg-connection-exception');

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe(ErrorCode.ServiceUnavailable);
      expect(res.body.error.message).toContain('temporarily unavailable');
    });

    it('should return 503 for pg connection_failure (08006)', async () => {
      const res = await request(app).get('/db-pg-connection-failure');

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe(ErrorCode.ServiceUnavailable);
    });

    it('should return 503 when all connection retries exhausted', async () => {
      const res = await request(app).get('/db-retries-exhausted');

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe(ErrorCode.ServiceUnavailable);
    });

    it('should return 503 for connection terminated errors', async () => {
      const res = await request(app).get('/db-connection-terminated');

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe(ErrorCode.ServiceUnavailable);
    });
  });

  describe('Query timeout errors → 503', () => {
    it('should return 503 for statement_timeout (57014)', async () => {
      const res = await request(app).get('/db-query-timeout');

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe(ErrorCode.ServiceUnavailable);
      expect(res.body.error.message).toContain('timed out');
      expect(res.body.error.details[0].field).toBe('database');
      expect(res.body.error.details[0].message).toContain('timeout');
    });
  });

  describe('Non-database errors pass through', () => {
    it('should pass regular errors to the global error handler', async () => {
      const res = await request(app).get('/regular-error');

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe(ErrorCode.ServerError);
    });

    it('should pass AppError instances through unchanged', async () => {
      const res = await request(app).get('/app-error');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.ValidationError);
      expect(res.body.error.message).toBe('Bad input');
    });
  });

  describe('Response timing', () => {
    it('should respond within 5 seconds for connection errors', async () => {
      const start = Date.now();
      await request(app).get('/db-connection-refused');
      const elapsed = Date.now() - start;

      // Should respond almost immediately since the middleware
      // catches the error without additional retries
      expect(elapsed).toBeLessThan(5000);
    });
  });

  describe('Error response structure', () => {
    it('should include timestamp in ISO format', async () => {
      const res = await request(app).get('/db-connection-refused');

      expect(res.body.error.timestamp).toBeDefined();
      expect(new Date(res.body.error.timestamp).toISOString()).toBe(
        res.body.error.timestamp,
      );
    });

    it('should include details array with field-level info', async () => {
      const res = await request(app).get('/db-query-timeout');

      expect(Array.isArray(res.body.error.details)).toBe(true);
      expect(res.body.error.details.length).toBeGreaterThan(0);
      expect(res.body.error.details[0]).toHaveProperty('field');
      expect(res.body.error.details[0]).toHaveProperty('message');
    });
  });
});
