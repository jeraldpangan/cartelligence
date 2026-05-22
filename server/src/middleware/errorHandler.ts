import { Request, Response, NextFunction } from 'express';
import { ErrorResponse, ErrorDetail, ErrorCode } from '@shared/errors';

/**
 * Custom application error class with HTTP status code and structured error details.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details: ErrorDetail[];

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details: ErrorDetail[] = [],
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Creates a structured error response object.
 */
function createErrorResponse(
  code: string,
  message: string,
  details: ErrorDetail[] = [],
): { error: ErrorResponse } {
  return {
    error: {
      code,
      message,
      details,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Global error handling middleware.
 * Catches all errors and returns structured JSON error responses.
 * Format: { error: { code, message, details[], timestamp } }
 */
export function globalErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Handle known application errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json(
      createErrorResponse(err.code, err.message, err.details),
    );
    return;
  }

  // Handle JSON parse errors (malformed request body)
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json(
      createErrorResponse(
        ErrorCode.ValidationError,
        'Invalid JSON in request body',
        [{ field: 'body', message: 'Request body contains invalid JSON' }],
      ),
    );
    return;
  }

  // Log unexpected errors server-side (avoid leaking internal details)
  console.error('Unhandled error:', err.message, err.stack);

  // Return generic server error to client
  res.status(500).json(
    createErrorResponse(
      ErrorCode.ServerError,
      'An unexpected error occurred. Please try again later.',
    ),
  );
}

/**
 * 404 Not Found handler for unmatched routes.
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json(
    createErrorResponse(
      ErrorCode.NotFound,
      `Route ${req.method} ${req.path} not found`,
    ),
  );
}

export { createErrorResponse };
