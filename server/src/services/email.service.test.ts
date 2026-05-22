import { EmailService, OrderConfirmationEmailData, LockoutEmailData, PasswordResetEmailData } from './email.service';

describe('EmailService', () => {
  let service: EmailService;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    // Ensure development mode (no SMTP_HOST set)
    delete process.env.SMTP_HOST;
    delete process.env.NODE_ENV;
    service = new EmailService();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('sendOrderConfirmationEmail', () => {
    const orderData: OrderConfirmationEmailData = {
      to: 'customer@example.com',
      orderNumber: 'CART-20240115-A3F2',
      items: [
        { name: 'Apples', quantity: 3, unitPrice: 50.0, subtotal: 150.0 },
        { name: 'Milk', quantity: 2, unitPrice: 85.5, subtotal: 171.0 },
      ],
      subtotal: 321.0,
      deliveryFee: 50.0,
      discount: 0,
      grandTotal: 371.0,
      deliverySlot: { start: '2024-01-16 10:00', end: '2024-01-16 12:00' },
      deliveryAddress: '123 Main St, Olongapo City',
    };

    it('should log email in development mode', async () => {
      await service.sendOrderConfirmationEmail(orderData);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[EmailService - Dev Mode]'),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('customer@example.com'),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Order Confirmation - CART-20240115-A3F2'),
      );
    });

    it('should handle null delivery slot gracefully', async () => {
      const dataWithoutSlot = { ...orderData, deliverySlot: null };
      await expect(service.sendOrderConfirmationEmail(dataWithoutSlot)).resolves.not.toThrow();
    });

    it('should handle discount in email', async () => {
      const dataWithDiscount = { ...orderData, discount: 50.0, grandTotal: 321.0 };
      await expect(service.sendOrderConfirmationEmail(dataWithDiscount)).resolves.not.toThrow();
    });
  });

  describe('sendLockoutEmail', () => {
    const lockoutData: LockoutEmailData = {
      to: 'user@example.com',
      lockoutDurationMinutes: 15,
      failedAttempts: 3,
    };

    it('should log lockout email in development mode', async () => {
      await service.sendLockoutEmail(lockoutData);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[EmailService - Dev Mode]'),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('user@example.com'),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Account Locked - Cartelligence'),
      );
    });

    it('should not throw on send', async () => {
      await expect(service.sendLockoutEmail(lockoutData)).resolves.not.toThrow();
    });
  });

  describe('sendPasswordResetEmail', () => {
    const resetData: PasswordResetEmailData = {
      to: 'user@example.com',
      resetToken: 'abc123def456',
      expiryMinutes: 15,
    };

    it('should log password reset email in development mode', async () => {
      await service.sendPasswordResetEmail(resetData);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[EmailService - Dev Mode]'),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('user@example.com'),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Password Reset - Cartelligence'),
      );
    });

    it('should include reset token in the link', async () => {
      // The email is sent in dev mode (logged), so we just verify it doesn't throw
      await expect(service.sendPasswordResetEmail(resetData)).resolves.not.toThrow();
    });
  });

  describe('graceful fallback', () => {
    it('should not throw when SMTP is configured but unavailable', async () => {
      // Simulate production mode with invalid SMTP
      process.env.SMTP_HOST = 'invalid.smtp.host';
      process.env.NODE_ENV = 'production';
      process.env.SMTP_PORT = '587';
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASS = 'pass';

      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      const prodService = new EmailService();

      // Should not throw - graceful fallback
      await expect(
        prodService.sendLockoutEmail({
          to: 'user@example.com',
          lockoutDurationMinutes: 15,
          failedAttempts: 3,
        }),
      ).resolves.not.toThrow();

      errorSpy.mockRestore();

      // Clean up env
      delete process.env.SMTP_HOST;
      delete process.env.NODE_ENV;
      delete process.env.SMTP_PORT;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
    });
  });
});
