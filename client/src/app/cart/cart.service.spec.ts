import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { CartService } from './cart.service';
import { Cart, CostBreakdown } from '@shared/interfaces';

describe('CartService', () => {
  let service: CartService;
  let httpMock: HttpTestingController;

  const mockCostBreakdown: CostBreakdown = {
    subtotal: 250.0,
    deliveryFee: 50.0,
    discount: 0,
    grandTotal: 300.0,
  };

  const mockCart: Cart = {
    id: 'cart-1',
    userId: 'user-1',
    items: [
      {
        id: 'item-1',
        productId: 'prod-1',
        productName: 'Milk',
        unitPrice: 75.0,
        quantity: 2,
        subtotal: 150.0,
      },
      {
        id: 'item-2',
        productId: 'prod-2',
        productName: 'Bread',
        unitPrice: 50.0,
        quantity: 2,
        subtotal: 100.0,
      },
    ],
    costBreakdown: mockCostBreakdown,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), CartService],
    });
    service = TestBed.inject(CartService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('getCart', () => {
    it('should call GET /api/v1/cart/ and update cart subject', () => {
      let result: Cart | undefined;
      service.getCart().subscribe((cart) => (result = cart));

      const req = httpMock.expectOne('/api/v1/cart/');
      expect(req.request.method).toBe('GET');
      req.flush(mockCart);

      expect(result).toEqual(mockCart);
      expect(service.currentCart).toEqual(mockCart);
    });
  });

  describe('addItem', () => {
    it('should call POST /api/v1/cart/items with productId and quantity', () => {
      let result: Cart | undefined;
      service.addItem('prod-3', 1).subscribe((cart) => (result = cart));

      const req = httpMock.expectOne('/api/v1/cart/items');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ productId: 'prod-3', quantity: 1 });
      req.flush(mockCart);

      expect(result).toEqual(mockCart);
    });
  });

  describe('updateQuantity', () => {
    it('should call PATCH /api/v1/cart/items/:id with quantity', () => {
      let result: Cart | undefined;
      service.updateQuantity('item-1', 5).subscribe((cart) => (result = cart));

      const req = httpMock.expectOne('/api/v1/cart/items/item-1');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ quantity: 5 });
      req.flush(mockCart);

      expect(result).toEqual(mockCart);
    });
  });

  describe('removeItem', () => {
    it('should call DELETE /api/v1/cart/items/:id', () => {
      const emptyCart: Cart = {
        ...mockCart,
        items: [],
        costBreakdown: { subtotal: 0, deliveryFee: 0, discount: 0, grandTotal: 0 },
      };

      let result: Cart | undefined;
      service.removeItem('item-1').subscribe((cart) => (result = cart));

      const req = httpMock.expectOne('/api/v1/cart/items/item-1');
      expect(req.request.method).toBe('DELETE');
      req.flush(emptyCart);

      expect(result).toEqual(emptyCart);
      expect(service.currentCart).toEqual(emptyCart);
    });
  });

  describe('getCartBasedRecommendations', () => {
    it('should call GET /api/v1/recommendations/cart-based', () => {
      service.getCartBasedRecommendations().subscribe();

      const req = httpMock.expectOne('/api/v1/recommendations/cart-based');
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });
  });

  describe('itemCount', () => {
    it('should return 0 when cart is null', () => {
      expect(service.itemCount).toBe(0);
    });

    it('should return the number of items in the cart', () => {
      service.getCart().subscribe();
      httpMock.expectOne('/api/v1/cart/').flush(mockCart);

      expect(service.itemCount).toBe(2);
    });
  });

  describe('formatPrice', () => {
    it('should format price with ₱ prefix and 2 decimal places', () => {
      expect(service.formatPrice(100)).toBe('₱100.00');
    });

    it('should format price with thousands separator', () => {
      expect(service.formatPrice(1234.56)).toBe('₱1,234.56');
    });

    it('should format zero correctly', () => {
      expect(service.formatPrice(0)).toBe('₱0.00');
    });
  });
});
