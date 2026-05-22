import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { Subject, takeUntil } from 'rxjs';
import { SearchBarComponent } from './search-bar/search-bar.component';
import { CatalogService } from './catalog.service';

interface PremiumProduct {
  id: string;
  name: string;
  price: number;
  originalPrice: number;
  rating: number;
  reviewsCount: number;
  image: string;
}

interface SidebarCategory {
  id: string;
  name: string;
  icon: string;
  dbCategoryId?: string; // Maps to database categories if available
}

@Component({
  selector: 'app-catalog-page',
  standalone: true,
  imports: [
    SearchBarComponent,
    MatIconModule,
    MatCardModule,
    MatButtonModule,
    RouterLink,
  ],
  templateUrl: './catalog-page.component.html',
  styleUrl: './catalog-page.component.scss',
})
export class CatalogPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly catalogService = inject(CatalogService);
  private readonly destroy$ = new Subject<void>();

  showSearch = false;
  searchQuery = '';

  // Real-time ticking countdown timer values
  countdownHours = '04';
  countdownMinutes = '12';
  countdownSeconds = '55';
  private totalSeconds = 4 * 3600 + 12 * 60 + 55;
  private timerInterval: ReturnType<typeof setInterval> | undefined;

  // Categories Sidebar list matching the mockup
  readonly sidebarCategories: SidebarCategory[] = [
    { id: 'electronics', name: 'Electronics', icon: 'devices', dbCategoryId: 'household' },
    { id: 'fashion', name: 'Fashion', icon: 'checkroom', dbCategoryId: 'personal_care' },
    { id: 'home_living', name: 'Home & Living', icon: 'chair', dbCategoryId: 'household' },
    { id: 'groceries', name: 'Groceries', icon: 'apple', dbCategoryId: 'produce' },
    { id: 'health_beauty', name: 'Health & Beauty', icon: 'spa', dbCategoryId: 'personal_care' },
    { id: 'babies_toys', name: 'Babies & Toys', icon: 'child_care', dbCategoryId: 'snacks' },
    { id: 'sports', name: 'Sports', icon: 'sports_basketball', dbCategoryId: 'beverages' },
    { id: 'automotive', name: 'Automotive', icon: 'directions_car', dbCategoryId: 'household' },
  ];

  // Premium mockup products matching the digital workspace theme in the mockup
  readonly premiumProducts: PremiumProduct[] = [
    {
      id: 'p1',
      name: 'Brass & Wood Desk Lamp',
      price: 1850.0,
      originalPrice: 2400.0,
      rating: 4.8,
      reviewsCount: 120,
      image: '/images/lamp.png',
    },
    {
      id: 'p2',
      name: 'Minimalist Humidifier',
      price: 1200.0,
      originalPrice: 1600.0,
      rating: 4.9,
      reviewsCount: 85,
      image: '/images/humidifier.png',
    },
    {
      id: 'p3',
      name: 'Oak Wood Wall Clock',
      price: 950.0,
      originalPrice: 1300.0,
      rating: 4.7,
      reviewsCount: 94,
      image: '/images/clock.png',
    },
    {
      id: 'p4',
      name: 'Linen Throw Pillow (Navy)',
      price: 450.0,
      originalPrice: 600.0,
      rating: 4.6,
      reviewsCount: 62,
      image: '/images/pillow.png',
    },
    {
      id: 'p5',
      name: 'Architectural Desk Lamp (Black)',
      price: 2100.0,
      originalPrice: 2800.0,
      rating: 4.9,
      reviewsCount: 43,
      image: '/images/dark_lamp.png',
    },
    {
      id: 'p6',
      name: 'Classic Lounge Chair',
      price: 4800.0,
      originalPrice: 6500.0,
      rating: 4.8,
      reviewsCount: 75,
      image: '/images/lounge_chair.png',
    },
  ];

  ngOnInit(): void {
    // Read route query parameters to toggle standard search or dashboard
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.searchQuery = params['q'] || '';
      this.showSearch = this.searchQuery.trim().length > 0;
    });

    // Initialize real-time ticking countdown timer
    this.startCountdown();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  // Starts decrementing total seconds and updates timer strings
  private startCountdown(): void {
    this.timerInterval = setInterval(() => {
      if (this.totalSeconds > 0) {
        this.totalSeconds--;
        const hrs = Math.floor(this.totalSeconds / 3600);
        const mins = Math.floor((this.totalSeconds % 3600) / 60);
        const secs = this.totalSeconds % 60;

        this.countdownHours = hrs < 10 ? `0${hrs}` : `${hrs}`;
        this.countdownMinutes = mins < 10 ? `0${mins}` : `${mins}`;
        this.countdownSeconds = secs < 10 ? `0${secs}` : `${secs}`;
      } else {
        // Reset timer when it reaches 0
        this.totalSeconds = 4 * 3600 + 12 * 60 + 55;
      }
    }, 1000);
  }

  onCategorySelect(category: SidebarCategory): void {
    if (category.dbCategoryId) {
      this.router.navigate(['/catalog/category', category.dbCategoryId]);
    }
  }

  formatPrice(price: number): string {
    return this.catalogService.formatPrice(price);
  }

  getDiscountPercentage(price: number, original: number): number {
    return Math.round(((original - price) / original) * 100);
  }
}
