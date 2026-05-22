import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ErrorResponse, ErrorCode } from '@shared/errors';
import { ErrorNotificationService } from './error-notification.service';

/**
 * Global HTTP error interceptor that handles structured error responses
 * from the backend API. Parses ErrorResponse format and provides
 * user-friendly notifications for common error categories.
 *
 * This interceptor runs AFTER the auth interceptor, so 401 token refresh
 * is already handled before this interceptor sees the error.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const errorNotification = inject(ErrorNotificationService);

  return next(req).pipe(
    catchError((httpError: HttpErrorResponse) => {
      // Parse the structured error response from the API
      const errorBody = httpError.error as { error?: ErrorResponse } | null;
      const apiError: ErrorResponse | null = errorBody?.error ?? null;

      switch (httpError.status) {
        case 400:
          // Validation errors - let components handle field-level details
          if (apiError?.code === ErrorCode.ValidationError) {
            errorNotification.showValidationError(
              apiError.message,
              apiError.details,
            );
          } else {
            errorNotification.showError(
              apiError?.message ?? 'Invalid request. Please check your input.',
            );
          }
          break;

        case 402:
          // Payment failure - let the component handle retry logic
          break;

        case 403:
          errorNotification.showError(
            apiError?.message ?? 'You do not have permission to perform this action.',
          );
          break;

        case 404:
          errorNotification.showError(
            apiError?.message ?? 'The requested resource was not found.',
          );
          break;

        case 409:
          // Stock conflict or other conflicts - let components handle specifics
          if (apiError?.code === ErrorCode.StockInsufficient) {
            errorNotification.showError(
              apiError.message ?? 'Some items in your cart are no longer available in the requested quantity.',
            );
          }
          break;

        case 429:
          errorNotification.showError(
            apiError?.message ?? 'Too many requests. Please try again later.',
          );
          break;

        case 500:
          errorNotification.showError(
            'An unexpected error occurred. Please try again later.',
          );
          break;

        case 503:
          errorNotification.showError(
            'Service is temporarily unavailable. Please try again in a moment.',
          );
          break;

        case 0:
          // Network error (no response received)
          errorNotification.showError(
            'Unable to connect to the server. Please check your internet connection.',
          );
          break;

        default:
          if (httpError.status >= 500) {
            errorNotification.showError(
              'A server error occurred. Please try again later.',
            );
          }
          break;
      }

      return throwError(() => httpError);
    }),
  );
};
