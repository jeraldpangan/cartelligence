import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { RegisterDto, LoginDto } from '@shared/dtos';
import { UserProfile, AuthTokens } from '@shared/interfaces';
import { ErrorCode } from '@shared/errors';
import { UserRole } from '@shared/enums';
import { validateRegistration } from '@shared/validation';
import { getDatabasePool } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { EmailService, getEmailService } from './email.service';

const BCRYPT_COST_FACTOR = 12;
const ACCESS_TOKEN_EXPIRY = '30m';
const REFRESH_TOKEN_EXPIRY = '7d';
const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_DURATION_MINUTES = 15;
const PASSWORD_RESET_TOKEN_EXPIRY_MINUTES = 15;

/**
 * AuthService handles user registration, login, account lockout, and token refresh.
 * Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7
 */
export class AuthService {
  private pool: Pool;
  private emailService: EmailService;

  constructor(pool?: Pool, emailService?: EmailService) {
    this.pool = pool || getDatabasePool();
    this.emailService = emailService || getEmailService();
  }

  /**
   * Register a new user.
   * - Validates input using shared validation
   * - Checks for duplicate email
   * - Hashes password with bcrypt (cost factor 12)
   * - Creates USER_PROFILE record
   *
   * Requirements: 1.1, 1.5, 1.6, 1.7
   */
  async register(dto: RegisterDto): Promise<UserProfile> {
    // Validate input fields
    const validation = validateRegistration(dto);
    if (!validation.valid) {
      const details = Object.entries(validation.fieldErrors).flatMap(
        ([field, errors]) =>
          (errors || []).map((message) => ({ field, message })),
      );
      throw new AppError(
        400,
        ErrorCode.ValidationError,
        'Registration validation failed',
        details,
      );
    }

    // Check for duplicate email
    const existingUser = await this.pool.query(
      'SELECT id FROM user_profile WHERE email = $1',
      [dto.email.toLowerCase()],
    );

    if (existingUser.rows.length > 0) {
      throw new AppError(
        409,
        ErrorCode.Conflict,
        'An account with this email already exists',
        [{ field: 'email', message: 'Email is already in use' }],
      );
    }

    // Hash password with bcrypt cost factor 12
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST_FACTOR);

    // Determine role — default to 'buyer' if not provided or invalid
    const role: UserRole =
      dto.role === UserRole.Seller ? UserRole.Seller : UserRole.Buyer;

    // Create user profile
    const result = await this.pool.query(
      `INSERT INTO user_profile (email, password_hash, full_name, delivery_address, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, full_name, delivery_address, role, created_at, updated_at`,
      [dto.email.toLowerCase(), passwordHash, dto.fullName.trim(), dto.deliveryAddress, role],
    );

    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      deliveryAddress: row.delivery_address,
      role: row.role as UserRole,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  /**
   * Authenticate a user and return JWT tokens.
   * - Validates credentials
   * - Checks account lockout status
   * - Generates access token (30-min expiry) and refresh token
   * - Resets failed login attempts on success
   *
   * Requirements: 1.2, 1.3
   */
  async login(dto: LoginDto): Promise<AuthTokens> {
    const email = dto.email.toLowerCase();

    // Find user by email
    const result = await this.pool.query(
      `SELECT id, email, password_hash, role, failed_login_attempts, locked_until
       FROM user_profile WHERE email = $1`,
      [email],
    );

    if (result.rows.length === 0) {
      throw new AppError(
        401,
        ErrorCode.AuthenticationFailed,
        'Invalid email or password',
      );
    }

    const user = result.rows[0];

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const lockedUntil = new Date(user.locked_until);
      const minutesRemaining = Math.ceil(
        (lockedUntil.getTime() - Date.now()) / (1000 * 60),
      );
      throw new AppError(
        429,
        ErrorCode.AccountLocked,
        `Account is locked. Try again in ${minutesRemaining} minute(s).`,
      );
    }

    // Verify password
    const passwordValid = await bcrypt.compare(dto.password, user.password_hash);

    if (!passwordValid) {
      await this.handleFailedLogin(email);
      throw new AppError(
        401,
        ErrorCode.AuthenticationFailed,
        'Invalid email or password',
      );
    }

    // Reset failed login attempts on successful login
    await this.pool.query(
      `UPDATE user_profile SET failed_login_attempts = 0, locked_until = NULL, updated_at = NOW()
       WHERE email = $1`,
      [email],
    );

    // Generate tokens
    const accessToken = this.generateAccessToken(user.id, user.email, user.role as UserRole);
    const refreshToken = this.generateRefreshToken(user.id, user.email);

    return { accessToken, refreshToken };
  }

  /**
   * Handle a failed login attempt.
   * - Increments failure count
   * - Locks account after 3 consecutive failures for 15 minutes
   * - Sends lockout notification email (placeholder)
   *
   * Requirements: 1.3
   */
  async handleFailedLogin(email: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE user_profile
       SET failed_login_attempts = failed_login_attempts + 1, updated_at = NOW()
       WHERE email = $1
       RETURNING failed_login_attempts`,
      [email.toLowerCase()],
    );

    if (result.rows.length === 0) {
      return;
    }

    const failedAttempts = result.rows[0].failed_login_attempts;

    if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
      const lockedUntil = new Date(
        Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000,
      );

      await this.pool.query(
        `UPDATE user_profile SET locked_until = $1, updated_at = NOW() WHERE email = $2`,
        [lockedUntil.toISOString(), email.toLowerCase()],
      );

      // Send lockout notification email (placeholder)
      await this.sendLockoutEmail(email);
    }
  }

  /**
   * Request a password reset.
   * - Generates a secure random token with 15-minute expiry
   * - Stores token in password_reset_token table
   * - Sends reset email to the user (placeholder)
   * - Silently succeeds even if email not found (prevents email enumeration)
   *
   * Requirements: 1.4
   */
  async requestPasswordReset(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase();

    // Find user by email
    const result = await this.pool.query(
      'SELECT id, email FROM user_profile WHERE email = $1',
      [normalizedEmail],
    );

    if (result.rows.length === 0) {
      // Silently return to prevent email enumeration
      return;
    }

    const user = result.rows[0];

    // Generate a secure random token
    const token = crypto.randomBytes(32).toString('hex');

    // Calculate expiry (15 minutes from now)
    const expiresAt = new Date(
      Date.now() + PASSWORD_RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000,
    );

    // Store the token in the database
    await this.pool.query(
      `INSERT INTO password_reset_token (user_id, token, expires_at, used)
       VALUES ($1, $2, $3, FALSE)`,
      [user.id, token, expiresAt.toISOString()],
    );

    // Send reset email (placeholder)
    await this.sendPasswordResetEmail(user.email, token);
  }

  /**
   * Confirm a password reset using a valid token.
   * - Validates the token exists, is not expired, and has not been used
   * - Updates the user's password hash with bcrypt (cost factor 12)
   * - Marks the token as used (single-use enforcement)
   *
   * Requirements: 1.4
   */
  async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
    // Find the token record
    const result = await this.pool.query(
      `SELECT id, user_id, expires_at, used
       FROM password_reset_token
       WHERE token = $1`,
      [token],
    );

    if (result.rows.length === 0) {
      throw new AppError(
        400,
        ErrorCode.ValidationError,
        'Invalid or expired password reset token',
        [{ field: 'token', message: 'The reset token is invalid' }],
      );
    }

    const resetToken = result.rows[0];

    // Check if token has already been used (single-use enforcement)
    if (resetToken.used) {
      throw new AppError(
        400,
        ErrorCode.ValidationError,
        'Password reset token has already been used',
        [{ field: 'token', message: 'This reset token has already been used' }],
      );
    }

    // Check if token has expired
    if (new Date(resetToken.expires_at) < new Date()) {
      throw new AppError(
        400,
        ErrorCode.ValidationError,
        'Password reset token has expired',
        [{ field: 'token', message: 'The reset token has expired' }],
      );
    }

    // Hash the new password with bcrypt cost factor 12
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST_FACTOR);

    // Update the user's password
    await this.pool.query(
      `UPDATE user_profile SET password_hash = $1, updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, resetToken.user_id],
    );

    // Mark the token as used (single-use)
    await this.pool.query(
      `UPDATE password_reset_token SET used = TRUE WHERE id = $1`,
      [resetToken.id],
    );
  }

  /**
   * Refresh an access token using a valid refresh token.
   * - Validates the refresh token
   * - Issues a new access token
   *
   * Requirements: 1.2
   */
  async refreshToken(refreshTokenStr: string): Promise<AuthTokens> {
    const secret = this.getRefreshSecret();

    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(refreshTokenStr, secret) as jwt.JwtPayload;
    } catch {
      throw new AppError(
        401,
        ErrorCode.AuthenticationFailed,
        'Invalid or expired refresh token',
      );
    }

    if (!payload.sub || !payload.email) {
      throw new AppError(
        401,
        ErrorCode.AuthenticationFailed,
        'Invalid refresh token payload',
      );
    }

    // Verify user still exists
    const result = await this.pool.query(
      'SELECT id, email, role FROM user_profile WHERE id = $1',
      [payload.sub],
    );

    if (result.rows.length === 0) {
      throw new AppError(
        401,
        ErrorCode.AuthenticationFailed,
        'User not found',
      );
    }

    const user = result.rows[0];
    const accessToken = this.generateAccessToken(user.id, user.email, user.role as UserRole);
    const newRefreshToken = this.generateRefreshToken(user.id, user.email);

    return { accessToken, refreshToken: newRefreshToken };
  }

  /**
   * Generate a JWT access token with 30-minute expiry.
   * Includes the user's role as a claim for authorization decisions.
   */
  private generateAccessToken(userId: string, email: string, role: UserRole): string {
    const secret = this.getAccessSecret();
    return jwt.sign(
      { sub: userId, email, role, type: 'access' },
      secret,
      { expiresIn: ACCESS_TOKEN_EXPIRY },
    );
  }

  /**
   * Generate a JWT refresh token with 7-day expiry.
   */
  private generateRefreshToken(userId: string, email: string): string {
    const secret = this.getRefreshSecret();
    return jwt.sign(
      { sub: userId, email, type: 'refresh' },
      secret,
      { expiresIn: REFRESH_TOKEN_EXPIRY },
    );
  }

  /**
   * Get the JWT access token secret from environment variables.
   */
  private getAccessSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is not set');
    }
    return secret;
  }

  /**
   * Get the JWT refresh token secret from environment variables.
   */
  private getRefreshSecret(): string {
    const secret = process.env.JWT_REFRESH_SECRET;
    if (!secret) {
      throw new Error('JWT_REFRESH_SECRET environment variable is not set');
    }
    return secret;
  }

  /**
   * Send a lockout notification email to the user.
   * Uses EmailService for SMTP delivery with graceful fallback.
   */
  private async sendLockoutEmail(email: string): Promise<void> {
    await this.emailService.sendLockoutEmail({
      to: email,
      lockoutDurationMinutes: LOCKOUT_DURATION_MINUTES,
      failedAttempts: MAX_FAILED_ATTEMPTS,
    });
  }

  /**
   * Send a password reset email to the user.
   * Uses EmailService for SMTP delivery with graceful fallback.
   * Reset link expires after 15 minutes.
   */
  private async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    await this.emailService.sendPasswordResetEmail({
      to: email,
      resetToken: token,
      expiryMinutes: PASSWORD_RESET_TOKEN_EXPIRY_MINUTES,
    });
  }
}

