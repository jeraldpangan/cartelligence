import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, tap, map } from 'rxjs';
import { Cart, Product } from '@shared/interfaces';

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly cartUrl = '/api/v1/cart';
  private readonly recommendationsUrl = '/api/v1/recommendations';

  private readonly cartSubject = new BehaviorSubject<Cart | null>(null);
  readonly cart$ = this.cartSubject.asObservable();

  constructor(private readonly http: HttpClient) {}

  getCart(): Observable<Cart> {
    return this.http.get<{ data: Cart }>(`${this.cartUrl}/`).pipe(
      map((response) => response.data),
      tap((cart) => this.cartSubject.next(cart))
    );
  }

  addItem(productId: string, quantity: number): Observable<Cart> {
    return this.http
      .post<{ data: Cart }>(`${this.cartUrl}/items`, { productId, quantity })
      .pipe(
        map((response) => response.data),
        tap((cart) => this.cartSubject.next(cart))
      );
  }

  updateQuantity(itemId: string, quantity: number): Observable<Cart> {
    return this.http
      .patch<{ data: Cart }>(`${this.cartUrl}/items/${itemId}`, { quantity })
      .pipe(
        map((response) => response.data),
        tap((cart) => this.cartSubject.next(cart))
      );
  }

  removeItem(itemId: string): Observable<Cart> {
    return this.http
      .delete<{ data: Cart }>(`${this.cartUrl}/items/${itemId}`)
      .pipe(
        map((response) => response.data),
        tap((cart) => this.cartSubject.next(cart))
      );
  }

  getCartBasedRecommendations(): Observable<Product[]> {
    return this.http
      .get<{ data: { products: Product[] } }>(`${this.recommendationsUrl}/cart-based`)
      .pipe(map((response) => response.data.products || []));
  }

  get currentCart(): Cart | null {
    return this.cartSubject.value;
  }

  get itemCount(): number {
    return this.cartSubject.value?.items.length ?? 0;
  }

  formatPrice(amount: number): string {
    return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}
