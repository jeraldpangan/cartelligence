import { Request, Response, NextFunction } from 'express';
import { ErrorCode } from '@shared/errors';
import { AppError } from './errorHandler';

/**
 * PostgreSQL error codes that indicate database unavailability.
 * See: https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
const DB_UNAVAILABLE_CODES = new Set([
  '08000', // connection_exception
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08003', // connection_does_not_exist
  '08004', // sqlserver_rejected_establishment_of_sqlconnection
  '08006', // connection_failure
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
]);

/**
 * PostgreSQL error codes that indicate a query timeout.
 */
const DB_TIMEOUT_CODES = new Set([
  '57014', // query_canceled (statement_timeout)
]);

/**
 * Checks if an error is a PostgreSQL database error based on its properties.
 */
function isPostgresError(err: unknown): err is Error & { code?: string; routine?: string } {
  return (
    err instanceof Error &&
    typeof (err as any).code === 'string' &&
    (typeof (err as any).routine === 'string' ||
      typeof (err as any).severity === 'string' ||
      (err as any).code?.length === 5)
  );
}

/**
 * Checks if an error indicates a database connection failure.
 * Handles both pg-specific errors and generic connection errors.
 */
function isDatabaseConnectionError(err: unknown): boolean {
  if (isPostgresError(err)) {
    return DB_UNAVAILABLE_CODES.has((err as any).code);
  }

  // Handle generic connection errors (ECONNREFUSED, ETIMEDOUT, etc.)
  if (err instanceof Error) {
    const code = (err as any).code;
    if (
      code === 'ECONNREFUSED' ||
      code === 'ECONNRESET' ||
      code === 'ETIMEDOUT' ||
      code === 'ENOTFOUND'
    ) {
      return true;
    }

    // Handle pool connection timeout
    const message = err.message.toLowerCase();
    if (
      message.includes('connection terminated') ||
      message.includes('connection timeout') ||
      message.includes('all connection retries exhausted') ||
      message.includes('cannot acquire a connection') ||
      message.includes('timeout expired')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if an error indicates a query timeout (statement_timeout).
 */
function isDatabaseTimeoutError(err: unknown): boolean {
  if (isPostgresError(err)) {
    return DB_TIMEOUT_CODES.has((err as any).code);
  }

  if (err instanceof Error) {
    const message = err.message.toLowerCase();
    if (
      message.includes('statement timeout') ||
      message.includes('canceling statement due to statement timeout')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Middleware that catches database-related errors and converts them
 * to appropriate 503 Service Unavailable responses.
 *
 * This ensures:
 * - Connection failures return 503 within 5 seconds (after 3 retries with 2s intervals)
 * - Query timeouts (5s threshold) return 503
 * - No partial writes on failure (transactions handle this at the service layer)
 *
 * Must be registered BEFORE the global error handler.
 *
 * Requirements: 10.4, 10.6
 */
export function databaseErrorHandler(
  err: Error,
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  // Skip if already an AppError (already handled by service layer)
  if (err instanceof AppError) {
    next(err);
    return;
  }

  if (isDatabaseConnectionError(err)) {
    const dbError = new AppError(
      503,
      ErrorCode.ServiceUnavailable,
      'Service temporarily unavailable. Please try again later.',
      [{ field: 'database', message: 'Database connection failed' }],
    );
    next(dbError);
    return;
  }

  if (isDatabaseTimeoutError(err)) {
    const dbError = new AppError(
      503,
      ErrorCode.ServiceUnavailable,
      'Request timed out. Please try again later.',
      [{ field: 'database', message: 'Query exceeded timeout threshold' }],
    );
    next(dbError);
    return;
  }

  // Not a database error, pass to next error handler
  next(err);
}

export {
  isDatabaseConnectionError,
  isDatabaseTimeoutError,
  isPostgresError,
  DB_UNAVAILABLE_CODES,
  DB_TIMEOUT_CODES,
};
