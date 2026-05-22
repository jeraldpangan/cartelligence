import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, DecimalPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject, debounceTime, takeUntil } from 'rxjs';
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
    CommonModule,
    DecimalPipe,
    MatProgressSpinnerModule,
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

  // Category view state
  selectedCategoryId: string | null = null;
  selectedSidebarId: string | null = null;
  categoryName = '';
  categoryProducts: any[] = [];
  loadingCategoryProducts = false;
  totalCategoryItems = 0;
  currentPage = 1;
  pageSize = 9;

  // AI Hybrid Recommendations State
  hybridProducts: any[] = [];
  recommendationStatus = 'unavailable';
  loadingRecommendations = false;

  // Flash Sale Dynamic Products state
  flashProducts: any[] = [];
  loadingFlash = false;

  // Real-time ticking countdown timer values
  countdownHours = '04';
  countdownMinutes = '12';
  countdownSeconds = '55';
  private totalSeconds = 4 * 3600 + 12 * 60 + 55;
  private timerInterval: ReturnType<typeof setInterval> | undefined;

  // Categories Sidebar list matching the mockup
  readonly sidebarCategories: SidebarCategory[] = [
    { id: 'electronics', name: 'Electronics', icon: 'devices', dbCategoryId: 'snacks' },
    { id: 'fashion', name: 'Fashion', icon: 'checkroom', dbCategoryId: 'personal_care' },
    { id: 'home_living', name: 'Home & Living', icon: 'chair', dbCategoryId: 'produce' },
    { id: 'groceries', name: 'Groceries', icon: 'apple', dbCategoryId: 'produce' },
    { id: 'health_beauty', name: 'Health & Beauty', icon: 'spa', dbCategoryId: 'personal_care' },
    { id: 'babies_toys', name: 'Babies & Toys', icon: 'child_care', dbCategoryId: 'babies_toys' },
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

    // Also read route parameters to see if a category is selected!
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.selectedCategoryId = params['categoryId'] || null;
      if (this.selectedCategoryId) {
        this.categoryName = this.getCategoryDisplayName(this.selectedCategoryId);
        this.currentPage = 1;
        this.loadCategoryProducts();
      } else {
        this.selectedSidebarId = null;
      }
    });

    // Initialize real-time ticking countdown timer
    this.startCountdown();

    // Load AI Hybrid Recommendations
    this.loadRecommendations();

    // Load Flash Sale Products from database
    this.loadFlashProducts();

    // Subscribe to real-time recommendation refresh signals (debounced)
    this.catalogService.recommendationsRefresh$
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(2000) // Wait 2s after last click before refreshing to batch rapid browsing
      )
      .subscribe(() => {
        this.loadRecommendations();
      });
  }

  loadRecommendations(): void {
    this.loadingRecommendations = true;
    this.catalogService.getHybridRecommendations(8)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.recommendationStatus = res.status === 'hybrid_personalized' ? 'calibrated' : (res.status || 'unavailable');
          this.hybridProducts = (res.products || []).map((product, index) => {
            const originalPrice = Number((product.unitPrice * 1.3).toFixed(2));
            const rating = Number((4.5 + (index % 5) * 0.1).toFixed(1));
            const reviewsCount = 12 + index * 8;
            return {
              id: product.id,
              name: product.name,
              price: product.unitPrice,
              originalPrice: originalPrice,
              rating: rating,
              reviewsCount: reviewsCount,
              unit: product.unit,
              category: product.category,
              description: product.description,
              stockQuantity: product.stockQuantity,
              isAvailable: product.isAvailable,
              image: this.getCategoryPlaceholderImage(product.category, index, product.name),
              sellerReliability: (product as any).sellerReliability || (4.5 + (index % 5) * 0.1).toFixed(1)
            };
          });
          this.loadingRecommendations = false;
        },
        error: () => {
          this.loadingRecommendations = false;
        }
      });
  }

  loadFlashProducts(): void {
    this.loadingFlash = true;
    this.catalogService.getProductsByCategory('snacks', 1)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res && res.data && res.data.length > 0) {
            this.flashProducts = res.data.slice(0, 6).map((product, index) => {
              return {
                id: product.id,
                name: product.name,
                price: product.unitPrice,
                originalPrice: Number((product.unitPrice * 1.3).toFixed(2)),
                rating: Number((4.5 + (index % 5) * 0.1).toFixed(1)),
                reviewsCount: 15 + index * 12,
                image: this.getCategoryPlaceholderImage(product.category, index, product.name),
                category: product.category
              };
            });
          } else {
            this.useFallbackPremiumProducts();
          }
          this.loadingFlash = false;
        },
        error: () => {
          this.useFallbackPremiumProducts();
          this.loadingFlash = false;
        }
      });
  }

  private useFallbackPremiumProducts(): void {
    this.flashProducts = this.premiumProducts.map(p => ({
      id: 'p1',
      name: p.name,
      price: p.price,
      originalPrice: p.originalPrice,
      rating: p.rating,
      reviewsCount: p.reviewsCount,
      image: p.image,
      category: 'premium'
    }));
  }

  private getCategoryPlaceholderImage(category: string, index: number, productName: string = ''): string {
    if (category === 'babies_toys') {
      const name = productName.toLowerCase();
      if (name.includes('wipe')) return '/images/baby_wipes.png';
      if (name.includes('diaper')) return '/images/baby_diapers.png';
      if (name.includes('food') || name.includes('puree') || name.includes('apple')) return '/images/baby_food.png';
      if (name.includes('bear') || name.includes('teddy')) return '/images/teddy_bear.png';
      if (name.includes('wooden') || name.includes('sorting') || name.includes('block')) return '/images/wooden_blocks.png';
      if (name.includes('wash') || name.includes('shampoo')) return '/images/baby_wash.png';

      const babyList: string[] = ['baby_wipes.png', 'baby_diapers.png', 'baby_food.png', 'teddy_bear.png', 'wooden_blocks.png', 'baby_wash.png'];
      return `/images/${babyList[index % babyList.length]}`;
    }
    const list: string[] = ['lamp.png', 'humidifier.png', 'clock.png', 'pillow.png', 'dark_lamp.png', 'lounge_chair.png'];
    return `/images/${list[index % list.length]}`;
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
      this.selectedSidebarId = category.id;
      this.router.navigate(['/catalog/category', category.dbCategoryId]);
    }
  }

  loadCategoryProducts(): void {
    if (!this.selectedCategoryId) return;

    this.loadingCategoryProducts = true;
    this.catalogService
      .getProductsByCategory(this.selectedCategoryId, this.currentPage)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.categoryProducts = (response.data || []).map((product, index) => {
            const originalPrice = Number((product.unitPrice * 1.25).toFixed(2));
            const rating = Number((4.3 + (index % 7) * 0.1).toFixed(1));
            const reviewsCount = 8 + index * 5;
            return {
              id: product.id,
              name: product.name,
              unitPrice: product.unitPrice,
              price: product.unitPrice,
              originalPrice: originalPrice,
              rating: rating,
              reviewsCount: reviewsCount,
              unit: product.unit,
              category: product.category,
              stockQuantity: product.stockQuantity,
              isAvailable: product.isAvailable,
              image: this.getCategoryPlaceholderImage(product.category, index, product.name)
            };
          });
          this.totalCategoryItems = response.totalItems || 0;
          this.loadingCategoryProducts = false;
        },
        error: () => {
          this.categoryProducts = [];
          this.totalCategoryItems = 0;
          this.loadingCategoryProducts = false;
        },
      });
  }

  getCategoryDisplayName(categoryId: string | null): string {
    if (!categoryId) return '';
    const category = this.catalogService
      .getCategories()
      .find((c) => c.id === categoryId);
    return category?.name || categoryId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  get totalPages(): number {
    return Math.ceil(this.totalCategoryItems / this.pageSize);
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadCategoryProducts();
  }

  formatPrice(price: number): string {
    return this.catalogService.formatPrice(price);
  }

  getDiscountPercentage(price: number, original: number): number {
    return Math.round(((original - price) / original) * 100);
  }

  isCategoryActive(category: SidebarCategory): boolean {
    if (!this.selectedCategoryId) return false;
    if (this.selectedSidebarId) {
      return this.selectedSidebarId === category.id;
    }
    // Default fallback mapping when navigated to the category URL directly (e.g. from chatbot or URL search bar)
    const defaultMapping: Record<string, string> = {
      'personal_care': 'health_beauty',
      'produce': 'groceries',
      'babies_toys': 'babies_toys',
      'snacks': 'electronics',
    };
    return defaultMapping[this.selectedCategoryId] === category.id;
  }
}
