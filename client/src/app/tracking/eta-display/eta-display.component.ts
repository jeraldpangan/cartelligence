import { Component, input, signal, OnInit, OnDestroy, computed } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-eta-display',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './eta-display.component.html',
  styleUrl: './eta-display.component.scss',
})
export class ETADisplayComponent implements OnInit, OnDestroy {
  /** ISO string of the estimated arrival time, or null if unavailable */
  readonly estimatedArrival = input<string | null>(null);

  /** Current time signal, updated every 60 seconds */
  readonly now = signal(new Date());

  private intervalId: ReturnType<typeof setInterval> | null = null;

  readonly minutesRemaining = computed(() => {
    const eta = this.estimatedArrival();
    if (!eta) return null;

    const etaDate = new Date(eta);
    const diff = etaDate.getTime() - this.now().getTime();
    return Math.max(0, Math.ceil(diff / 60000));
  });

  readonly isUnavailable = computed(() => this.estimatedArrival() === null);

  readonly displayText = computed(() => {
    const minutes = this.minutesRemaining();
    if (minutes === null) return 'ETA temporarily unavailable';
    if (minutes === 0) return 'Arriving now';
    if (minutes === 1) return '1 minute away';
    if (minutes < 60) return `${minutes} minutes away`;
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    if (remainingMins === 0) return `${hours} hour${hours > 1 ? 's' : ''} away`;
    return `${hours}h ${remainingMins}m away`;
  });

  ngOnInit(): void {
    // Update the countdown every 60 seconds
    this.intervalId = setInterval(() => {
      this.now.set(new Date());
    }, 60000);
  }

  ngOnDestroy(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
