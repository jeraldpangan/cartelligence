import { Router, Request, Response, NextFunction } from 'express';
import { AuthService } from '../../services/auth.service';
import {
  validateBody,
  registrationSchema,
  loginSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  tokenRefreshSchema,
} from '../../middleware/validation';
import { AppError } from '../../middleware/errorHandler';
import { ErrorCode } from '@shared/errors';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth';

const router = Router();
const authService = new AuthService();

/**
 * POST /api/v1/auth/register
 * Create a new user account.
 * Requirements: 1.1, 1.6, 1.7
 */
router.post(
  '/register',
  validateBody(registrationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userProfile = await authService.register(req.body);
      res.status(201).json({ data: userProfile });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/login
 * Authenticate user and return JWT tokens.
 * Requirements: 1.2, 1.3
 */
router.post(
  '/login',
  validateBody(loginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tokens = await authService.login(req.body);
      res.status(200).json({ data: tokens });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/logout
 * Invalidate the refresh token (client should discard tokens).
 * Requirements: 1.2
 */
router.post(
  '/logout',
  authenticate,
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // In a stateless JWT setup, logout is handled client-side by discarding tokens.
      // If a token blacklist or refresh token store is implemented later,
      // invalidation logic would go here.
      res.status(200).json({ data: { message: 'Logged out successfully' } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/password-reset/request
 * Request a password reset link sent to the registered email.
 * Requirements: 1.4
 */
router.post(
  '/password-reset/request',
  validateBody(passwordResetRequestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body;

      await authService.requestPasswordReset(email);

      // Always return success to prevent email enumeration
      res.status(200).json({
        data: {
          message:
            'If an account with that email exists, a password reset link has been sent.',
        },
      });
    } catch (err) {
      // Swallow not-found errors to prevent email enumeration
      if (err instanceof AppError && err.statusCode === 404) {
        res.status(200).json({
          data: {
            message:
              'If an account with that email exists, a password reset link has been sent.',
          },
        });
        return;
      }
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/password-reset/confirm
 * Confirm password reset with token and new password.
 * Requirements: 1.4
 */
router.post(
  '/password-reset/confirm',
  validateBody(passwordResetConfirmSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token, newPassword } = req.body;

      await authService.confirmPasswordReset(token, newPassword);

      res.status(200).json({
        data: { message: 'Password has been reset successfully.' },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/token/refresh
 * Refresh the access token using a valid refresh token.
 * Requirements: 1.2
 */
router.post(
  '/token/refresh',
  validateBody(tokenRefreshSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = req.body;

      const tokens = await authService.refreshToken(refreshToken);
      res.status(200).json({ data: tokens });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
