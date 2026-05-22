import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, Subject, map } from 'rxjs';
import { Product, PaginatedResponse } from '@shared/interfaces';
import { ProductCategory } from '@shared/enums';

export interface CategoryInfo {
  id: ProductCategory;
  name: string;
  icon: string;
}

const CATEGORIES: CategoryInfo[] = [
  { id: ProductCategory.Produce, name: 'Produce', icon: 'eco' },
  { id: ProductCategory.Dairy, name: 'Dairy', icon: 'water_drop' },
  { id: ProductCategory.Meat, name: 'Meat', icon: 'restaurant' },
  { id: ProductCategory.Snacks, name: 'Snacks', icon: 'cookie' },
  { id: ProductCategory.PersonalCare, name: 'Personal Care', icon: 'spa' },
  { id: ProductCategory.BabiesToys, name: 'Babies & Toys', icon: 'child_care' },
];

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly apiUrl = '/api/v1/products';
  private readonly recommendationsUrl = '/api/v1/recommendations';

  /** Emits whenever recommendations should be refreshed (e.g. after click tracking) */
  readonly recommendationsRefresh$ = new Subject<void>();

  constructor(private readonly http: HttpClient) {}

  getCategories(): CategoryInfo[] {
    return CATEGORIES;
  }

  getProductsByCategory(categoryId: string, page: number = 1): Observable<PaginatedResponse<Product>> {
    const params = new HttpParams().set('page', page.toString());
    return this.http.get<PaginatedResponse<Product>>(
      `${this.apiUrl}/categories/${categoryId}/products`,
      { params }
    );
  }

  searchProducts(query: string, page: number = 1): Observable<PaginatedResponse<Product>> {
    const params = new HttpParams()
      .set('q', query)
      .set('page', page.toString());
    return this.http.get<PaginatedResponse<Product>>(
      `${this.apiUrl}/search`,
      { params }
    );
  }

  getProductById(id: string): Observable<Product> {
    return this.http
      .get<{ data: Product }>(`${this.apiUrl}/${id}`)
      .pipe(map((response) => response.data));
  }

  getRelatedProducts(productId: string): Observable<Product[]> {
    return this.http
      .get<{ data: { products: Product[] } }>(`${this.recommendationsUrl}/product/${productId}/related`)
      .pipe(map((response) => response.data.products || []));
  }

  getHybridRecommendations(limit: number = 10): Observable<{ products: Product[]; status: string }> {
    const params = new HttpParams().set('limit', limit.toString());
    return this.http
      .get<{ data: { products: Product[]; status: string } }>(`${this.recommendationsUrl}/hybrid`, { params })
      .pipe(map((response) => response.data || { products: [], status: 'unavailable' }));
  }

  /**
   * Tracks a product click/view and notifies the recommendation engine.
   * Fire-and-forget: subscribes internally and signals a recommendations refresh.
   */
  trackProductClick(productId: string, category?: string): void {
    this.http.post(`${this.recommendationsUrl}/track-click`, { productId, category })
      .subscribe({
        next: () => {
          // Signal all listening components to refresh recommendations
          this.recommendationsRefresh$.next();
        },
        error: (err) => {
          console.warn('[CatalogService] Click tracking failed (non-critical):', err);
        }
      });
  }

  formatPrice(amount: number): string {
    return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

