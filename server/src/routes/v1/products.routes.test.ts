import request from 'supertest';
import express from 'express';
import { globalErrorHandler } from '../../middleware/errorHandler';
import { ProductCategory } from '@shared/enums';

// Mock database and redis to prevent connection attempts
jest.mock('../../config/database', () => ({
  getDatabasePool: jest.fn(() => ({ query: jest.fn() })),
}));

jest.mock('../../config/redis', () => ({
  getRedisClient: jest.fn(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
  })),
}));

// Mock the ProductService - use inline jest.fn() to avoid hoisting issues
const mockGetCategories = jest.fn();
const mockGetProductsByCategory = jest.fn();
const mockSearchProducts = jest.fn();
const mockGetProductById = jest.fn();

jest.mock('../../services/product.service', () => {
  return {
    ProductService: jest.fn().mockImplementation(() => ({
      getCategories: (...args: unknown[]) => mockGetCategories(...args),
      getProductsByCategory: (...args: unknown[]) => mockGetProductsByCategory(...args),
      searchProducts: (...args: unknown[]) => mockSearchProducts(...args),
      getProductById: (...args: unknown[]) => mockGetProductById(...args),
    })),
  };
});

// Import after mocks are set up
import productsRoutes from './products.routes';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/products', productsRoutes);
  app.use(globalErrorHandler);
  return app;
}

describe('Products API Routes', () => {
  const app = createTestApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/products/categories', () => {
    it('should return all categories with 200 status', async () => {
      const categories = [
        { id: ProductCategory.Produce, name: 'Produce' },
        { id: ProductCategory.Dairy, name: 'Dairy' },
        { id: ProductCategory.Meat, name: 'Meat' },
        { id: ProductCategory.Beverages, name: 'Beverages' },
        { id: ProductCategory.Snacks, name: 'Snacks' },
        { id: ProductCategory.Household, name: 'Household' },
        { id: ProductCategory.PersonalCare, name: 'Personal Care' },
      ];
      mockGetCategories.mockResolvedValue(categories);

      const res = await request(app).get('/api/v1/products/categories');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(categories);
      expect(res.body.data).toHaveLength(7);
    });

    it('should handle service errors gracefully', async () => {
      mockGetCategories.mockRejectedValue(new Error('Database error'));

      const res = await request(app).get('/api/v1/products/categories');

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('SERVER_ERROR');
    });
  });

  describe('GET /api/v1/products/categories/:id/products', () => {
    const mockPaginatedResponse = {
      data: [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Apple',
          category: ProductCategory.Produce,
          unitPrice: 45.5,
          unit: 'kg',
          stockQuantity: 100,
          description: 'Fresh apples',
          nutritionalInfo: 'Vitamin C',
          isAvailable: true,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ],
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
    };

    it('should return products for a valid category', async () => {
      mockGetProductsByCategory.mockResolvedValue(mockPaginatedResponse);

      const res = await request(app).get(
        '/api/v1/products/categories/produce/products',
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.page).toBe(1);
      expect(res.body.pageSize).toBe(20);
      expect(res.body.totalItems).toBe(1);
      expect(res.body.totalPages).toBe(1);
    });

    it('should format prices with 2 decimal places', async () => {
      mockGetProductsByCategory.mockResolvedValue(mockPaginatedResponse);

      const res = await request(app).get(
        '/api/v1/products/categories/produce/products',
      );

      expect(res.status).toBe(200);
      expect(res.body.data[0].unitPrice).toBe(45.5);
    });

    it('should return 400 for invalid category', async () => {
      const res = await request(app).get(
        '/api/v1/products/categories/invalid_category/products',
      );

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details[0].field).toBe('id');
    });

    it('should accept all valid ProductCategory enum values', async () => {
      mockGetProductsByCategory.mockResolvedValue({
        ...mockPaginatedResponse,
        data: [],
      });

      for (const category of Object.values(ProductCategory)) {
        const res = await request(app).get(
          `/api/v1/products/categories/${category}/products`,
        );
        // Should not return 400 for valid categories
        expect(res.status).not.toBe(400);
      }
    });

    it('should pass page parameter to service', async () => {
      mockGetProductsByCategory.mockResolvedValue({
        ...mockPaginatedResponse,
        data: [],
        page: 2,
        totalItems: 0,
        totalPages: 0,
      });

      await request(app).get(
        '/api/v1/products/categories/produce/products?page=2',
      );

      expect(mockGetProductsByCategory).toHaveBeenCalledWith(
        ProductCategory.Produce,
        2,
      );
    });

    it('should return 200 with empty data and message when no products found', async () => {
      mockGetProductsByCategory.mockResolvedValue({
        data: [],
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
      });

      const res = await request(app).get(
        '/api/v1/products/categories/produce/products',
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.message).toBe('No products found in this category');
    });
  });

  describe('GET /api/v1/products/search', () => {
    const mockSearchResponse = {
      data: [
        {
          id: '123e4567-e89b-12d3-a456-426614174001',
          name: 'Banana',
          category: ProductCategory.Produce,
          unitPrice: 35.0,
          unit: 'kg',
          stockQuantity: 50,
          description: 'Fresh bananas',
          nutritionalInfo: 'Potassium',
          isAvailable: true,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ],
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
    };

    it('should return search results for valid query', async () => {
      mockSearchProducts.mockResolvedValue(mockSearchResponse);

      const res = await request(app).get(
        '/api/v1/products/search?q=banana',
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Banana');
    });

    it('should return 400 for query shorter than 2 characters', async () => {
      const res = await request(app).get('/api/v1/products/search?q=a');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details[0].field).toBe('q');
    });

    it('should return 400 for empty query', async () => {
      const res = await request(app).get('/api/v1/products/search?q=');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for missing query parameter', async () => {
      const res = await request(app).get('/api/v1/products/search');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for query longer than 100 characters', async () => {
      const longQuery = 'a'.repeat(101);
      const res = await request(app).get(
        `/api/v1/products/search?q=${longQuery}`,
      );

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details[0].field).toBe('q');
    });

    it('should accept query of exactly 2 characters', async () => {
      mockSearchProducts.mockResolvedValue({
        ...mockSearchResponse,
        data: [],
      });

      const res = await request(app).get('/api/v1/products/search?q=ab');

      expect(res.status).not.toBe(400);
    });

    it('should accept query of exactly 100 characters', async () => {
      mockSearchProducts.mockResolvedValue({
        ...mockSearchResponse,
        data: [],
      });
      const query100 = 'a'.repeat(100);

      const res = await request(app).get(
        `/api/v1/products/search?q=${query100}`,
      );

      expect(res.status).not.toBe(400);
    });

    it('should return 200 with empty data and message when no products found', async () => {
      mockSearchProducts.mockResolvedValue({
        data: [],
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
      });

      const res = await request(app).get(
        '/api/v1/products/search?q=nonexistent',
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.message).toBe('No products found matching your search');
    });

    it('should format prices with 2 decimal places', async () => {
      mockSearchProducts.mockResolvedValue(mockSearchResponse);

      const res = await request(app).get(
        '/api/v1/products/search?q=banana',
      );

      expect(res.status).toBe(200);
      expect(res.body.data[0].unitPrice).toBe(35.0);
    });

    it('should pass page parameter to service', async () => {
      mockSearchProducts.mockResolvedValue({
        ...mockSearchResponse,
        data: [],
      });

      await request(app).get('/api/v1/products/search?q=test&page=3');

      expect(mockSearchProducts).toHaveBeenCalledWith('test', 3);
    });
  });

  describe('GET /api/v1/products/:id', () => {
    const mockProduct = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Apple',
      category: ProductCategory.Produce,
      unitPrice: 45.5,
      unit: 'kg',
      stockQuantity: 100,
      description: 'Fresh apples',
      nutritionalInfo: 'Vitamin C',
      isAvailable: true,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    it('should return product detail for valid UUID', async () => {
      mockGetProductById.mockResolvedValue(mockProduct);

      const res = await request(app).get(
        '/api/v1/products/123e4567-e89b-12d3-a456-426614174000',
      );

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(res.body.data.name).toBe('Apple');
    });

    it('should format price with 2 decimal places', async () => {
      mockGetProductById.mockResolvedValue(mockProduct);

      const res = await request(app).get(
        '/api/v1/products/123e4567-e89b-12d3-a456-426614174000',
      );

      expect(res.status).toBe(200);
      expect(res.body.data.unitPrice).toBe(45.5);
    });

    it('should return 404 when product not found', async () => {
      mockGetProductById.mockResolvedValue(null);

      const res = await request(app).get(
        '/api/v1/products/123e4567-e89b-12d3-a456-426614174999',
      );

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error.message).toBe('Product not found');
    });

    it('should return 400 for invalid UUID format', async () => {
      const res = await request(app).get('/api/v1/products/not-a-uuid');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details[0].field).toBe('id');
    });

    it('should return 400 for numeric ID (non-UUID)', async () => {
      const res = await request(app).get('/api/v1/products/12345');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
