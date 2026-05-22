import nodemailer, { Transporter } from 'nodemailer';

/**
 * Email sending options for order confirmation.
 */
export interface OrderConfirmationEmailData {
  to: string;
  orderNumber: string;
  items: { name: string; quantity: number; unitPrice: number; subtotal: number }[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  grandTotal: number;
  deliverySlot?: { start: string; end: string } | null;
  deliveryAddress: string;
}

/**
 * Email sending options for account lockout notification.
 */
export interface LockoutEmailData {
  to: string;
  lockoutDurationMinutes: number;
  failedAttempts: number;
}

/**
 * Email sending options for password reset.
 */
export interface PasswordResetEmailData {
  to: string;
  resetToken: string;
  expiryMinutes: number;
}

/**
 * EmailService provides SMTP-based email sending with graceful fallback.
 *
 * Configuration via environment variables:
 * - SMTP_HOST: SMTP server hostname
 * - SMTP_PORT: SMTP server port (default: 587)
 * - SMTP_USER: SMTP authentication username
 * - SMTP_PASS: SMTP authentication password
 * - SMTP_FROM: Sender email address (default: noreply@cartelligence.ph)
 * - APP_BASE_URL: Base URL for links in emails (default: http://localhost:4200)
 *
 * In development mode (NODE_ENV !== 'production' or SMTP_HOST not set),
 * emails are logged to console instead of being sent via SMTP.
 *
 * Requirements: 1.3, 1.4, 7.5
 */
export class EmailService {
  private transporter: Transporter | null = null;
  private fromAddress: string;
  private appBaseUrl: string;
  private isDevelopment: boolean;

  constructor() {
    this.fromAddress = process.env.SMTP_FROM || 'noreply@cartelligence.ph';
    this.appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:4200';
    this.isDevelopment = !process.env.SMTP_HOST || process.env.NODE_ENV !== 'production';

    if (!this.isDevelopment) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: parseInt(process.env.SMTP_PORT || '587', 10) === 465,
        auth: {
          user: process.env.SMTP_USER || '',
          pass: process.env.SMTP_PASS || '',
        },
      });
    }
  }

  /**
   * Send an order confirmation email containing order number, items,
   * quantities, total, delivery slot, and address.
   * Must be sent within 60 seconds of order confirmation.
   *
   * Requirements: 7.5
   */
  async sendOrderConfirmationEmail(data: OrderConfirmationEmailData): Promise<void> {
    const itemsHtml = data.items
      .map(
        (item) =>
          `<tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.name}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₱${item.unitPrice.toFixed(2)}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₱${item.subtotal.toFixed(2)}</td>
          </tr>`,
      )
      .join('');

    const deliverySlotText = data.deliverySlot
      ? `${data.deliverySlot.start} - ${data.deliverySlot.end}`
      : 'To be scheduled';

    const subject = `Order Confirmation - ${data.orderNumber}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background: #000; padding: 20px; text-align: center;">
          <h1 style="color: #fff; margin: 0;">Cartelligence</h1>
          <p style="color: #ccc; margin: 5px 0 0;">Click.Cart. Delivered.</p>
        </div>
        <div style="padding: 30px 20px;">
          <h2 style="color: #000;">Order Confirmed!</h2>
          <p>Thank you for your order. Here are your order details:</p>
          <p><strong>Order Number:</strong> ${data.orderNumber}</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <thead>
              <tr style="background: #f5f5f5;">
                <th style="padding: 8px; text-align: left;">Item</th>
                <th style="padding: 8px; text-align: center;">Qty</th>
                <th style="padding: 8px; text-align: right;">Price</th>
                <th style="padding: 8px; text-align: right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          <div style="border-top: 2px solid #000; padding-top: 15px; margin-top: 10px;">
            <p><strong>Subtotal:</strong> ₱${data.subtotal.toFixed(2)}</p>
            <p><strong>Delivery Fee:</strong> ₱${data.deliveryFee.toFixed(2)}</p>
            ${data.discount > 0 ? `<p><strong>Discount:</strong> -₱${data.discount.toFixed(2)}</p>` : ''}
            <p style="font-size: 18px;"><strong>Grand Total: ₱${data.grandTotal.toFixed(2)}</strong></p>
          </div>
          <div style="margin-top: 20px; padding: 15px; background: #f9f9f9; border-radius: 4px;">
            <p><strong>Delivery Slot:</strong> ${deliverySlotText}</p>
            <p><strong>Delivery Address:</strong> ${data.deliveryAddress}</p>
          </div>
        </div>
        <div style="background: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666;">
          <p>Cartelligence - Click.Cart. Delivered.</p>
        </div>
      </div>
    `;

    await this.sendEmail(data.to, subject, html);
  }

  /**
   * Send an account lockout notification email.
   * Informs the user their account has been locked due to failed login attempts.
   *
   * Requirements: 1.3
   */
  async sendLockoutEmail(data: LockoutEmailData): Promise<void> {
    const subject = 'Account Locked - Cartelligence';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background: #000; padding: 20px; text-align: center;">
          <h1 style="color: #fff; margin: 0;">Cartelligence</h1>
          <p style="color: #ccc; margin: 5px 0 0;">Click.Cart. Delivered.</p>
        </div>
        <div style="padding: 30px 20px;">
          <h2 style="color: #000;">Account Locked</h2>
          <p>Your Cartelligence account has been temporarily locked due to ${data.failedAttempts} consecutive failed login attempts.</p>
          <p>Your account will be automatically unlocked in <strong>${data.lockoutDurationMinutes} minutes</strong>.</p>
          <p>If you did not attempt to log in, we recommend resetting your password immediately after the lockout period expires.</p>
          <div style="margin-top: 20px; padding: 15px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px;">
            <p style="margin: 0;"><strong>Security Tip:</strong> If you suspect unauthorized access, please reset your password and enable additional security measures.</p>
          </div>
        </div>
        <div style="background: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666;">
          <p>Cartelligence - Click.Cart. Delivered.</p>
        </div>
      </div>
    `;

    await this.sendEmail(data.to, subject, html);
  }

  /**
   * Send a password reset email with a token link.
   * The link expires after the specified number of minutes (15 min per requirement).
   *
   * Requirements: 1.4
   */
  async sendPasswordResetEmail(data: PasswordResetEmailData): Promise<void> {
    const resetLink = `${this.appBaseUrl}/auth/password-reset?token=${data.resetToken}`;
    const subject = 'Password Reset - Cartelligence';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background: #000; padding: 20px; text-align: center;">
          <h1 style="color: #fff; margin: 0;">Cartelligence</h1>
          <p style="color: #ccc; margin: 5px 0 0;">Click.Cart. Delivered.</p>
        </div>
        <div style="padding: 30px 20px;">
          <h2 style="color: #000;">Password Reset Request</h2>
          <p>We received a request to reset your password. Click the button below to set a new password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="background: #000; color: #fff; padding: 12px 30px; text-decoration: none; border-radius: 4px; font-weight: bold;">Reset Password</a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #666; font-size: 14px;">${resetLink}</p>
          <div style="margin-top: 20px; padding: 15px; background: #f9f9f9; border-radius: 4px;">
            <p style="margin: 0;"><strong>This link will expire in ${data.expiryMinutes} minutes.</strong></p>
          </div>
          <p style="margin-top: 20px; color: #666; font-size: 14px;">If you did not request a password reset, you can safely ignore this email.</p>
        </div>
        <div style="background: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666;">
          <p>Cartelligence - Click.Cart. Delivered.</p>
        </div>
      </div>
    `;

    await this.sendEmail(data.to, subject, html);
  }

  /**
   * Core email sending method. In development mode, logs to console.
   * In production, sends via SMTP. Falls back gracefully on failure
   * (logs error and continues, does not block the calling operation).
   */
  private async sendEmail(to: string, subject: string, html: string): Promise<void> {
    if (this.isDevelopment) {
      console.log(`[EmailService - Dev Mode] Email sent:`);
      console.log(`  To: ${to}`);
      console.log(`  Subject: ${subject}`);
      console.log(`  Body: (HTML email content)`);
      return;
    }

    try {
      await this.transporter!.sendMail({
        from: this.fromAddress,
        to,
        subject,
        html,
      });
      console.log(`[EmailService] Email sent successfully to: ${to}, subject: ${subject}`);
    } catch (error) {
      // Graceful fallback: log the error and continue without blocking
      console.error(
        `[EmailService] Failed to send email to ${to}: ${error instanceof Error ? error.message : String(error)}`,
      );
      console.log(`[EmailService] Email that failed to send:`);
      console.log(`  To: ${to}`);
      console.log(`  Subject: ${subject}`);
    }
  }
}

// Singleton instance for use across the application
let emailServiceInstance: EmailService | null = null;

/**
 * Get the singleton EmailService instance.
 */
export function getEmailService(): EmailService {
  if (!emailServiceInstance) {
    emailServiceInstance = new EmailService();
  }
  return emailServiceInstance;
}
