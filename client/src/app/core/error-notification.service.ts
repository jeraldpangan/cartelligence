import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ErrorDetail } from '@shared/errors';

/**
 * Service for displaying error notifications to the user.
 * Uses Angular Material snackbar for non-intrusive error messages.
 */
@Injectable({ providedIn: 'root' })
export class ErrorNotificationService {
  private readonly defaultDuration = 5000;

  constructor(private readonly snackBar: MatSnackBar) {}

  /**
   * Show a general error message.
   */
  showError(message: string, duration: number = this.defaultDuration): void {
    this.snackBar.open(message, 'Dismiss', {
      duration,
      panelClass: ['error-snackbar'],
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
    });
  }

  /**
   * Show a validation error with field-level details.
   */
  showValidationError(
    message: string,
    details: ErrorDetail[] = [],
    duration: number = this.defaultDuration,
  ): void {
    const detailText = details.length > 0
      ? `${message}: ${details.map((d) => `${d.field} - ${d.message}`).join(', ')}`
      : message;

    this.snackBar.open(detailText, 'Dismiss', {
      duration,
      panelClass: ['error-snackbar'],
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
    });
  }

  /**
   * Show a warning/info message (non-error).
   */
  showWarning(message: string, duration: number = this.defaultDuration): void {
    this.snackBar.open(message, 'Dismiss', {
      duration,
      panelClass: ['warning-snackbar'],
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
    });
  }
}
