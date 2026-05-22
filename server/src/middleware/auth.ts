import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './errorHandler';
import { ErrorCode } from '@shared/errors';
import { UserRole } from '@shared/enums';

/**
 * Payload structure for decoded JWT access tokens.
 */
export interface AuthPayload {
  sub: string;
  email: string;
  role: UserRole;
  type: 'access';
}

/**
 * Extends Express Request to include authenticated user data.
 */
export interface AuthenticatedRequest extends Request {
  user?: AuthPayload;
}

/**
 * JWT authentication middleware for protected routes.
 * Verifies the access token from the Authorization header (Bearer scheme).
 * Attaches decoded user payload to req.user on success.
 *
 * Requirements: 1.2, 10.2
 */
export function authenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError(
      401,
      ErrorCode.Unauthorized,
      'Authentication required. Please provide a valid access token.',
    );
  }

  const token = authHeader.slice(7); // Remove 'Bearer ' prefix

  if (!token) {
    throw new AppError(
      401,
      ErrorCode.Unauthorized,
      'Authentication required. Please provide a valid access token.',
    );
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }

  try {
    const payload = jwt.verify(token, secret) as AuthPayload;

    if (payload.type !== 'access') {
      throw new AppError(
        401,
        ErrorCode.Unauthorized,
        'Invalid token type. Access token required.',
      );
    }

    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }

    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError(
        401,
        ErrorCode.Unauthorized,
        'Access token has expired. Please refresh your token.',
      );
    }

    if (err instanceof jwt.JsonWebTokenError) {
      throw new AppError(
        401,
        ErrorCode.Unauthorized,
        'Invalid access token.',
      );
    }

    throw new AppError(
      401,
      ErrorCode.Unauthorized,
      'Authentication failed.',
    );
  }
}

/**
 * Role-based authorization middleware.
 * Checks that the authenticated user's role is in the list of allowed roles.
 * Must be used after authenticate() middleware.
 *
 * Requirements: 1.5, 1.6, 1.7
 */
export function requireRole(...allowedRoles: UserRole[]): RequestHandler {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!allowedRoles.includes(req.user!.role)) {
      throw new AppError(
        403,
        ErrorCode.Forbidden,
        `Access denied. Required role: ${allowedRoles.join(' or ')}`,
      );
    }

    next();
  };
}
