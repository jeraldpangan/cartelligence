import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { CatalogService } from './catalog.service';
import { ProductCategory } from '@shared/enums';

describe('CatalogService', () => {
  let service: CatalogService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        CatalogService,
      ],
    });
    service = TestBed.inject(CatalogService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('getCategories', () => {
    it('should return all 7 categories', () => {
      const categories = service.getCategories();
      expect(categories).toHaveLength(7);
    });

    it('should include all ProductCategory enum values', () => {
      const categories = service.getCategories();
      const categoryIds = categories.map((c) => c.id);
      expect(categoryIds).toContain(ProductCategory.Produce);
      expect(categoryIds).toContain(ProductCategory.Dairy);
      expect(categoryIds).toContain(ProductCategory.Meat);
      expect(categoryIds).toContain(ProductCategory.Beverages);
      expect(categoryIds).toContain(ProductCategory.Snacks);
      expect(categoryIds).toContain(ProductCategory.Household);
      expect(categoryIds).toContain(ProductCategory.PersonalCare);
    });

    it('should have name and icon for each category', () => {
      const categories = service.getCategories();
      for (const category of categories) {
        expect(category.name).toBeTruthy();
        expect(category.icon).toBeTruthy();
      }
    });
  });

  describe('formatPrice', () => {
    it('should format price with ₱ prefix and 2 decimal places', () => {
      expect(service.formatPrice(100)).toBe('₱100.00');
    });

    it('should format price with thousands separator', () => {
      const result = service.formatPrice(1234.56);
      expect(result).toBe('₱1,234.56');
    });

    it('should format zero correctly', () => {
      expect(service.formatPrice(0)).toBe('₱0.00');
    });

    it('should format small decimal values', () => {
      expect(service.formatPrice(0.5)).toBe('₱0.50');
    });

    it('should format large values with proper separators', () => {
      const result = service.formatPrice(9999999.99);
      expect(result).toBe('₱9,999,999.99');
    });
  });

  describe('getProductsByCategory', () => {
    it('should call the correct API endpoint with page parameter', () => {
      service.getProductsByCategory('produce', 2).subscribe();

      const req = httpMock.expectOne('/api/v1/products/categories/produce/products?page=2');
      expect(req.request.method).toBe('GET');
      req.flush({ data: [], page: 2, pageSize: 20, totalItems: 0, totalPages: 0 });
    });

    it('should default to page 1', () => {
      service.getProductsByCategory('dairy').subscribe();

      const req = httpMock.expectOne('/api/v1/products/categories/dairy/products?page=1');
      expect(req.request.method).toBe('GET');
      req.flush({ data: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
    });
  });

  describe('searchProducts', () => {
    it('should call the search endpoint with query and page', () => {
      service.searchProducts('milk', 1).subscribe();

      const req = httpMock.expectOne('/api/v1/products/search?q=milk&page=1');
      expect(req.request.method).toBe('GET');
      req.flush({ data: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
    });
  });

  describe('getProductById', () => {
    it('should call the product detail endpoint', () => {
      service.getProductById('abc-123').subscribe();

      const req = httpMock.expectOne('/api/v1/products/abc-123');
      expect(req.request.method).toBe('GET');
      req.flush({ id: 'abc-123', name: 'Test Product' });
    });
  });

  describe('getRelatedProducts', () => {
    it('should call the recommendations endpoint', () => {
      service.getRelatedProducts('abc-123').subscribe();

      const req = httpMock.expectOne('/api/v1/recommendations/product/abc-123/related');
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });
  });
});
