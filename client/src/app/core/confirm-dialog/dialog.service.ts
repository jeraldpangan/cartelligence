import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { ConfirmDialogComponent, ConfirmDialogData } from './confirm-dialog.component';

/**
 * DialogService — convenience wrapper around MatDialog for confirmation and notification dialogs.
 *
 * Usage:
 *   // Confirmation (returns Observable<boolean>)
 *   this.dialogService.confirm('Delete Product', 'This cannot be undone.').subscribe(ok => { ... });
 *
 *   // Error notification
 *   this.dialogService.error('Upload Failed', 'File exceeds 5 MB.');
 *
 *   // Success notification
 *   this.dialogService.success('Product Created', 'Your product is now live.');
 */
@Injectable({ providedIn: 'root' })
export class DialogService {
  private readonly dialog = inject(MatDialog);

  /** Opens a confirmation dialog. Returns Observable<boolean> — true if confirmed. */
  confirm(
    title: string,
    message: string,
    options?: { confirmLabel?: string; cancelLabel?: string },
  ): Observable<boolean> {
    const data: ConfirmDialogData = {
      type: 'confirm',
      title,
      message,
      confirmLabel: options?.confirmLabel ?? 'Confirm',
      cancelLabel: options?.cancelLabel ?? 'Cancel',
    };
    return this.dialog
      .open(ConfirmDialogComponent, { data, width: '440px', disableClose: false })
      .afterClosed();
  }

  /** Opens a destructive confirmation dialog (red confirm button). */
  confirmDelete(
    title: string,
    message: string,
    confirmLabel = 'Delete',
  ): Observable<boolean> {
    const data: ConfirmDialogData = {
      type: 'warning',
      title,
      message,
      confirmLabel,
      cancelLabel: 'Cancel',
    };
    return this.dialog
      .open(ConfirmDialogComponent, { data, width: '440px', disableClose: false })
      .afterClosed();
  }

  /** Opens an error notification dialog (no cancel button). */
  error(title: string, message: string): Observable<boolean> {
    const data: ConfirmDialogData = {
      type: 'error',
      title,
      message,
      confirmLabel: 'OK',
      hideCancel: true,
    };
    return this.dialog
      .open(ConfirmDialogComponent, { data, width: '440px', disableClose: false })
      .afterClosed();
  }

  /** Opens a success notification dialog (no cancel button). */
  success(title: string, message: string): Observable<boolean> {
    const data: ConfirmDialogData = {
      type: 'success',
      title,
      message,
      confirmLabel: 'OK',
      hideCancel: true,
    };
    return this.dialog
      .open(ConfirmDialogComponent, { data, width: '440px', disableClose: false })
      .afterClosed();
  }
}
