import express from 'express';
import request from 'supertest';
import {
  validateBody,
  requireFields,
  registrationSchema,
  loginSchema,
  cartItemSchema,
  quantityUpdateSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  tokenRefreshSchema,
  orderConfirmSchema,
  deliveryRescheduleSchema,
} from './validation';
import { globalErrorHandler } from './errorHandler';
import { ErrorCode } from '@shared/errors';

function createTestApp(middleware: express.RequestHandler) {
  const app = express();
  app.use(express.json());
  app.post('/test', middleware, (_req, res) => {
    res.json({ success: true });
  });
  app.use(globalErrorHandler);
  return app;
}

describe('Validation Middleware', () => {
  describe('validateBody with registrationSchema', () => {
    const app = createTestApp(validateBody(registrationSchema));

    it('should pass with valid registration data', async () => {
      const res = await request(app).post('/test').send({
        email: 'user@example.com',
        password: 'Password1!',
        fullName: 'John Doe',
        deliveryAddress: '123 Main Street, Olongapo City',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject invalid email', async () => {
      const res = await request(app).post('/test').send({
        email: 'not-an-email',
        password: 'Password1!',
        fullName: 'John Doe',
        deliveryAddress: '123 Main Street, Olongapo City',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.ValidationError);
      expect(res.body.error.details.some((d: { field: string }) => d.field === 'email')).toBe(true);
    });

    it('should reject weak password', async () => {
      const res = await request(app).post('/test').send({
        email: 'user@example.com',
        password: 'weak',
        fullName: 'John Doe',
        deliveryAddress: '123 Main Street, Olongapo City',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.details.some((d: { field: string }) => d.field === 'password')).toBe(true);
    });

    it('should reject empty full name', async () => {
      const res = await request(app).post('/test').send({
        email: 'user@example.com',
        password: 'Password1!',
        fullName: '',
        deliveryAddress: '123 Main Street, Olongapo City',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.details.some((d: { field: string }) => d.field === 'fullName')).toBe(true);
    });

    it('should reject short delivery address', async () => {
      const res = await request(app).post('/test').send({
        email: 'user@example.com',
        password: 'Password1!',
        fullName: 'John Doe',
        deliveryAddress: 'Short',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.details.some((d: { field: string }) => d.field === 'deliveryAddress')).toBe(true);
    });

    it('should return multiple field errors at once', async () => {
      const res = await request(app).post('/test').send({
        email: 'bad',
        password: 'x',
        fullName: '',
        deliveryAddress: 'short',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.details.length).toBeGreaterThan(1);
      const fields = res.body.error.details.map((d: { field: string }) => d.field);
      expect(fields).toContain('email');
      expect(fields).toContain('password');
      expect(fields).toContain('fullName');
      expect(fields).toContain('deliveryAddress');
    });
  });

  describe('validateBody with loginSchema', () => {
    const app = createTestApp(validateBody(loginSchema));

    it('should pass with valid login data', async () => {
      const res = await request(app).post('/test').send({
        email: 'user@example.com',
        password: 'anypassword',
      });

      expect(res.status).toBe(200);
    });

    it('should reject invalid email on login', async () => {
      const res = await request(app).post('/test').send({
        email: 'invalid',
        password: 'anypassword',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.details.some((d: { field: string }) => d.field === 'email')).toBe(true);
    });

    it('should reject empty password on login', async () => {
      const res = await request(app).post('/test').send({
        email: 'user@example.com',
        password: '',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.details.some((d: { field: string }) => d.field === 'password')).toBe(true);
    });
  });

  describe('validateBody with cartItemSchema', () => {
    const app = createTestApp(validateBody(cartItemSchema));

    it('should pass with valid cart item data', async () => {
      const res = await request(app).post('/test').send({
        productId: 'abc-123',
        quantity: 5,
      });

      expect(res.status).toBe(200);
    });

    it('should reject missing productId', async () => {
      const res = await request(app).post('/test').send({
        productId: '',
        quantity: 5,
      });

      expect(res.status).toBe(400);
      expect(res.body.error.details.some((d: { field: string }) => d.field === 'productId')).toBe(true);
    });

    it('should reject quantity out of range', async () => {
      const res = await request(app).post('/test').send({
        productId: 'abc-123',
        quantity: 100,
      });

      expect(res.status).toBe(400);
      expect(res.body.error.details.some((d: { field: string }) => d.field === 'quantity')).toBe(true);
    });
  });

  describe('validateBody with quantityUpdateSchema', () => {
    const app = createTestApp(validateBody(quantityUpdateSchema));

    it('should pass with quantity 0 (for removal)', async () => {
      const res = await request(app).post('/test').send({ quantity: 0 });
      expect(res.status).toBe(200);
    });

    it('should reject negative quantity', async () => {
      const res = await request(app).post('/test').send({ quantity: -1 });
      expect(res.status).toBe(400);
    });

    it('should reject quantity over 99', async () => {
      const res = await request(app).post('/test').send({ quantity: 100 });
      expect(res.status).toBe(400);
    });
  });

  describe('requireFields middleware', () => {
    const app = createTestApp(requireFields('name', 'email'));

    it('should pass when all required fields are present', async () => {
      const res = await request(app).post('/test').send({
        name: 'John',
        email: 'john@example.com',
      });

      expect(res.status).toBe(200);
    });

    it('should reject when required fields are missing', async () => {
      const res = await request(app).post('/test').send({
        name: 'John',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.ValidationError);
      expect(res.body.error.details.some((d: { field: string }) => d.field === 'email')).toBe(true);
    });

    it('should reject null values for required fields', async () => {
      const res = await request(app).post('/test').send({
        name: null,
        email: 'john@example.com',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.details.some((d: { field: string }) => d.field === 'name')).toBe(true);
    });
  });

  describe('validateBody with passwordResetRequestSchema', () => {
    const app = createTestApp(validateBody(passwordResetRequestSchema));

    it('should pass with valid email', async () => {
      const res = await request(app).post('/test').send({
        email: 'user@example.com',
      });
      expect(res.status).toBe(200);
    });

    it('should reject invalid email', async () => {
      const res = await request(app).post('/test').send({
        email: 'not-valid',
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.ValidationError);
      expect(res.body.error.details.some((d: { field: string }) => d.field === 'email')).toBe(true);
    });

    it('should reject empty email', async () => {
      const res = await request(app).post('/test').send({
        email: '',
      });
      expect(res.status).toBe(400);
      expect(res.body.error.details.some((d: { field: string }) => d.field === 'email')).toBe(true);
    });
  });

  describe('validateBody with passwordResetConfirmSchema', () => {
    const app = createTestApp(validateBody(passwordResetConfirmSchema));

    it('should pass with valid token and strong password', async () => {
      const res = await request(app).post('/test').send({
        token: 'some-reset-token-uuid',
        newPassword: 'NewPass1!',
      });
      expect(res.status).toBe(200);
    });

    it('should reject missing token', async () => {
      const res = await request(app).post('/test').send({
        token: '',
        newPassword: 'NewPass1!',
      });
      expect(res.status).toBe(400);
      expect(res.body.error.details.some((d: { field: string }) => d.field === 'token')).toBe(true);
    });

    it('should reject weak new password', async () => {
      const res = await request(app).post('/test').send({
        token: 'some-reset-token-uuid',
        newPassword: 'weak',
      });
      expect(res.status).toBe(400);
      expect(res.body.error.details.some((d: { field: string }) => d.field === 'newPassword')).toBe(true);
    });

    it('should return errors for both fields when both invalid', async () => {
      const res = await request(app).post('/test').send({
        token: '',
        newPassword: '',
      });
      expect(res.status).toBe(400);
      const fields = res.body.error.details.map((d: { field: string }) => d.field);
      expect(fields).toContain('token');
      expect(fields).toContain('newPassword');
    });
  });

  describe('validateBody with tokenRefreshSchema', () => {
    const app = createTestApp(validateBody(tokenRefreshSchema));

    it('should pass with valid refresh token', async () => {
      const res = await request(app).post('/test').send({
        refreshToken: 'valid-refresh-token',
      });
      expect(res.status).toBe(200);
    });

    it('should reject missing refresh token', async () => {
      const res = await request(app).post('/test').send({
        refreshToken: '',
      });
      expect(res.status).toBe(400);
      expect(res.body.error.details.some((d: { field: string }) => d.field === 'refreshToken')).toBe(true);
    });
  });

  describe('validateBody with orderConfirmSchema', () => {
    const app = createTestApp(validateBody(orderConfirmSchema));

    it('should pass with valid credit_debit_card payment', async () => {
      const res = await request(app).post('/test').send({
        paymentMethod: 'credit_debit_card',
        paymentDetails: { cardNumber: '4111111111111111' },
      });
      expect(res.status).toBe(200);
    });

    it('should pass with valid digital_wallet payment', async () => {
      const res = await request(app).post('/test').send({
        paymentMethod: 'digital_wallet',
        paymentDetails: { walletId: 'wallet-123' },
      });
      expect(res.status).toBe(200);
    });

    it('should reject missing payment method', async () => {
      const res = await request(app).post('/test').send({
        paymentMethod: '',
        paymentDetails: { cardNumber: '4111111111111111' },
      });
      expect(res.status).toBe(400);
      expect(res.body.error.details.some((d: { field: string }) => d.field === 'paymentMethod')).toBe(true);
    });

    it('should reject invalid payment method', async () => {
      const res = await request(app).post('/test').send({
        paymentMethod: 'bitcoin',
        paymentDetails: { address: 'abc' },
      });
      expect(res.status).toBe(400);
      expect(res.body.error.details.some((d: { field: string }) => d.field === 'paymentMethod')).toBe(true);
    });

    it('should reject non-object payment details', async () => {
      const res = await request(app).post('/test').send({
        paymentMethod: 'credit_debit_card',
        paymentDetails: 'not-an-object',
      });
      expect(res.status).toBe(400);
      expect(res.body.error.details.some((d: { field: string }) => d.field === 'paymentDetails')).toBe(true);
    });

    it('should reject array as payment details', async () => {
      const res = await request(app).post('/test').send({
        paymentMethod: 'credit_debit_card',
        paymentDetails: ['item1'],
      });
      expect(res.status).toBe(400);
      expect(res.body.error.details.some((d: { field: string }) => d.field === 'paymentDetails')).toBe(true);
    });
  });

  describe('validateBody with deliveryRescheduleSchema', () => {
    const app = createTestApp(validateBody(deliveryRescheduleSchema));

    it('should pass with valid slot ID', async () => {
      const res = await request(app).post('/test').send({
        newSlotId: 'slot-uuid-123',
      });
      expect(res.status).toBe(200);
    });

    it('should reject missing slot ID', async () => {
      const res = await request(app).post('/test').send({
        newSlotId: '',
      });
      expect(res.status).toBe(400);
      expect(res.body.error.details.some((d: { field: string }) => d.field === 'newSlotId')).toBe(true);
    });

    it('should reject null slot ID', async () => {
      const res = await request(app).post('/test').send({
        newSlotId: null,
      });
      expect(res.status).toBe(400);
      expect(res.body.error.details.some((d: { field: string }) => d.field === 'newSlotId')).toBe(true);
    });
  });
});
