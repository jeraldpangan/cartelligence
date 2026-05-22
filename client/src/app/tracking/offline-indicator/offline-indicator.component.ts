import { Component, inject, signal, OnInit, OnDestroy, computed } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TrackingService } from '../tracking.service';

@Component({
  selector: 'app-offline-indicator',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './offline-indicator.component.html',
  styleUrl: './offline-indicator.component.scss',
})
export class OfflineIndicatorComponent implements OnInit, OnDestroy {
  private readonly trackingService = inject(TrackingService);
  private intervalId: ReturnType<typeof setInterval> | null = null;

  readonly isConnected = this.trackingService.isConnected;
  readonly lastUpdated = this.trackingService.lastUpdated;

  /** Manually ticking signal to force recomputation of staleness */
  readonly tick = signal(0);

  readonly stalenessText = computed(() => {
    // Reference tick to trigger recomputation
    this.tick();
    const last = this.lastUpdated();
    if (!last) return 'No data received';

    const diffMs = Date.now() - last.getTime();
    const minutes = Math.floor(diffMs / 60000);

    if (minutes < 1) return 'Last updated just now';
    if (minutes === 1) return 'Last updated 1 minute ago';
    if (minutes < 60) return `Last updated ${minutes} minutes ago`;

    const hours = Math.floor(minutes / 60);
    if (hours === 1) return 'Last updated 1 hour ago';
    return `Last updated ${hours} hours ago`;
  });

  readonly isVisible = computed(() => !this.isConnected());

  ngOnInit(): void {
    // Update staleness display every 60 seconds
    this.intervalId = setInterval(() => {
      this.tick.update((v) => v + 1);
    }, 60000);
  }

  ngOnDestroy(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
