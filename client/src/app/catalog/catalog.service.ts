import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
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
  { id: ProductCategory.Beverages, name: 'Beverages', icon: 'local_cafe' },
  { id: ProductCategory.Snacks, name: 'Snacks', icon: 'cookie' },
  { id: ProductCategory.Household, name: 'Household', icon: 'home' },
  { id: ProductCategory.PersonalCare, name: 'Personal Care', icon: 'spa' },
];

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly apiUrl = '/api/v1/products';
  private readonly recommendationsUrl = '/api/v1/recommendations';

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

  formatPrice(amount: number): string {
    return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}
