import { Component, inject, OnInit, OnDestroy, output, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { Subject, takeUntil } from 'rxjs';
import { DeliverySlot } from '@shared/interfaces';
import { OrderService } from '../order.service';

@Component({
  selector: 'app-delivery-scheduler',
  standalone: true,
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTabsModule,
  ],
  templateUrl: './delivery-scheduler.component.html',
  styleUrl: './delivery-scheduler.component.scss',
})
export class DeliverySchedulerComponent implements OnInit, OnDestroy {
  private readonly orderService = inject(OrderService);
  private readonly destroy$ = new Subject<void>();

  slotSelected = output<DeliverySlot>();

  days: { date: string; label: string; slots: DeliverySlot[] }[] = [];
  loading = signal(false);
  selectedSlot = signal<DeliverySlot | null>(null);
  errorMessage = signal('');

  ngOnInit(): void {
    this.loadSlots();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadSlots(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    const today = new Date();
    const dates: string[] = [];

    for (let i = 0; i < 3; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(this.formatDate(date));
    }

    this.days = dates.map((date) => ({
      date,
      label: this.getDayLabel(date),
      slots: [],
    }));

    let loadedCount = 0;

    dates.forEach((date, index) => {
      this.orderService
        .getDeliverySlots(date)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (slots) => {
            this.days[index].slots = slots;
            loadedCount++;
            if (loadedCount === dates.length) {
              this.loading.set(false);
            }
          },
          error: () => {
            loadedCount++;
            if (loadedCount === dates.length) {
              this.loading.set(false);
              this.errorMessage.set('Unable to load delivery slots. Please try again.');
            }
          },
        });
    });
  }

  selectSlot(slot: DeliverySlot): void {
    if (!slot.isAvailable) return;
    this.selectedSlot.set(slot);
    this.slotSelected.emit(slot);
  }

  isSelected(slot: DeliverySlot): boolean {
    return this.selectedSlot()?.id === slot.id;
  }

  formatTimeRange(slot: DeliverySlot): string {
    return `${this.formatTime(slot.startTime)} – ${this.formatTime(slot.endTime)}`;
  }

  private formatTime(time: string): string {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    return `${displayHour}:${minutes.toString().padStart(2, '0')} ${period}`;
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private getDayLabel(dateStr: string): string {
    const date = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    if (date.getTime() === today.getTime()) return 'Today';
    if (date.getTime() === tomorrow.getTime()) return 'Tomorrow';

    return date.toLocaleDateString('en-PH', { weekday: 'long', month: 'short', day: 'numeric' });
  }
}
