import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Product, Order, PaginatedResponse } from '@shared/interfaces';
import { ProductCategory, OrderStatus } from '@shared/enums';

/**
 * A seller-owned product with additional seller-specific fields.
 */
export interface SellerProduct extends Product {
  sellerId: string;
  images: SellerProductImage[];
}

/**
 * An image associated with a seller product.
 */
export interface SellerProductImage {
  id: string;
  url: string;
  filename: string;
  sortOrder: number;
  isPrimary: boolean;
}

/**
 * An order visible to the seller (contains at least one of their products).
 */
export interface SellerOrder extends Order {
  buyerName: string;
  buyerEmail: string;
}

/**
 * Summary statistics for the seller dashboard.
 */
export interface SellerDashboardStats {
  totalProducts: number;
  pendingOrders: number;
  activeProducts: number;
}

/**
 * DTO for creating a new product (without images — those are sent as FormData).
 */
export interface CreateProductDto {
  name: string;
  category: ProductCategory;
  unitPrice: number;
  unit: string;
  stockQuantity: number;
  description?: string;
}

/**
 * DTO for updating an existing product.
 */
export interface UpdateProductDto extends Partial<CreateProductDto> {}

/**
 * Service for seller-specific API calls.
 *
 * Covers:
 *   - GET /api/v1/seller/products  (Requirements: 2.2)
 *   - GET /api/v1/seller/orders    (Requirements: 4.1)
 */
@Injectable({ providedIn: 'root' })
export class SellerService {
  private readonly productsUrl = '/api/v1/seller/products';
  private readonly ordersUrl = '/api/v1/seller/orders';

  constructor(private readonly http: HttpClient) {}

  // ─── Products ────────────────────────────────────────────────────────────────

  /**
   * Returns a paginated list of the authenticated seller's products.
   * Requirements: 2.2
   */
  getSellerProducts(page: number = 1): Observable<PaginatedResponse<SellerProduct>> {
    const params = new HttpParams().set('page', page.toString());
    return this.http.get<PaginatedResponse<SellerProduct>>(this.productsUrl, { params });
  }

  /**
   * Returns a single product owned by the authenticated seller.
   */
  getProduct(id: string): Observable<SellerProduct> {
    return this.http.get<SellerProduct>(`${this.productsUrl}/${id}`);
  }

  /**
   * Creates a new product. Images are included in the FormData payload.
   */
  createProduct(formData: FormData): Observable<SellerProduct> {
    return this.http.post<SellerProduct>(this.productsUrl, formData);
  }

  /**
   * Updates an existing product owned by the authenticated seller.
   */
  updateProduct(id: string, dto: UpdateProductDto): Observable<SellerProduct> {
    return this.http.put<SellerProduct>(`${this.productsUrl}/${id}`, dto);
  }

  /**
   * Soft-deletes a product owned by the authenticated seller.
   */
  deleteProduct(id: string): Observable<void> {
    return this.http.delete<void>(`${this.productsUrl}/${id}`);
  }

  /**
   * Toggles the availability flag of a product.
   */
  toggleAvailability(id: string): Observable<SellerProduct> {
    return this.http.patch<SellerProduct>(`${this.productsUrl}/${id}/availability`, {});
  }

  // ─── Orders ──────────────────────────────────────────────────────────────────

  /**
   * Returns a paginated list of orders containing the seller's products.
   * Optionally filtered by order status.
   * Requirements: 4.1, 4.2
   */
  getOrders(page: number = 1, status?: OrderStatus): Observable<PaginatedResponse<SellerOrder>> {
    let params = new HttpParams().set('page', page.toString());
    if (status) {
      params = params.set('status', status);
    }
    return this.http.get<PaginatedResponse<SellerOrder>>(this.ordersUrl, { params });
  }

  /**
   * Returns the detail of a single order.
   */
  getOrder(id: string): Observable<SellerOrder> {
    return this.http.get<SellerOrder>(`${this.ordersUrl}/${id}`);
  }

  /**
   * Updates the status of an order.
   */
  updateOrderStatus(id: string, status: OrderStatus): Observable<SellerOrder> {
    return this.http.patch<SellerOrder>(`${this.ordersUrl}/${id}/status`, { status });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Formats a monetary amount in Philippine Peso.
   */
  formatPrice(amount: number): string {
    return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}
