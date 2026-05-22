import { SmartCartService } from './cart.service';
import { ErrorCode } from '@shared/errors';
import { CART_MAX_ITEMS } from '@shared/validation';

// Mock database pool
const mockQuery = jest.fn();
const mockPool = {
  query: mockQuery,
  connect: jest.fn(),
  end: jest.fn(),
} as any;

// Mock Redis client
const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
const mockRedisDel = jest.fn();
const mockRedis = {
  get: mockRedisGet,
  set: mockRedisSet,
  del: mockRedisDel,
} as any;

// Mock the database and redis module imports
jest.mock('../config/database', () => ({
  getDatabasePool: () => mockPool,
}));

jest.mock('../config/redis', () => ({
  getRedisClient: () => mockRedis,
}));

describe('SmartCartService', () => {
  let service: SmartCartService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisGet.mockResolvedValue(null); // Default: no cache
    mockRedisSet.mockResolvedValue('OK');
    mockRedisDel.mockResolvedValue(1);
    service = new SmartCartService(mockPool, mockRedis);
  });

  describe('addItem', () => {
    const userId = 'user-123';
    const productId = 'product-456';
    const cartId = 'cart-789';

    beforeEach(() => {
      // Default: product exists with stock
      mockQuery.mockImplementation((sql: string, params?: any[]) => {
        if (sql.includes('FROM product WHERE id')) {
          return { rows: [{ id: productId, stock_quantity: 10, is_available: true }] };
        }
        if (sql.includes('FROM cart WHERE user_id')) {
          return { rows: [{ id: cartId, user_id: userId, created_at: new Date(), updated_at: new Date() }] };
        }
        if (sql.includes('FROM cart_item WHERE cart_id') && sql.includes('product_id')) {
          return { rows: [] }; // No existing item
        }
        if (sql.includes('COUNT(*)')) {
          return { rows: [{ count: '5' }] };
        }
        if (sql.includes('INSERT INTO cart_item')) {
          return { rows: [{ id: 'item-1' }] };
        }
        if (sql.includes('UPDATE cart SET')) {
          return { rows: [] };
        }
        // getCart query for items with product details
        if (sql.includes('FROM cart_item ci') && sql.includes('JOIN product')) {
          return {
            rows: [{
              id: 'item-1',
              product_id: productId,
              quantity: 2,
              product_name: 'Test Product',
              unit_price: '25.50',
            }],
          };
        }
        return { rows: [] };
      });
    });

    it('should add an item to the cart successfully', async () => {
      const result = await service.addItem(userId, productId, 2);

      expect(result).toBeDefined();
      expect(result.items).toHaveLength(1);
      expect(result.items[0].productId).toBe(productId);
      expect(result.items[0].quantity).toBe(2);
    });

    it('should reject quantity below minimum (0)', async () => {
      await expect(service.addItem(userId, productId, 0)).rejects.toMatchObject({
        code: ErrorCode.ValidationError,
      });
    });

    it('should reject quantity above maximum (100)', async () => {
      await expect(service.addItem(userId, productId, 100)).rejects.toMatchObject({
        code: ErrorCode.ValidationError,
      });
    });

    it('should reject when product not found', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM product WHERE id')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      await expect(service.addItem(userId, productId, 1)).rejects.toMatchObject({
        code: ErrorCode.NotFound,
      });
    });

    it('should reject when product is out of stock', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM product WHERE id')) {
          return { rows: [{ id: productId, stock_quantity: 0, is_available: true }] };
        }
        return { rows: [] };
      });

      await expect(service.addItem(userId, productId, 1)).rejects.toMatchObject({
        code: ErrorCode.StockInsufficient,
      });
    });

    it('should reject when product is unavailable', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM product WHERE id')) {
          return { rows: [{ id: productId, stock_quantity: 5, is_available: false }] };
        }
        return { rows: [] };
      });

      await expect(service.addItem(userId, productId, 1)).rejects.toMatchObject({
        code: ErrorCode.StockInsufficient,
      });
    });

    it('should reject when quantity exceeds stock and report max available', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM product WHERE id')) {
          return { rows: [{ id: productId, stock_quantity: 3, is_available: true }] };
        }
        if (sql.includes('FROM cart WHERE user_id')) {
          return { rows: [{ id: cartId, user_id: userId, created_at: new Date(), updated_at: new Date() }] };
        }
        if (sql.includes('FROM cart_item WHERE cart_id') && sql.includes('product_id')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      try {
        await service.addItem(userId, productId, 5);
        fail('Should have thrown');
      } catch (err: any) {
        expect(err.code).toBe(ErrorCode.StockInsufficient);
        expect(err.message).toContain('Maximum available: 3');
      }
    });

    it('should reject when cart has 50 distinct items', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM product WHERE id')) {
          return { rows: [{ id: productId, stock_quantity: 10, is_available: true }] };
        }
        if (sql.includes('FROM cart WHERE user_id')) {
          return { rows: [{ id: cartId, user_id: userId, created_at: new Date(), updated_at: new Date() }] };
        }
        if (sql.includes('FROM cart_item WHERE cart_id') && sql.includes('product_id')) {
          return { rows: [] }; // Product not already in cart
        }
        if (sql.includes('COUNT(*)')) {
          return { rows: [{ count: String(CART_MAX_ITEMS) }] };
        }
        return { rows: [] };
      });

      await expect(service.addItem(userId, productId, 1)).rejects.toMatchObject({
        code: ErrorCode.Conflict,
      });
    });

    it('should increment quantity when product already in cart', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM product WHERE id')) {
          return { rows: [{ id: productId, stock_quantity: 10, is_available: true }] };
        }
        if (sql.includes('FROM cart WHERE user_id')) {
          return { rows: [{ id: cartId, user_id: userId, created_at: new Date(), updated_at: new Date() }] };
        }
        if (sql.includes('FROM cart_item WHERE cart_id') && sql.includes('product_id')) {
          return { rows: [{ id: 'item-1', quantity: 3 }] }; // Already has 3
        }
        if (sql.includes('UPDATE cart_item SET quantity')) {
          return { rows: [] };
        }
        if (sql.includes('UPDATE cart SET')) {
          return { rows: [] };
        }
        if (sql.includes('FROM cart_item ci') && sql.includes('JOIN product')) {
          return {
            rows: [{
              id: 'item-1',
              product_id: productId,
              quantity: 5, // 3 + 2
              product_name: 'Test Product',
              unit_price: '25.50',
            }],
          };
        }
        return { rows: [] };
      });

      const result = await service.addItem(userId, productId, 2);
      expect(result.items[0].quantity).toBe(5);
    });
  });

  describe('removeItem', () => {
    const userId = 'user-123';
    const cartId = 'cart-789';
    const itemId = 'item-1';

    it('should remove an item from the cart', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM cart WHERE user_id')) {
          return { rows: [{ id: cartId, user_id: userId, created_at: new Date(), updated_at: new Date() }] };
        }
        if (sql.includes('FROM cart_item WHERE id') && sql.includes('cart_id')) {
          return { rows: [{ id: itemId }] };
        }
        if (sql.includes('DELETE FROM cart_item')) {
          return { rows: [] };
        }
        if (sql.includes('UPDATE cart SET')) {
          return { rows: [] };
        }
        if (sql.includes('FROM cart_item ci') && sql.includes('JOIN product')) {
          return { rows: [] }; // Empty cart after removal
        }
        return { rows: [] };
      });

      const result = await service.removeItem(userId, itemId);
      expect(result.items).toHaveLength(0);
      expect(result.costBreakdown.subtotal).toBe(0);
    });

    it('should throw when cart not found', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM cart WHERE user_id')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      await expect(service.removeItem(userId, itemId)).rejects.toMatchObject({
        code: ErrorCode.NotFound,
      });
    });

    it('should throw when item not found in cart', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM cart WHERE user_id')) {
          return { rows: [{ id: cartId, user_id: userId, created_at: new Date(), updated_at: new Date() }] };
        }
        if (sql.includes('FROM cart_item WHERE id') && sql.includes('cart_id')) {
          return { rows: [] }; // Item not found
        }
        return { rows: [] };
      });

      await expect(service.removeItem(userId, itemId)).rejects.toMatchObject({
        code: ErrorCode.NotFound,
      });
    });
  });

  describe('updateQuantity', () => {
    const userId = 'user-123';
    const cartId = 'cart-789';
    const itemId = 'item-1';
    const productId = 'product-456';

    beforeEach(() => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM cart WHERE user_id')) {
          return { rows: [{ id: cartId, user_id: userId, created_at: new Date(), updated_at: new Date() }] };
        }
        if (sql.includes('FROM cart_item ci WHERE ci.id')) {
          return { rows: [{ id: itemId, product_id: productId }] };
        }
        if (sql.includes('stock_quantity') && sql.includes('FROM product')) {
          return { rows: [{ stock_quantity: 20 }] };
        }
        if (sql.includes('UPDATE cart_item SET quantity')) {
          return { rows: [] };
        }
        if (sql.includes('UPDATE cart SET')) {
          return { rows: [] };
        }
        if (sql.includes('FROM cart_item ci') && sql.includes('JOIN product')) {
          return {
            rows: [{
              id: itemId,
              product_id: productId,
              quantity: 5,
              product_name: 'Test Product',
              unit_price: '10.00',
            }],
          };
        }
        return { rows: [] };
      });
    });

    it('should update quantity successfully', async () => {
      const result = await service.updateQuantity(userId, itemId, 5);
      expect(result.items[0].quantity).toBe(5);
    });

    it('should remove item when quantity is 0', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM cart WHERE user_id')) {
          return { rows: [{ id: cartId, user_id: userId, created_at: new Date(), updated_at: new Date() }] };
        }
        if (sql.includes('FROM cart_item WHERE id') && sql.includes('cart_id')) {
          return { rows: [{ id: itemId }] };
        }
        if (sql.includes('DELETE FROM cart_item')) {
          return { rows: [] };
        }
        if (sql.includes('UPDATE cart SET')) {
          return { rows: [] };
        }
        if (sql.includes('FROM cart_item ci') && sql.includes('JOIN product')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      const result = await service.updateQuantity(userId, itemId, 0);
      expect(result.items).toHaveLength(0);
    });

    it('should remove item when quantity is negative', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM cart WHERE user_id')) {
          return { rows: [{ id: cartId, user_id: userId, created_at: new Date(), updated_at: new Date() }] };
        }
        if (sql.includes('FROM cart_item WHERE id') && sql.includes('cart_id')) {
          return { rows: [{ id: itemId }] };
        }
        if (sql.includes('DELETE FROM cart_item')) {
          return { rows: [] };
        }
        if (sql.includes('UPDATE cart SET')) {
          return { rows: [] };
        }
        if (sql.includes('FROM cart_item ci') && sql.includes('JOIN product')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      const result = await service.updateQuantity(userId, itemId, -5);
      expect(result.items).toHaveLength(0);
    });

    it('should reject quantity above 99', async () => {
      await expect(service.updateQuantity(userId, itemId, 100)).rejects.toMatchObject({
        code: ErrorCode.ValidationError,
      });
    });

    it('should reject when quantity exceeds stock', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM cart WHERE user_id')) {
          return { rows: [{ id: cartId, user_id: userId, created_at: new Date(), updated_at: new Date() }] };
        }
        if (sql.includes('FROM cart_item ci WHERE ci.id')) {
          return { rows: [{ id: itemId, product_id: productId }] };
        }
        if (sql.includes('stock_quantity') && sql.includes('FROM product')) {
          return { rows: [{ stock_quantity: 3 }] };
        }
        return { rows: [] };
      });

      await expect(service.updateQuantity(userId, itemId, 5)).rejects.toMatchObject({
        code: ErrorCode.StockInsufficient,
      });
    });
  });

  describe('getCart', () => {
    const userId = 'user-123';
    const cartId = 'cart-789';

    it('should return cart from cache when available', async () => {
      const cachedCart = {
        id: cartId,
        userId,
        items: [],
        costBreakdown: { subtotal: 0, deliveryFee: 0, discount: 0, grandTotal: 0 },
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };
      mockRedisGet.mockResolvedValue(JSON.stringify(cachedCart));

      const result = await service.getCart(userId);
      expect(result).toEqual(cachedCart);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should return empty cart with zero totals', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM cart WHERE user_id')) {
          return { rows: [{ id: cartId, user_id: userId, created_at: new Date(), updated_at: new Date() }] };
        }
        if (sql.includes('FROM cart_item ci') && sql.includes('JOIN product')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      const result = await service.getCart(userId);
      expect(result.items).toHaveLength(0);
      expect(result.costBreakdown.subtotal).toBe(0);
      expect(result.costBreakdown.grandTotal).toBe(0);
    });

    it('should calculate correct subtotals for items', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM cart WHERE user_id')) {
          return { rows: [{ id: cartId, user_id: userId, created_at: new Date(), updated_at: new Date() }] };
        }
        if (sql.includes('FROM cart_item ci') && sql.includes('JOIN product')) {
          return {
            rows: [
              { id: 'item-1', product_id: 'p1', quantity: 3, product_name: 'Apples', unit_price: '2.50' },
              { id: 'item-2', product_id: 'p2', quantity: 1, product_name: 'Milk', unit_price: '4.99' },
            ],
          };
        }
        return { rows: [] };
      });

      const result = await service.getCart(userId);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].subtotal).toBe(7.50); // 2.50 * 3
      expect(result.items[1].subtotal).toBe(4.99); // 4.99 * 1
      expect(result.costBreakdown.subtotal).toBe(12.49); // 7.50 + 4.99
      expect(result.costBreakdown.grandTotal).toBe(12.49);
    });

    it('should create a cart if user has none', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM cart WHERE user_id')) {
          return { rows: [] }; // No existing cart
        }
        if (sql.includes('INSERT INTO cart')) {
          return { rows: [{ id: cartId, user_id: userId, created_at: new Date(), updated_at: new Date() }] };
        }
        if (sql.includes('FROM cart_item ci') && sql.includes('JOIN product')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      const result = await service.getCart(userId);
      expect(result.id).toBe(cartId);
      expect(result.items).toHaveLength(0);
    });
  });

  describe('Redis caching', () => {
    const userId = 'user-123';
    const cartId = 'cart-789';

    it('should cache cart after fetching from database', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM cart WHERE user_id')) {
          return { rows: [{ id: cartId, user_id: userId, created_at: new Date(), updated_at: new Date() }] };
        }
        if (sql.includes('FROM cart_item ci') && sql.includes('JOIN product')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      await service.getCart(userId);
      expect(mockRedisSet).toHaveBeenCalledWith(
        `cart:user:${userId}`,
        expect.any(String),
        'EX',
        300,
      );
    });

    it('should invalidate cache on addItem', async () => {
      const productId = 'product-456';
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM product WHERE id')) {
          return { rows: [{ id: productId, stock_quantity: 10, is_available: true }] };
        }
        if (sql.includes('FROM cart WHERE user_id')) {
          return { rows: [{ id: cartId, user_id: userId, created_at: new Date(), updated_at: new Date() }] };
        }
        if (sql.includes('FROM cart_item WHERE cart_id') && sql.includes('product_id')) {
          return { rows: [] };
        }
        if (sql.includes('COUNT(*)')) {
          return { rows: [{ count: '5' }] };
        }
        if (sql.includes('INSERT INTO cart_item')) {
          return { rows: [] };
        }
        if (sql.includes('UPDATE cart SET')) {
          return { rows: [] };
        }
        if (sql.includes('FROM cart_item ci') && sql.includes('JOIN product')) {
          return {
            rows: [{
              id: 'item-1',
              product_id: productId,
              quantity: 1,
              product_name: 'Test',
              unit_price: '5.00',
            }],
          };
        }
        return { rows: [] };
      });

      await service.addItem(userId, productId, 1);
      expect(mockRedisDel).toHaveBeenCalledWith(`cart:user:${userId}`);
    });
  });
});
