import { OrderService } from './order.service';
import { ErrorCode } from '@shared/errors';
import { OrderStatus } from '@shared/enums';
import { Cart, CartItem, CostBreakdown } from '@shared/interfaces';
import { PaymentDto } from '@shared/dtos';

// Mock database pool
const mockQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockPool = {
  query: mockQuery,
  connect: jest.fn().mockResolvedValue({
    query: mockClientQuery,
    release: mockClientRelease,
  }),
  end: jest.fn(),
} as any;

// Mock SmartCartService
const mockGetCart = jest.fn();
const mockCartService = {
  getCart: mockGetCart,
} as any;

// Mock CostCalculatorService
const mockCalculateTotal = jest.fn();
const mockCostCalculatorService = {
  calculateTotal: mockCalculateTotal,
} as any;

// Mock the database module
jest.mock('../config/database', () => ({
  getDatabasePool: () => mockPool,
}));

jest.mock('../config/redis', () => ({
  getRedisClient: () => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  }),
}));

describe('OrderService', () => {
  let service: OrderService;

  const userId = 'user-123';
  const cartId = 'cart-789';

  const sampleItems: CartItem[] = [
    { id: 'item-1', productId: 'prod-1', productName: 'Apples', unitPrice: 50.0, quantity: 3, subtotal: 150.0 },
    { id: 'item-2', productId: 'prod-2', productName: 'Milk', unitPrice: 85.5, quantity: 2, subtotal: 171.0 },
  ];

  const sampleCart: Cart = {
    id: cartId,
    userId,
    items: sampleItems,
    costBreakdown: { subtotal: 321.0, deliveryFee: 50.0, discount: 0, grandTotal: 371.0 },
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T10:00:00.000Z',
  };

  const sampleCostBreakdown: CostBreakdown = {
    subtotal: 321.0,
    deliveryFee: 50.0,
    discount: 0,
    grandTotal: 371.0,
  };

  const validPaymentDto: PaymentDto = {
    paymentMethod: 'credit_debit_card',
    paymentDetails: { cardNumber: '4111111111111111' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCart.mockResolvedValue(sampleCart);
    mockCalculateTotal.mockResolvedValue(sampleCostBreakdown);
    mockClientQuery.mockResolvedValue({ rows: [] });
    service = new OrderService(mockPool, mockCartService, mockCostCalculatorService);
  });

  describe('initiateCheckout', () => {
    beforeEach(() => {
      // Default: user exists with delivery address
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM user_profile')) {
          return { rows: [{ delivery_address: '123 Main St, Olongapo City' }] };
        }
        if (sql.includes('FROM product WHERE id')) {
          return { rows: [{ stock_quantity: 100, is_available: true }] };
        }
        return { rows: [] };
      });
    });

    it('should return checkout summary with items, totals, address, and payment options', async () => {
      const result = await service.initiateCheckout(userId);

      expect(result.items).toHaveLength(2);
      expect(result.items[0].productId).toBe('prod-1');
      expect(result.items[0].productName).toBe('Apples');
      expect(result.items[0].unitPrice).toBe(50.0);
      expect(result.items[0].quantity).toBe(3);
      expect(result.items[0].subtotal).toBe(150.0);
      expect(result.costBreakdown).toEqual(sampleCostBreakdown);
      expect(result.deliveryAddress).toBe('123 Main St, Olongapo City');
      expect(result.paymentOptions).toContain('credit_debit_card');
      expect(result.paymentOptions).toContain('digital_wallet');
    });

    it('should throw 400 error when cart is empty', async () => {
      mockGetCart.mockResolvedValue({
        ...sampleCart,
        items: [],
      });

      try {
        await service.initiateCheckout(userId);
        fail('Should have thrown');
      } catch (err: any) {
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe(ErrorCode.ValidationError);
        expect(err.message).toContain('empty cart');
      }
    });

    it('should throw 409 error when stock is insufficient for any item', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM user_profile')) {
          return { rows: [{ delivery_address: '123 Main St' }] };
        }
        if (sql.includes('FROM product WHERE id')) {
          // First product has insufficient stock
          return { rows: [{ stock_quantity: 1, is_available: true }] };
        }
        return { rows: [] };
      });

      try {
        await service.initiateCheckout(userId);
        fail('Should have thrown');
      } catch (err: any) {
        expect(err.statusCode).toBe(409);
        expect(err.code).toBe(ErrorCode.StockInsufficient);
        expect(err.details.length).toBeGreaterThan(0);
      }
    });

    it('should throw 409 when product is unavailable', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM user_profile')) {
          return { rows: [{ delivery_address: '123 Main St' }] };
        }
        if (sql.includes('FROM product WHERE id')) {
          return { rows: [{ stock_quantity: 10, is_available: false }] };
        }
        return { rows: [] };
      });

      try {
        await service.initiateCheckout(userId);
        fail('Should have thrown');
      } catch (err: any) {
        expect(err.statusCode).toBe(409);
        expect(err.code).toBe(ErrorCode.StockInsufficient);
      }
    });
  });

  describe('confirmOrder', () => {
    beforeEach(() => {
      // Default: stock is available, user exists
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM user_profile')) {
          return { rows: [{ delivery_address: '123 Main St, Olongapo City' }] };
        }
        if (sql.includes('FROM product WHERE id')) {
          return { rows: [{ stock_quantity: 100, is_available: true }] };
        }
        if (sql.includes('FROM cart WHERE user_id')) {
          return { rows: [{ id: cartId }] };
        }
        return { rows: [] };
      });

      // Mock transaction client
      mockClientQuery.mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO "order"')) {
          return { rows: [{ id: 'order-001', created_at: new Date('2024-01-15T10:00:00Z') }] };
        }
        if (sql.includes('SELECT id FROM cart')) {
          return { rows: [{ id: cartId }] };
        }
        return { rows: [] };
      });

      // Override Math.random to always succeed payment
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
    });

    afterEach(() => {
      jest.spyOn(Math, 'random').mockRestore();
    });

    it('should create order and return confirmation on successful payment', async () => {
      const result = await service.confirmOrder(userId, validPaymentDto);

      expect(result.orderId).toBe('order-001');
      expect(result.orderNumber).toMatch(/^CART-\d{8}-[A-Z0-9]{4}$/);
      expect(result.status).toBe(OrderStatus.Confirmed);
      expect(result.grandTotal).toBe(371.0);
      expect(result.deliveryAddress).toBe('123 Main St, Olongapo City');
    });

    it('should throw 400 error when cart is empty', async () => {
      mockGetCart.mockResolvedValue({ ...sampleCart, items: [] });

      try {
        await service.confirmOrder(userId, validPaymentDto);
        fail('Should have thrown');
      } catch (err: any) {
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe(ErrorCode.ValidationError);
      }
    });

    it('should throw 409 error when stock is insufficient', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM product WHERE id')) {
          return { rows: [{ stock_quantity: 1, is_available: true }] };
        }
        return { rows: [] };
      });

      try {
        await service.confirmOrder(userId, validPaymentDto);
        fail('Should have thrown');
      } catch (err: any) {
        expect(err.statusCode).toBe(409);
        expect(err.code).toBe(ErrorCode.StockInsufficient);
      }
    });

    it('should throw 402 error on payment failure with retry info', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.01); // Force payment failure

      try {
        await service.confirmOrder(userId, validPaymentDto, 0);
        fail('Should have thrown');
      } catch (err: any) {
        expect(err.statusCode).toBe(402);
        expect(err.code).toBe(ErrorCode.PaymentFailed);
        expect(err.message).toContain('2 retry attempt(s) remaining');
      }
    });

    it('should throw 402 error after max retries exhausted', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.01); // Force payment failure

      try {
        await service.confirmOrder(userId, validPaymentDto, 2); // 3rd attempt (0-indexed)
        fail('Should have thrown');
      } catch (err: any) {
        expect(err.statusCode).toBe(402);
        expect(err.code).toBe(ErrorCode.PaymentFailed);
        expect(err.message).toContain('3 attempts');
        expect(err.message).toContain('re-initiate checkout');
      }
    });

    it('should support digital_wallet payment method', async () => {
      const digitalWalletPayment: PaymentDto = {
        paymentMethod: 'digital_wallet',
        paymentDetails: { walletId: 'wallet-123' },
      };

      const result = await service.confirmOrder(userId, digitalWalletPayment);
      expect(result.orderId).toBe('order-001');
      expect(result.status).toBe(OrderStatus.Confirmed);
    });

    it('should rollback transaction on error', async () => {
      mockClientQuery.mockImplementation((sql: string) => {
        if (sql === 'BEGIN') return { rows: [] };
        if (sql.includes('INSERT INTO "order"')) {
          throw new Error('Database error');
        }
        if (sql === 'ROLLBACK') return { rows: [] };
        return { rows: [] };
      });

      await expect(service.confirmOrder(userId, validPaymentDto)).rejects.toThrow('Database error');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should clear cart items after successful order', async () => {
      await service.confirmOrder(userId, validPaymentDto);

      // Verify DELETE FROM cart_item was called in the transaction
      const deleteCall = mockClientQuery.mock.calls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('DELETE FROM cart_item'),
      );
      expect(deleteCall).toBeDefined();
    });

    it('should decrement stock for each ordered item', async () => {
      await service.confirmOrder(userId, validPaymentDto);

      // Verify stock decrement queries
      const stockCalls = mockClientQuery.mock.calls.filter(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('UPDATE product SET stock_quantity'),
      );
      expect(stockCalls).toHaveLength(2); // Two items in cart
    });
  });

  describe('getActiveOrders', () => {
    it('should return up to 20 active orders', async () => {
      mockQuery.mockImplementation((sql: string, params?: any[]) => {
        if (sql.includes('FROM "order"')) {
          return {
            rows: [
              {
                id: 'order-1',
                user_id: userId,
                order_number: 'CART-20240115-A3F2',
                status: OrderStatus.Confirmed,
                subtotal: '321.00',
                delivery_fee: '50.00',
                discount: '0.00',
                grand_total: '371.00',
                delivery_address: '123 Main St',
                scheduled_delivery_start: null,
                scheduled_delivery_end: null,
                estimated_arrival: null,
                reschedule_count: 0,
                promo_code: null,
                created_at: new Date('2024-01-15T10:00:00Z'),
                updated_at: new Date('2024-01-15T10:00:00Z'),
              },
            ],
          };
        }
        if (sql.includes('FROM order_item')) {
          return {
            rows: [
              {
                id: 'oi-1',
                product_id: 'prod-1',
                quantity: 3,
                unit_price_at_purchase: '50.00',
                subtotal: '150.00',
                product_name: 'Apples',
              },
            ],
          };
        }
        return { rows: [] };
      });

      const result = await service.getActiveOrders(userId);

      expect(result).toHaveLength(1);
      expect(result[0].orderNumber).toBe('CART-20240115-A3F2');
      expect(result[0].status).toBe(OrderStatus.Confirmed);
      expect(result[0].items).toHaveLength(1);
      expect(result[0].items[0].productName).toBe('Apples');
      expect(result[0].grandTotal).toBe(371.0);
    });

    it('should exclude delivered and cancelled orders', async () => {
      mockQuery.mockImplementation((sql: string, params?: any[]) => {
        if (sql.includes('FROM "order"')) {
          // Verify the query filters out delivered and cancelled
          expect(params).toContain(OrderStatus.Delivered);
          expect(params).toContain(OrderStatus.Cancelled);
          return { rows: [] };
        }
        return { rows: [] };
      });

      const result = await service.getActiveOrders(userId);
      expect(result).toHaveLength(0);
    });

    it('should return empty array when user has no active orders', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await service.getActiveOrders(userId);
      expect(result).toEqual([]);
    });

    it('should limit results to MAX_ACTIVE_ORDERS (20)', async () => {
      mockQuery.mockImplementation((sql: string, params?: any[]) => {
        if (sql.includes('FROM "order"')) {
          // Verify LIMIT parameter is 20
          expect(params).toContain(20);
          return { rows: [] };
        }
        return { rows: [] };
      });

      await service.getActiveOrders(userId);
    });
  });
});
