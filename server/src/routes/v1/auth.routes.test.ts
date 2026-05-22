import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { globalErrorHandler } from '../../middleware/errorHandler';

const TEST_JWT_SECRET = 'test-jwt-secret';
const TEST_JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';

// Mock the AuthService before importing routes
const mockRegister = jest.fn();
const mockLogin = jest.fn();
const mockRequestPasswordReset = jest.fn();
const mockConfirmPasswordReset = jest.fn();
const mockRefreshToken = jest.fn();

jest.mock('../../services/auth.service', () => ({
  AuthService: jest.fn().mockImplementation(() => ({
    register: mockRegister,
    login: mockLogin,
    requestPasswordReset: mockRequestPasswordReset,
    confirmPasswordReset: mockConfirmPasswordReset,
    refreshToken: mockRefreshToken,
  })),
}));

// Mock the database module to prevent actual DB connections
jest.mock('../../config/database', () => ({
  getDatabasePool: jest.fn(() => ({})),
}));

// Import routes after mocking
import authRoutes from './auth.routes';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  app.use(globalErrorHandler);
  return app;
}

function generateTestAccessToken(userId: string, email: string): string {
  return jwt.sign(
    { sub: userId, email, type: 'access' },
    TEST_JWT_SECRET,
    { expiresIn: '30m' },
  );
}

describe('Auth Routes', () => {
  const app = createTestApp();

  beforeAll(() => {
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    process.env.JWT_REFRESH_SECRET = TEST_JWT_REFRESH_SECRET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    delete process.env.JWT_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
  });

  describe('POST /auth/register', () => {
    const validRegistration = {
      email: 'test@example.com',
      password: 'Password1!',
      fullName: 'John Doe',
      deliveryAddress: '123 Main Street, Olongapo City',
    };

    it('should return 201 with user profile on successful registration', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        fullName: 'John Doe',
        deliveryAddress: '123 Main Street, Olongapo City',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      mockRegister.mockResolvedValue(mockUser);

      const res = await request(app)
        .post('/auth/register')
        .send(validRegistration);

      expect(res.status).toBe(201);
      expect(res.body.data).toEqual(mockUser);
    });

    it('should return 400 when email is invalid', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ ...validRegistration, email: 'invalid-email' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'email' }),
        ]),
      );
    });

    it('should return 400 when password is too short', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ ...validRegistration, password: 'Ab1!' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'password' }),
        ]),
      );
    });

    it('should return 400 when full name is empty', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ ...validRegistration, fullName: '' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'fullName' }),
        ]),
      );
    });

    it('should return 400 when delivery address is too short', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ ...validRegistration, deliveryAddress: 'short' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'deliveryAddress' }),
        ]),
      );
    });
  });

  describe('POST /auth/login', () => {
    const validLogin = {
      email: 'test@example.com',
      password: 'Password1!',
    };

    it('should return 200 with tokens on successful login', async () => {
      const mockTokens = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
      };

      mockLogin.mockResolvedValue(mockTokens);

      const res = await request(app)
        .post('/auth/login')
        .send(validLogin);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(mockTokens);
    });

    it('should return 400 when email is missing', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ password: 'Password1!' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when password is missing', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'test@example.com' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /auth/logout', () => {
    it('should return 200 when authenticated', async () => {
      const token = generateTestAccessToken('user-123', 'test@example.com');

      const res = await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.message).toBe('Logged out successfully');
    });

    it('should return 401 when no token provided', async () => {
      const res = await request(app).post('/auth/logout');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when token is invalid', async () => {
      const res = await request(app)
        .post('/auth/logout')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
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
        .post('/auth/logout')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /auth/password-reset/request', () => {
    it('should return 200 with success message', async () => {
      mockRequestPasswordReset.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/auth/password-reset/request')
        .send({ email: 'test@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.data.message).toContain('password reset link');
    });

    it('should return 400 when email is missing', async () => {
      const res = await request(app)
        .post('/auth/password-reset/request')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 200 even when email does not exist (prevent enumeration)', async () => {
      mockRequestPasswordReset.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/auth/password-reset/request')
        .send({ email: 'nonexistent@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.data.message).toContain('password reset link');
    });
  });

  describe('POST /auth/password-reset/confirm', () => {
    it('should return 200 on successful password reset', async () => {
      mockConfirmPasswordReset.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/auth/password-reset/confirm')
        .send({ token: 'valid-reset-token', newPassword: 'NewPassword1!' });

      expect(res.status).toBe(200);
      expect(res.body.data.message).toContain('reset successfully');
    });

    it('should return 400 when token is missing', async () => {
      const res = await request(app)
        .post('/auth/password-reset/confirm')
        .send({ newPassword: 'NewPassword1!' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when newPassword is missing', async () => {
      const res = await request(app)
        .post('/auth/password-reset/confirm')
        .send({ token: 'valid-reset-token' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /auth/token/refresh', () => {
    it('should return 200 with new tokens on valid refresh', async () => {
      const mockTokens = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      };

      mockRefreshToken.mockResolvedValue(mockTokens);

      const res = await request(app)
        .post('/auth/token/refresh')
        .send({ refreshToken: 'valid-refresh-token' });

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(mockTokens);
    });

    it('should return 400 when refreshToken is missing', async () => {
      const res = await request(app)
        .post('/auth/token/refresh')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
