import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { AuthService } from './auth.service';
import { AppError } from '../middleware/errorHandler';

// Mock the database pool
const mockQuery = jest.fn();
const mockPool = { query: mockQuery } as any;

// Set environment variables for tests
const TEST_JWT_SECRET = 'test-jwt-secret-key-for-testing';
const TEST_JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key-for-testing';

beforeAll(() => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.JWT_REFRESH_SECRET = TEST_JWT_REFRESH_SECRET;
});

afterAll(() => {
  delete process.env.JWT_SECRET;
  delete process.env.JWT_REFRESH_SECRET;
});

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService(mockPool);
    mockQuery.mockReset();
  });

  describe('register()', () => {
    const validDto = {
      email: 'test@example.com',
      password: 'Password1!',
      fullName: 'John Doe',
      deliveryAddress: '123 Main Street, Olongapo City',
    };

    it('should register a user with valid input', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // no duplicate email
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'uuid-123',
              email: 'test@example.com',
              full_name: 'John Doe',
              delivery_address: '123 Main Street, Olongapo City',
              created_at: new Date('2024-01-01'),
              updated_at: new Date('2024-01-01'),
            },
          ],
        });

      const result = await authService.register(validDto);

      expect(result.id).toBe('uuid-123');
      expect(result.email).toBe('test@example.com');
      expect(result.fullName).toBe('John Doe');
      expect(result.deliveryAddress).toBe('123 Main Street, Olongapo City');

      // Verify bcrypt hash was used in the INSERT query
      const insertCall = mockQuery.mock.calls[1];
      expect(insertCall[1][0]).toBe('test@example.com'); // email lowercased
      // Password hash should be a bcrypt hash
      const storedHash = insertCall[1][1];
      const isValidHash = await bcrypt.compare(validDto.password, storedHash);
      expect(isValidHash).toBe(true);
    });

    it('should reject registration with invalid email', async () => {
      const dto = { ...validDto, email: 'invalid-email' };

      await expect(authService.register(dto)).rejects.toThrow(AppError);
      await expect(authService.register(dto)).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should reject registration with weak password', async () => {
      const dto = { ...validDto, password: 'weak' };

      await expect(authService.register(dto)).rejects.toThrow(AppError);
      await expect(authService.register(dto)).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should reject registration with duplicate email', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing-id' }] });

      try {
        await authService.register(validDto);
        fail('Expected AppError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(409);
        expect((err as AppError).code).toBe('CONFLICT');
      }
    });

    it('should reject registration with short delivery address', async () => {
      const dto = { ...validDto, deliveryAddress: 'short' };

      await expect(authService.register(dto)).rejects.toThrow(AppError);
      await expect(authService.register(dto)).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });
  });

  describe('login()', () => {
    const validLoginDto = {
      email: 'test@example.com',
      password: 'Password1!',
    };

    it('should return tokens for valid credentials', async () => {
      const passwordHash = await bcrypt.hash('Password1!', 12);

      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'uuid-123',
              email: 'test@example.com',
              password_hash: passwordHash,
              failed_login_attempts: 0,
              locked_until: null,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // reset failed attempts

      const result = await authService.login(validLoginDto);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();

      // Verify access token
      const decoded = jwt.verify(result.accessToken, TEST_JWT_SECRET) as any;
      expect(decoded.sub).toBe('uuid-123');
      expect(decoded.email).toBe('test@example.com');
      expect(decoded.type).toBe('access');
    });

    it('should throw for non-existent email', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      try {
        await authService.login(validLoginDto);
        fail('Expected AppError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(401);
        expect((err as AppError).code).toBe('AUTH_FAILED');
      }
    });

    it('should throw for invalid password and increment failed attempts', async () => {
      const passwordHash = await bcrypt.hash('CorrectPassword1!', 12);

      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'uuid-123',
              email: 'test@example.com',
              password_hash: passwordHash,
              failed_login_attempts: 0,
              locked_until: null,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ failed_login_attempts: 1 }] }); // handleFailedLogin

      try {
        await authService.login(validLoginDto);
        fail('Expected AppError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(401);
        expect((err as AppError).code).toBe('AUTH_FAILED');
      }
    });

    it('should throw when account is locked', async () => {
      const futureDate = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'uuid-123',
            email: 'test@example.com',
            password_hash: 'hash',
            failed_login_attempts: 3,
            locked_until: futureDate,
          },
        ],
      });

      try {
        await authService.login(validLoginDto);
        fail('Expected AppError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(429);
        expect((err as AppError).code).toBe('ACCOUNT_LOCKED');
      }
    });

    it('should allow login after lockout expires', async () => {
      const pastDate = new Date(Date.now() - 1000); // 1 second ago (expired)
      const passwordHash = await bcrypt.hash('Password1!', 12);

      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'uuid-123',
              email: 'test@example.com',
              password_hash: passwordHash,
              failed_login_attempts: 3,
              locked_until: pastDate,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // reset failed attempts

      const result = await authService.login(validLoginDto);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });
  });

  describe('handleFailedLogin()', () => {
    it('should increment failed attempts', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ failed_login_attempts: 1 }],
      });

      await authService.handleFailedLogin('test@example.com');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('failed_login_attempts = failed_login_attempts + 1'),
        ['test@example.com'],
      );
    });

    it('should lock account after 3 consecutive failures', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ failed_login_attempts: 3 }] })
        .mockResolvedValueOnce({ rows: [] }); // lock update

      await authService.handleFailedLogin('test@example.com');

      // Verify the lockout query was called
      expect(mockQuery).toHaveBeenCalledTimes(2);
      const lockCall = mockQuery.mock.calls[1];
      expect(lockCall[0]).toContain('locked_until');
    });

    it('should not lock account before 3 failures', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ failed_login_attempts: 2 }],
      });

      await authService.handleFailedLogin('test@example.com');

      // Only the increment query should be called
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('refreshToken()', () => {
    it('should issue new tokens for valid refresh token', async () => {
      const refreshToken = jwt.sign(
        { sub: 'uuid-123', email: 'test@example.com', type: 'refresh' },
        TEST_JWT_REFRESH_SECRET,
        { expiresIn: '7d' },
      );

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'uuid-123', email: 'test@example.com' }],
      });

      const result = await authService.refreshToken(refreshToken);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();

      // Verify new access token
      const decoded = jwt.verify(result.accessToken, TEST_JWT_SECRET) as any;
      expect(decoded.sub).toBe('uuid-123');
      expect(decoded.type).toBe('access');
    });

    it('should throw for expired refresh token', async () => {
      const expiredToken = jwt.sign(
        { sub: 'uuid-123', email: 'test@example.com', type: 'refresh' },
        TEST_JWT_REFRESH_SECRET,
        { expiresIn: '0s' },
      );

      // Wait a moment for the token to expire
      await new Promise((resolve) => setTimeout(resolve, 10));

      await expect(authService.refreshToken(expiredToken)).rejects.toThrow(AppError);
      await expect(authService.refreshToken(expiredToken)).rejects.toMatchObject({
        statusCode: 401,
        code: 'AUTH_FAILED',
      });
    });

    it('should throw for invalid refresh token', async () => {
      await expect(authService.refreshToken('invalid-token')).rejects.toThrow(AppError);
      await expect(authService.refreshToken('invalid-token')).rejects.toMatchObject({
        statusCode: 401,
        code: 'AUTH_FAILED',
      });
    });

    it('should throw if user no longer exists', async () => {
      const refreshToken = jwt.sign(
        { sub: 'uuid-deleted', email: 'deleted@example.com', type: 'refresh' },
        TEST_JWT_REFRESH_SECRET,
        { expiresIn: '7d' },
      );

      mockQuery.mockResolvedValueOnce({ rows: [] }); // user not found

      try {
        await authService.refreshToken(refreshToken);
        fail('Expected AppError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(401);
        expect((err as AppError).code).toBe('AUTH_FAILED');
      }
    });
  });

  describe('requestPasswordReset()', () => {
    it('should generate a token and store it in the database', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 'uuid-123', email: 'test@example.com' }],
        }) // find user
        .mockResolvedValueOnce({ rows: [] }); // insert token

      await authService.requestPasswordReset('test@example.com');

      // Verify the INSERT query was called with correct params
      expect(mockQuery).toHaveBeenCalledTimes(2);
      const insertCall = mockQuery.mock.calls[1];
      expect(insertCall[0]).toContain('INSERT INTO password_reset_token');
      expect(insertCall[1][0]).toBe('uuid-123'); // user_id
      expect(insertCall[1][1]).toHaveLength(64); // 32 bytes hex = 64 chars
      // Verify expiry is approximately 15 minutes from now
      const expiresAt = new Date(insertCall[1][2]);
      const expectedExpiry = Date.now() + 15 * 60 * 1000;
      expect(Math.abs(expiresAt.getTime() - expectedExpiry)).toBeLessThan(5000);
    });

    it('should silently succeed for non-existent email (prevent enumeration)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // user not found

      // Should not throw
      await expect(
        authService.requestPasswordReset('nonexistent@example.com'),
      ).resolves.toBeUndefined();

      // Only the SELECT query should be called, no INSERT
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should normalize email to lowercase', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 'uuid-123', email: 'test@example.com' }],
        })
        .mockResolvedValueOnce({ rows: [] });

      await authService.requestPasswordReset('TEST@EXAMPLE.COM');

      const selectCall = mockQuery.mock.calls[0];
      expect(selectCall[1][0]).toBe('test@example.com');
    });
  });

  describe('confirmPasswordReset()', () => {
    const validToken = 'a'.repeat(64);
    const newPassword = 'NewPassword1!';

    it('should update password and mark token as used', async () => {
      const futureDate = new Date(Date.now() + 10 * 60 * 1000); // 10 min from now

      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'token-id-1',
              user_id: 'uuid-123',
              expires_at: futureDate,
              used: false,
            },
          ],
        }) // find token
        .mockResolvedValueOnce({ rows: [] }) // update password
        .mockResolvedValueOnce({ rows: [] }); // mark token as used

      await authService.confirmPasswordReset(validToken, newPassword);

      // Verify password was hashed with bcrypt
      const updatePasswordCall = mockQuery.mock.calls[1];
      expect(updatePasswordCall[0]).toContain('UPDATE user_profile SET password_hash');
      const storedHash = updatePasswordCall[1][0];
      const isValidHash = await bcrypt.compare(newPassword, storedHash);
      expect(isValidHash).toBe(true);
      expect(updatePasswordCall[1][1]).toBe('uuid-123'); // user_id

      // Verify token was marked as used
      const markUsedCall = mockQuery.mock.calls[2];
      expect(markUsedCall[0]).toContain('UPDATE password_reset_token SET used = TRUE');
      expect(markUsedCall[1][0]).toBe('token-id-1');
    });

    it('should throw for invalid token', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // token not found

      try {
        await authService.confirmPasswordReset('invalid-token', newPassword);
        fail('Expected AppError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(400);
        expect((err as AppError).code).toBe('VALIDATION_ERROR');
        expect((err as AppError).message).toContain('Invalid or expired');
      }
    });

    it('should throw for already-used token (single-use enforcement)', async () => {
      const futureDate = new Date(Date.now() + 10 * 60 * 1000);

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'token-id-1',
            user_id: 'uuid-123',
            expires_at: futureDate,
            used: true, // already used
          },
        ],
      });

      try {
        await authService.confirmPasswordReset(validToken, newPassword);
        fail('Expected AppError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(400);
        expect((err as AppError).code).toBe('VALIDATION_ERROR');
        expect((err as AppError).message).toContain('already been used');
      }
    });

    it('should throw for expired token', async () => {
      const pastDate = new Date(Date.now() - 1000); // 1 second ago

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'token-id-1',
            user_id: 'uuid-123',
            expires_at: pastDate,
            used: false,
          },
        ],
      });

      try {
        await authService.confirmPasswordReset(validToken, newPassword);
        fail('Expected AppError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(400);
        expect((err as AppError).code).toBe('VALIDATION_ERROR');
        expect((err as AppError).message).toContain('expired');
      }
    });
  });
});
