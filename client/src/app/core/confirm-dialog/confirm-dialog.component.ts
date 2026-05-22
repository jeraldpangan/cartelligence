import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export type DialogType = 'confirm' | 'error' | 'success' | 'warning';

export interface ConfirmDialogData {
  type?: DialogType;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** If true, hides the cancel button (for info/error dialogs) */
  hideCancel?: boolean;
}

/**
 * Reusable confirmation and notification dialog.
 *
 * Usage:
 *   const ref = this.dialog.open(ConfirmDialogComponent, {
 *     data: { type: 'confirm', title: 'Delete Product', message: 'Are you sure?' }
 *   });
 *   ref.afterClosed().subscribe((confirmed: boolean) => { ... });
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <div class="dialog-container">
      <div class="dialog-icon-row" [class]="'dialog-icon-row--' + data.type">
        <mat-icon class="dialog-icon">{{ iconName }}</mat-icon>
      </div>

      <h2 mat-dialog-title class="dialog-title">{{ data.title }}</h2>

      <mat-dialog-content>
        <p class="dialog-message">{{ data.message }}</p>
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        @if (!data.hideCancel) {
          <button mat-stroked-button [mat-dialog-close]="false" class="dialog-cancel-btn">
            {{ data.cancelLabel ?? 'Cancel' }}
          </button>
        }
        <button
          mat-flat-button
          [color]="confirmColor"
          [mat-dialog-close]="true"
          class="dialog-confirm-btn"
        >
          {{ data.confirmLabel ?? 'OK' }}
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .dialog-container {
      padding: 8px 0 0;
      min-width: 320px;
      max-width: 440px;
    }

    .dialog-icon-row {
      display: flex;
      justify-content: center;
      margin-bottom: 12px;

      &--error   .dialog-icon { color: #d32f2f; }
      &--success .dialog-icon { color: #2e7d32; }
      &--warning .dialog-icon { color: #f57c00; }
      &--confirm .dialog-icon { color: #1565c0; }
    }

    .dialog-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
    }

    .dialog-title {
      text-align: center;
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0 0 4px;
      padding: 0 24px;
    }

    .dialog-message {
      text-align: center;
      color: #555;
      font-size: 0.9375rem;
      line-height: 1.5;
      margin: 0;
    }

    .dialog-actions {
      padding: 16px 24px 8px;
      gap: 8px;
    }

    .dialog-cancel-btn {
      min-width: 88px;
    }

    .dialog-confirm-btn {
      min-width: 88px;
    }
  `],
})
export class ConfirmDialogComponent {
  readonly dialogRef = inject(MatDialogRef<ConfirmDialogComponent>);
  readonly data: ConfirmDialogData = inject(MAT_DIALOG_DATA);

  get iconName(): string {
    switch (this.data.type) {
      case 'error':   return 'error_outline';
      case 'success': return 'check_circle_outline';
      case 'warning': return 'warning_amber';
      default:        return 'help_outline';
    }
  }

  get confirmColor(): string {
    switch (this.data.type) {
      case 'error':   return 'warn';
      case 'success': return 'primary';
      case 'warning': return 'warn';
      default:        return 'primary';
    }
  }
}
