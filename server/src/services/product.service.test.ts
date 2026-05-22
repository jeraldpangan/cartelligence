import { ProductService, CategoryInfo } from './product.service';
import { ProductCategory } from '@shared/enums';
import { Product, PaginatedResponse } from '@shared/interfaces';
import { PRODUCTS_PER_PAGE } from '@shared/validation';

// Mock database pool
const mockQuery = jest.fn();
const mockPool = {
  query: mockQuery,
} as any;

// Mock Redis client
const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
const mockRedis = {
  get: mockRedisGet,
  set: mockRedisSet,
} as any;

describe('ProductService', () => {
  let service: ProductService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisGet.mockResolvedValue(null); // Default: cache miss
    mockRedisSet.mockResolvedValue('OK');
    service = new ProductService(mockPool, mockRedis);
  });

  describe('getCategories', () => {
    it('should return all 8 grocery categories', async () => {
      const categories = await service.getCategories();

      expect(categories).toHaveLength(8);
      expect(categories.map((c: CategoryInfo) => c.id)).toEqual(
        expect.arrayContaining([
          ProductCategory.Produce,
          ProductCategory.Dairy,
          ProductCategory.Meat,
          ProductCategory.Beverages,
          ProductCategory.Snacks,
          ProductCategory.Household,
          ProductCategory.PersonalCare,
          ProductCategory.BabiesToys,
        ]),
      );
    });

    it('should include display names for each category', async () => {
      const categories = await service.getCategories();

      const produceCategory = categories.find(
        (c: CategoryInfo) => c.id === ProductCategory.Produce,
      );
      expect(produceCategory).toBeDefined();
      expect(produceCategory!.name).toBe('Produce');

      const personalCare = categories.find(
        (c: CategoryInfo) => c.id === ProductCategory.PersonalCare,
      );
      expect(personalCare).toBeDefined();
      expect(personalCare!.name).toBe('Personal Care');
    });

    it('should return cached categories when available', async () => {
      const cachedCategories: CategoryInfo[] = [
        { id: ProductCategory.Produce, name: 'Produce' },
      ];
      mockRedisGet.mockResolvedValue(JSON.stringify(cachedCategories));

      const categories = await service.getCategories();

      expect(categories).toEqual(cachedCategories);
      expect(mockRedisSet).not.toHaveBeenCalled();
    });

    it('should cache categories after fetching', async () => {
      await service.getCategories();

      expect(mockRedisSet).toHaveBeenCalledWith(
        'products:categories',
        expect.any(String),
        'EX',
        300,
      );
    });
  });

  describe('getProductsByCategory', () => {
    const mockProducts = [
      {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Apple',
        category: 'produce',
        unit_price: '45.50',
        unit: 'kg',
        stock_quantity: 100,
        description: 'Fresh apples',
        nutritional_info: 'Vitamin C',
        is_available: true,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01'),
      },
    ];

    it('should return paginated products for a category', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: mockProducts });

      const result = await service.getProductsByCategory(
        ProductCategory.Produce,
        1,
      );

      expect(result.data).toHaveLength(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(PRODUCTS_PER_PAGE);
      expect(result.totalItems).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('should only query available products', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.getProductsByCategory(ProductCategory.Dairy, 1);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_available = true'),
        expect.arrayContaining([ProductCategory.Dairy]),
      );
    });

    it('should correctly map database rows to Product interface', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: mockProducts });

      const result = await service.getProductsByCategory(
        ProductCategory.Produce,
        1,
      );

      const product = result.data[0];
      expect(product.id).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(product.name).toBe('Apple');
      expect(product.category).toBe(ProductCategory.Produce);
      expect(product.unitPrice).toBe(45.5);
      expect(product.unit).toBe('kg');
      expect(product.stockQuantity).toBe(100);
      expect(product.isAvailable).toBe(true);
    });

    it('should handle page numbers less than 1', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.getProductsByCategory(
        ProductCategory.Produce,
        0,
      );

      expect(result.page).toBe(1);
    });

    it('should use correct offset for pagination', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '50' }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.getProductsByCategory(ProductCategory.Produce, 3);

      // Page 3 with 20 per page = offset 40
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $2 OFFSET $3'),
        [ProductCategory.Produce, PRODUCTS_PER_PAGE, 40],
      );
    });

    it('should return cached results when available', async () => {
      const cachedResponse: PaginatedResponse<Product> = {
        data: [],
        page: 1,
        pageSize: PRODUCTS_PER_PAGE,
        totalItems: 0,
        totalPages: 0,
      };
      mockRedisGet.mockResolvedValue(JSON.stringify(cachedResponse));

      const result = await service.getProductsByCategory(
        ProductCategory.Produce,
        1,
      );

      expect(result).toEqual(cachedResponse);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('searchProducts', () => {
    const mockSearchResults = [
      {
        id: '123e4567-e89b-12d3-a456-426614174001',
        name: 'Banana',
        category: 'produce',
        unit_price: '35.00',
        unit: 'kg',
        stock_quantity: 50,
        description: 'Fresh bananas',
        nutritional_info: 'Potassium',
        is_available: true,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01'),
      },
    ];

    it('should return matching products for a valid query', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: mockSearchResults });

      const result = await service.searchProducts('banana', 1);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('Banana');
    });

    it('should return empty results for query shorter than 2 characters', async () => {
      const result = await service.searchProducts('a', 1);

      expect(result.data).toHaveLength(0);
      expect(result.totalItems).toBe(0);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should return empty results for query longer than 100 characters', async () => {
      const longQuery = 'a'.repeat(101);
      const result = await service.searchProducts(longQuery, 1);

      expect(result.data).toHaveLength(0);
      expect(result.totalItems).toBe(0);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should return empty results for empty query', async () => {
      const result = await service.searchProducts('', 1);

      expect(result.data).toHaveLength(0);
      expect(result.totalItems).toBe(0);
    });

    it('should perform case-insensitive search using ILIKE', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: mockSearchResults });

      await service.searchProducts('BANANA', 1);

      // Should normalize to lowercase for the search pattern
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        expect.arrayContaining(['%banana%']),
      );
    });

    it('should only return available products in search results', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.searchProducts('test', 1);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_available = true'),
        expect.any(Array),
      );
    });

    it('should paginate search results correctly', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '45' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.searchProducts('fruit', 2);

      expect(result.page).toBe(2);
      expect(result.totalItems).toBe(45);
      expect(result.totalPages).toBe(3);
    });
  });

  describe('getProductById', () => {
    const mockProduct = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Apple',
      category: 'produce',
      unit_price: '45.50',
      unit: 'kg',
      stock_quantity: 100,
      description: 'Fresh apples',
      nutritional_info: 'Vitamin C',
      is_available: true,
      created_at: new Date('2024-01-01'),
      updated_at: new Date('2024-01-01'),
    };

    it('should return a product when found', async () => {
      mockQuery.mockResolvedValue({ rows: [mockProduct] });

      const result = await service.getProductById(
        '123e4567-e89b-12d3-a456-426614174000',
      );

      expect(result).not.toBeNull();
      expect(result!.id).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(result!.name).toBe('Apple');
      expect(result!.unitPrice).toBe(45.5);
    });

    it('should return null when product not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await service.getProductById('nonexistent-id');

      expect(result).toBeNull();
    });

    it('should return cached product when available', async () => {
      const cachedProduct: Product = {
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
      mockRedisGet.mockResolvedValue(JSON.stringify(cachedProduct));

      const result = await service.getProductById(
        '123e4567-e89b-12d3-a456-426614174000',
      );

      expect(result).toEqual(cachedProduct);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should cache product after fetching from database', async () => {
      mockQuery.mockResolvedValue({ rows: [mockProduct] });

      await service.getProductById('123e4567-e89b-12d3-a456-426614174000');

      expect(mockRedisSet).toHaveBeenCalledWith(
        'products:detail:123e4567-e89b-12d3-a456-426614174000',
        expect.any(String),
        'EX',
        300,
      );
    });
  });

  describe('Redis error handling', () => {
    it('should fall through to database when Redis get fails', async () => {
      mockRedisGet.mockRejectedValue(new Error('Redis connection refused'));
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.getProductsByCategory(
        ProductCategory.Produce,
        1,
      );

      expect(result).toBeDefined();
      expect(result.data).toEqual([]);
    });

    it('should continue without caching when Redis set fails', async () => {
      mockRedisSet.mockRejectedValue(new Error('Redis connection refused'));
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      // Should not throw
      const result = await service.getProductsByCategory(
        ProductCategory.Produce,
        1,
      );

      expect(result).toBeDefined();
    });

    it('should return categories even when Redis is unavailable', async () => {
      mockRedisGet.mockRejectedValue(new Error('Redis unavailable'));
      mockRedisSet.mockRejectedValue(new Error('Redis unavailable'));

      const categories = await service.getCategories();

      expect(categories).toHaveLength(8);
    });
  });
});
