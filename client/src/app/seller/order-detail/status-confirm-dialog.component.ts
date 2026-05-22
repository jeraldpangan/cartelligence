import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { OrderStatus } from '@shared/enums';

export interface StatusConfirmDialogData {
  currentStatus: OrderStatus;
  targetStatus: OrderStatus;
  currentStatusLabel: string;
  targetStatusLabel: string;
  orderNumber: string;
}

/**
 * Confirmation dialog shown before a seller transitions an order status.
 * Requirements: 4.5, 4.6
 */
@Component({
  selector: 'app-status-confirm-dialog',
  standalone: true,
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>Confirm Status Change</h2>
    <mat-dialog-content>
      <p>
        Are you sure you want to update order
        <strong>{{ data.orderNumber }}</strong>
        from
        <strong>{{ data.currentStatusLabel }}</strong>
        to
        <strong>{{ data.targetStatusLabel }}</strong>?
      </p>
      @if (data.targetStatus === 'cancelled') {
        <p class="dialog__warning">
          <mat-icon>warning</mat-icon>
          This action cannot be undone. The order will be permanently cancelled.
        </p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button [mat-dialog-close]="false">Cancel</button>
      <button
        mat-flat-button
        [color]="data.targetStatus === 'cancelled' ? 'warn' : 'primary'"
        [mat-dialog-close]="true"
      >
        Confirm
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .dialog__warning {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #b71c1c;
        font-size: 14px;
        margin-top: 8px;

        mat-icon {
          font-size: 18px;
          width: 18px;
          height: 18px;
        }
      }
    `,
  ],
})
export class StatusConfirmDialogComponent {
  readonly dialogRef = inject(MatDialogRef<StatusConfirmDialogComponent>);
  readonly data: StatusConfirmDialogData = inject(MAT_DIALOG_DATA);
}
