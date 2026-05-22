import { SellerService } from './seller.service';
import { ProcessedImage } from './upload.service';
import { CreateProductDto, UpdateProductDto } from './seller.dto';
import { ProductCategory } from '@shared/enums';

/**
 * Unit tests for SellerService.
 * Tests CRUD operations, ownership verification, soft-delete, and validation.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.3, 3.5, 3.6
 */

// Mock factories
function createMockPool() {
  const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
  };

  const pool = {
    query: jest.fn(),
    connect: jest.fn().mockResolvedValue(mockClient),
  };

  return pool as any;
}

function createMockRedis() {
  return {
    keys: jest.fn().mockResolvedValue([]),
    del: jest.fn().mockResolvedValue(0),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
  } as any;
}

function createMockUploadService() {
  return {
    processImages: jest.fn(),
    cleanupFiles: jest.fn().mockResolvedValue(undefined),
  } as any;
}

const SELLER_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_SELLER_ID = '22222222-2222-2222-2222-222222222222';
const PRODUCT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const VALID_CREATE_DTO: CreateProductDto = {
  name: 'Organic Bananas',
  category: ProductCategory.Produce,
  unitPrice: 45.50,
  unit: 'bunch',
  stockQuantity: 100,
  description: 'Fresh organic bananas',
};

const MOCK_PRODUCT_ROW = {
  id: PRODUCT_ID,
  seller_id: SELLER_ID,
  name: 'Organic Bananas',
  category: 'produce',
  unit_price: '45.50',
  unit: 'bunch',
  stock_quantity: 100,
  description: 'Fresh organic bananas',
  nutritional_info: null,
  is_available: true,
  deleted_at: null,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
  images: [],
};

describe('SellerService', () => {
  let pool: any;
  let redis: any;
  let uploadService: any;
  let service: SellerService;
  let mockClient: any;

  beforeEach(() => {
    pool = createMockPool();
    redis = createMockRedis();
    uploadService = createMockUploadService();
    service = new SellerService(pool, redis, uploadService);
    mockClient = pool.connect.mock.results[0]?.value || {
      query: jest.fn(),
      release: jest.fn(),
    };
  });

  describe('createProduct', () => {
    beforeEach(async () => {
      // Reset mock client for each test
      mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      } as any;
      pool.connect.mockResolvedValue(mockClient);

      // Mock the transaction queries
      mockClient.query.mockImplementation((query: string) => {
        if (query === 'BEGIN' || query === 'COMMIT' || query === 'ROLLBACK') {
          return Promise.resolve({ rows: [], rowCount: 0 } as any);
        }
        if (typeof query === 'string' && query.includes('INSERT INTO product')) {
          return Promise.resolve({ rows: [MOCK_PRODUCT_ROW], rowCount: 1 } as any);
        }
        if (typeof query === 'string' && query.includes('INSERT INTO product_image')) {
          return Promise.resolve({ rows: [], rowCount: 1 } as any);
        }
        return Promise.resolve({ rows: [], rowCount: 0 } as any);
      });

      // Mock getSellerProductById (called after creation)
      pool.query.mockResolvedValue({
        rows: [{ ...MOCK_PRODUCT_ROW, images: [] }],
        rowCount: 1,
      } as any);
    });

    it('should create a product with valid data and no images', async () => {
      uploadService.processImages.mockResolvedValue([]);

      const result = await service.createProduct(SELLER_ID, VALID_CREATE_DTO, []);

      expect(result.name).toBe('Organic Bananas');
      expect(result.sellerId).toBe(SELLER_ID);
      expect(result.isAvailable).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should create a product with images and set first as primary', async () => {
      const mockImages: ProcessedImage[] = [
        { url: '/uploads/img1.jpg', filename: 'img1.jpg' },
        { url: '/uploads/img2.jpg', filename: 'img2.jpg' },
      ];
      uploadService.processImages.mockResolvedValue(mockImages);

      const mockFiles = [
        { filename: 'img1.jpg' } as Express.Multer.File,
        { filename: 'img2.jpg' } as Express.Multer.File,
      ];

      await service.createProduct(SELLER_ID, VALID_CREATE_DTO, mockFiles);

      // Verify image inserts with correct sort_order and is_primary
      const imageInsertCalls = (mockClient.query as jest.Mock).mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('INSERT INTO product_image'),
      );
      expect(imageInsertCalls).toHaveLength(2);
      // First image: sort_order=0, is_primary=true
      expect(imageInsertCalls[0][1]).toContain(0); // sort_order
      expect(imageInsertCalls[0][1]).toContain(true); // is_primary
      // Second image: sort_order=1, is_primary=false
      expect(imageInsertCalls[1][1]).toContain(1); // sort_order
      expect(imageInsertCalls[1][1]).toContain(false); // is_primary
    });

    it('should reject product with invalid name (empty)', async () => {
      const invalidDto = { ...VALID_CREATE_DTO, name: '' };

      await expect(service.createProduct(SELLER_ID, invalidDto, [])).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should reject product with name exceeding 255 characters', async () => {
      const invalidDto = { ...VALID_CREATE_DTO, name: 'a'.repeat(256) };

      await expect(service.createProduct(SELLER_ID, invalidDto, [])).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should reject product with invalid category', async () => {
      const invalidDto = { ...VALID_CREATE_DTO, category: 'invalid' as ProductCategory };

      await expect(service.createProduct(SELLER_ID, invalidDto, [])).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should reject product with unit_price below 0.01', async () => {
      const invalidDto = { ...VALID_CREATE_DTO, unitPrice: 0 };

      await expect(service.createProduct(SELLER_ID, invalidDto, [])).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should reject product with unit_price above 9999999.99', async () => {
      const invalidDto = { ...VALID_CREATE_DTO, unitPrice: 10000000 };

      await expect(service.createProduct(SELLER_ID, invalidDto, [])).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should reject product with unit_price having more than 2 decimal places', async () => {
      const invalidDto = { ...VALID_CREATE_DTO, unitPrice: 10.123 };

      await expect(service.createProduct(SELLER_ID, invalidDto, [])).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should reject product with negative stock_quantity', async () => {
      const invalidDto = { ...VALID_CREATE_DTO, stockQuantity: -1 };

      await expect(service.createProduct(SELLER_ID, invalidDto, [])).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should reject product with stock_quantity exceeding 999999', async () => {
      const invalidDto = { ...VALID_CREATE_DTO, stockQuantity: 1000000 };

      await expect(service.createProduct(SELLER_ID, invalidDto, [])).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should reject product with non-integer stock_quantity', async () => {
      const invalidDto = { ...VALID_CREATE_DTO, stockQuantity: 10.5 };

      await expect(service.createProduct(SELLER_ID, invalidDto, [])).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should reject more than 5 images', async () => {
      const mockFiles = Array.from({ length: 6 }, (_, i) =>
        ({ filename: `img${i}.jpg` } as Express.Multer.File),
      );

      await expect(service.createProduct(SELLER_ID, VALID_CREATE_DTO, mockFiles)).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should rollback transaction and cleanup files on failure', async () => {
      mockClient.query.mockImplementation((query: string) => {
        if (query === 'BEGIN') return Promise.resolve({ rows: [] } as any);
        if (query === 'ROLLBACK') return Promise.resolve({ rows: [] } as any);
        if (typeof query === 'string' && query.includes('INSERT INTO product')) {
          return Promise.reject(new Error('DB error'));
        }
        return Promise.resolve({ rows: [] } as any);
      });

      const mockFiles = [{ filename: 'img1.jpg' } as Express.Multer.File];

      await expect(service.createProduct(SELLER_ID, VALID_CREATE_DTO, mockFiles)).rejects.toThrow('DB error');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(uploadService.cleanupFiles).toHaveBeenCalledWith(mockFiles);
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('getSellerProducts', () => {
    it('should return paginated products for the seller', async () => {
      pool.query.mockImplementation((query: string) => {
        if (typeof query === 'string' && query.includes('COUNT(*)')) {
          return Promise.resolve({ rows: [{ total: '2' }] } as any);
        }
        return Promise.resolve({
          rows: [
            { ...MOCK_PRODUCT_ROW, images: [] },
            { ...MOCK_PRODUCT_ROW, id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', images: [] },
          ],
        } as any);
      });

      const result = await service.getSellerProducts(SELLER_ID, 1);

      expect(result.data).toHaveLength(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.totalItems).toBe(2);
      expect(result.totalPages).toBe(1);
    });

    it('should exclude soft-deleted products', async () => {
      pool.query.mockImplementation((query: string) => {
        if (typeof query === 'string' && query.includes('COUNT(*)')) {
          // Verify the query filters by deleted_at IS NULL
          expect(query).toContain('deleted_at IS NULL');
          return Promise.resolve({ rows: [{ total: '1' }] } as any);
        }
        expect(query).toContain('deleted_at IS NULL');
        return Promise.resolve({ rows: [{ ...MOCK_PRODUCT_ROW, images: [] }] } as any);
      });

      await service.getSellerProducts(SELLER_ID, 1);
    });

    it('should default to page 1 for invalid page numbers', async () => {
      pool.query.mockImplementation((query: string) => {
        if (typeof query === 'string' && query.includes('COUNT(*)')) {
          return Promise.resolve({ rows: [{ total: '0' }] } as any);
        }
        return Promise.resolve({ rows: [] } as any);
      });

      const result = await service.getSellerProducts(SELLER_ID, -1);
      expect(result.page).toBe(1);
    });
  });

  describe('updateProduct', () => {
    it('should update product fields for the owner', async () => {
      // First call: check existing product
      // Second call: the actual update
      // Third call: getSellerProductById
      pool.query.mockImplementation((query: string) => {
        if (typeof query === 'string' && query.includes('SELECT * FROM product WHERE id')) {
          return Promise.resolve({ rows: [MOCK_PRODUCT_ROW] } as any);
        }
        if (typeof query === 'string' && query.includes('UPDATE product SET')) {
          return Promise.resolve({ rows: [{ ...MOCK_PRODUCT_ROW, name: 'Updated Name' }] } as any);
        }
        // getSellerProductById query (with JOIN)
        return Promise.resolve({
          rows: [{ ...MOCK_PRODUCT_ROW, name: 'Updated Name', images: [] }],
        } as any);
      });

      const updateDto: UpdateProductDto = { name: 'Updated Name' };
      const result = await service.updateProduct(SELLER_ID, PRODUCT_ID, updateDto);

      expect(result.name).toBe('Updated Name');
    });

    it('should reject update for non-existent product', async () => {
      pool.query.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      await expect(
        service.updateProduct(SELLER_ID, PRODUCT_ID, { name: 'New Name' }),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });

    it('should reject update for soft-deleted product', async () => {
      pool.query.mockResolvedValue({
        rows: [{ ...MOCK_PRODUCT_ROW, deleted_at: new Date() }],
      } as any);

      await expect(
        service.updateProduct(SELLER_ID, PRODUCT_ID, { name: 'New Name' }),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'Product no longer exists',
      });
    });

    it('should reject update for product owned by another seller', async () => {
      pool.query.mockResolvedValue({
        rows: [{ ...MOCK_PRODUCT_ROW, seller_id: OTHER_SELLER_ID }],
      } as any);

      await expect(
        service.updateProduct(SELLER_ID, PRODUCT_ID, { name: 'New Name' }),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
      });
    });

    it('should reject update with invalid validation fields', async () => {
      await expect(
        service.updateProduct(SELLER_ID, PRODUCT_ID, { unitPrice: -5 }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });
  });

  describe('deleteProduct', () => {
    it('should soft-delete a product owned by the seller', async () => {
      pool.query.mockImplementation((query: string) => {
        if (typeof query === 'string' && query.includes('SELECT * FROM product WHERE id')) {
          return Promise.resolve({ rows: [MOCK_PRODUCT_ROW] } as any);
        }
        if (typeof query === 'string' && query.includes('UPDATE product SET deleted_at')) {
          return Promise.resolve({ rows: [], rowCount: 1 } as any);
        }
        return Promise.resolve({ rows: [] } as any);
      });

      await service.deleteProduct(SELLER_ID, PRODUCT_ID);

      // Verify soft-delete query was called
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at = NOW()'),
        [PRODUCT_ID],
      );
    });

    it('should reject delete for non-existent product', async () => {
      pool.query.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      await expect(service.deleteProduct(SELLER_ID, PRODUCT_ID)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('should reject delete for already soft-deleted product', async () => {
      pool.query.mockResolvedValue({
        rows: [{ ...MOCK_PRODUCT_ROW, deleted_at: new Date() }],
      } as any);

      await expect(service.deleteProduct(SELLER_ID, PRODUCT_ID)).rejects.toMatchObject({
        statusCode: 404,
        message: 'Product no longer exists',
      });
    });

    it('should reject delete for product owned by another seller', async () => {
      pool.query.mockResolvedValue({
        rows: [{ ...MOCK_PRODUCT_ROW, seller_id: OTHER_SELLER_ID }],
      } as any);

      await expect(service.deleteProduct(SELLER_ID, PRODUCT_ID)).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  describe('toggleAvailability', () => {
    it('should flip is_available flag for owned product', async () => {
      pool.query.mockImplementation((query: string) => {
        if (typeof query === 'string' && query.includes('SELECT * FROM product WHERE id')) {
          return Promise.resolve({ rows: [MOCK_PRODUCT_ROW] } as any);
        }
        if (typeof query === 'string' && query.includes('NOT is_available')) {
          return Promise.resolve({ rows: [], rowCount: 1 } as any);
        }
        // getSellerProductById
        return Promise.resolve({
          rows: [{ ...MOCK_PRODUCT_ROW, is_available: false, images: [] }],
        } as any);
      });

      const result = await service.toggleAvailability(SELLER_ID, PRODUCT_ID);

      expect(result.isAvailable).toBe(false);
    });

    it('should reject toggle for non-existent product', async () => {
      pool.query.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      await expect(service.toggleAvailability(SELLER_ID, PRODUCT_ID)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('should reject toggle for soft-deleted product', async () => {
      pool.query.mockResolvedValue({
        rows: [{ ...MOCK_PRODUCT_ROW, deleted_at: new Date() }],
      } as any);

      await expect(service.toggleAvailability(SELLER_ID, PRODUCT_ID)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('should reject toggle for product owned by another seller', async () => {
      pool.query.mockResolvedValue({
        rows: [{ ...MOCK_PRODUCT_ROW, seller_id: OTHER_SELLER_ID }],
      } as any);

      await expect(service.toggleAvailability(SELLER_ID, PRODUCT_ID)).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });
});
