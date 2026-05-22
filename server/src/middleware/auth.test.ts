import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { authenticate, AuthenticatedRequest } from './auth';
import { globalErrorHandler } from './errorHandler';

const TEST_JWT_SECRET = 'test-jwt-secret';

function createTestApp() {
  const app = express();
  app.use(express.json());

  // Protected test route
  app.get('/protected', authenticate, (req: AuthenticatedRequest, res) => {
    res.json({ data: { userId: req.user?.sub, email: req.user?.email } });
  });

  app.use(globalErrorHandler);
  return app;
}

describe('Auth Middleware', () => {
  const app = createTestApp();

  beforeAll(() => {
    process.env.JWT_SECRET = TEST_JWT_SECRET;
  });

  afterAll(() => {
    delete process.env.JWT_SECRET;
  });

  it('should allow access with a valid access token', async () => {
    const token = jwt.sign(
      { sub: 'user-123', email: 'test@example.com', type: 'access' },
      TEST_JWT_SECRET,
      { expiresIn: '30m' },
    );

    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.userId).toBe('user-123');
    expect(res.body.data.email).toBe('test@example.com');
  });

  it('should return 401 when no Authorization header is provided', async () => {
    const res = await request(app).get('/protected');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.message).toContain('Authentication required');
  });

  it('should return 401 when Authorization header does not start with Bearer', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Basic some-credentials');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('should return 401 when token is empty after Bearer prefix', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer ');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('should return 401 when token is invalid', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer invalid-token-string');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.message).toContain('Invalid access token');
  });

  it('should return 401 when token is expired', async () => {
    const expiredToken = jwt.sign(
      { sub: 'user-123', email: 'test@example.com', type: 'access' },
      TEST_JWT_SECRET,
      { expiresIn: '0s' },
    );

    // Small delay to ensure token is expired
    await new Promise((resolve) => setTimeout(resolve, 10));

    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.message).toContain('expired');
  });

  it('should return 401 when token is signed with wrong secret', async () => {
    const token = jwt.sign(
      { sub: 'user-123', email: 'test@example.com', type: 'access' },
      'wrong-secret',
      { expiresIn: '30m' },
    );

    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('should return 401 when token type is not access', async () => {
    const refreshToken = jwt.sign(
      { sub: 'user-123', email: 'test@example.com', type: 'refresh' },
      TEST_JWT_SECRET,
      { expiresIn: '7d' },
    );

    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${refreshToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.message).toContain('Access token required');
  });
});
