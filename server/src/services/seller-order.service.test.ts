import { SellerOrderService, VALID_STATUS_TRANSITIONS, WsServer } from './seller-order.service';
import { OrderNotificationService } from './order-notification.service';
import { OrderStatus } from '@shared/enums';
import { ErrorCode } from '@shared/errors';

/**
 * Unit tests for SellerOrderService.
 * Tests paginated order listing, order detail retrieval, and order status updates
 * with ownership verification and state machine validation.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8
 */

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockPool() {
  return {
    query: jest.fn(),
    connect: jest.fn(),
  } as any;
}

function createMockNotificationService(): OrderNotificationService {
  return {
    notifyOrderStatus: jest.fn().mockResolvedValue(undefined),
    setupSocketHandlers: jest.fn(),
  } as unknown as OrderNotificationService;
}

// ─── Test Constants ───────────────────────────────────────────────────────────

const SELLER_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_SELLER_ID = '22222222-2222-2222-2222-222222222222';
const ORDER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BUYER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const MOCK_ORDER_ROW = {
  id: ORDER_ID,
  user_id: BUYER_ID,
  order_number: 'ORD-001',
  status: OrderStatus.Confirmed,
  subtotal: '100.00',
  delivery_fee: '50.00',
  discount: '0.00',
  grand_total: '150.00',
  delivery_address: '123 Main St',
  scheduled_delivery_start: new Date('2024-01-01T09:00:00Z'),
  scheduled_delivery_end: new Date('2024-01-01T11:00:00Z'),
  estimated_arrival: null,
  reschedule_count: 0,
  promo_code: null,
  created_at: new Date('2024-01-01T00:00:00Z'),
  updated_at: new Date('2024-01-01T00:00:00Z'),
};

const MOCK_ORDER_ITEM_ROW = {
  id: 'item-1111-1111-1111-111111111111',
  product_id: 'prod-1111-1111-1111-111111111111',
  product_name: 'Organic Bananas',
  quantity: 2,
  unit_price_at_purchase: '45.50',
  subtotal: '91.00',
};

// ─── VALID_STATUS_TRANSITIONS ─────────────────────────────────────────────────

describe('VALID_STATUS_TRANSITIONS', () => {
  it('should allow confirmed → being_prepared', () => {
    expect(VALID_STATUS_TRANSITIONS[OrderStatus.Confirmed]).toContain(OrderStatus.BeingPrepared);
  });

  it('should allow confirmed → cancelled', () => {
    expect(VALID_STATUS_TRANSITIONS[OrderStatus.Confirmed]).toContain(OrderStatus.Cancelled);
  });

  it('should allow being_prepared → out_for_delivery', () => {
    expect(VALID_STATUS_TRANSITIONS[OrderStatus.BeingPrepared]).toContain(OrderStatus.OutForDelivery);
  });

  it('should allow being_prepared → cancelled', () => {
    expect(VALID_STATUS_TRANSITIONS[OrderStatus.BeingPrepared]).toContain(OrderStatus.Cancelled);
  });

  it('should allow out_for_delivery → delivered', () => {
    expect(VALID_STATUS_TRANSITIONS[OrderStatus.OutForDelivery]).toContain(OrderStatus.Delivered);
  });

  it('should have no transitions from delivered (terminal state)', () => {
    expect(VALID_STATUS_TRANSITIONS[OrderStatus.Delivered]).toHaveLength(0);
  });

  it('should have no transitions from cancelled (terminal state)', () => {
    expect(VALID_STATUS_TRANSITIONS[OrderStatus.Cancelled]).toHaveLength(0);
  });

  it('should NOT allow confirmed → delivered (skipping states)', () => {
    expect(VALID_STATUS_TRANSITIONS[OrderStatus.Confirmed]).not.toContain(OrderStatus.Delivered);
  });

  it('should NOT allow out_for_delivery → cancelled', () => {
    expect(VALID_STATUS_TRANSITIONS[OrderStatus.OutForDelivery]).not.toContain(OrderStatus.Cancelled);
  });
});

// ─── SellerOrderService ───────────────────────────────────────────────────────

describe('SellerOrderService', () => {
  let pool: any;
  let notificationService: OrderNotificationService;
  let service: SellerOrderService;

  beforeEach(() => {
    pool = createMockPool();
    notificationService = createMockNotificationService();
    const mockSellerPerf = { recalculateSellerReliability: jest.fn().mockResolvedValue(undefined) };
    service = new SellerOrderService(pool, notificationService, mockSellerPerf as any);
  });

  // ─── getSellerOrders ────────────────────────────────────────────────────────

  describe('getSellerOrders', () => {
    it('should return paginated orders containing seller products', async () => {
      pool.query
        // Count query
        .mockResolvedValueOnce({ rows: [{ total: '2' }] })
        // Order IDs query
        .mockResolvedValueOnce({
          rows: [
            { id: ORDER_ID, created_at: new Date('2024-01-02') },
            { id: 'order-2222', created_at: new Date('2024-01-01') },
          ],
        })
        // fetchOrdersByIds: orders query
        .mockResolvedValueOnce({ rows: [MOCK_ORDER_ROW, { ...MOCK_ORDER_ROW, id: 'order-2222' }] })
        // fetchOrdersByIds: items for order 1
        .mockResolvedValueOnce({ rows: [MOCK_ORDER_ITEM_ROW] })
        // fetchOrdersByIds: items for order 2
        .mockResolvedValueOnce({ rows: [MOCK_ORDER_ITEM_ROW] });

      const result = await service.getSellerOrders(SELLER_ID, 1);

      expect(result.data).toHaveLength(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.totalItems).toBe(2);
      expect(result.totalPages).toBe(1);
    });

    it('should return empty data when seller has no orders', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.getSellerOrders(SELLER_ID, 1);

      expect(result.data).toHaveLength(0);
      expect(result.totalItems).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it('should default to page 1 for invalid page numbers', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.getSellerOrders(SELLER_ID, -5);

      expect(result.page).toBe(1);
    });

    it('should query only orders containing seller products (not other sellers)', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.getSellerOrders(SELLER_ID, 1);

      // Verify the count query filters by seller_id
      const countCall = pool.query.mock.calls[0];
      expect(countCall[0]).toContain('p.seller_id = $1');
      expect(countCall[1]).toEqual([SELLER_ID]);
    });

    it('should calculate correct pagination for multiple pages', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ total: '45' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.getSellerOrders(SELLER_ID, 2);

      expect(result.totalItems).toBe(45);
      expect(result.totalPages).toBe(3); // ceil(45/20) = 3
      expect(result.page).toBe(2);
    });

    it('should pass correct LIMIT and OFFSET for page 2', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ total: '25' }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.getSellerOrders(SELLER_ID, 2);

      const orderIdsCall = pool.query.mock.calls[1];
      // LIMIT=20, OFFSET=20 for page 2
      expect(orderIdsCall[1]).toEqual([SELLER_ID, 20, 20]);
    });
  });

  // ─── getOrderDetail ─────────────────────────────────────────────────────────

  describe('getOrderDetail', () => {
    it('should return full order detail for an order containing seller products', async () => {
      pool.query
        // Ownership check
        .mockResolvedValueOnce({ rows: [{ id: ORDER_ID }] })
        // fetchOrdersByIds: orders
        .mockResolvedValueOnce({ rows: [MOCK_ORDER_ROW] })
        // fetchOrdersByIds: items
        .mockResolvedValueOnce({ rows: [MOCK_ORDER_ITEM_ROW] });

      const result = await service.getOrderDetail(SELLER_ID, ORDER_ID);

      expect(result.id).toBe(ORDER_ID);
      expect(result.userId).toBe(BUYER_ID);
      expect(result.status).toBe(OrderStatus.Confirmed);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].productName).toBe('Organic Bananas');
    });

    it('should throw 404 when order does not exist', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      await expect(service.getOrderDetail(SELLER_ID, ORDER_ID)).rejects.toMatchObject({
        statusCode: 404,
        code: ErrorCode.NotFound,
      });
    });

    it('should throw 404 when order exists but contains only other sellers products', async () => {
      // Ownership check returns empty (order doesn't contain seller's products)
      pool.query.mockResolvedValueOnce({ rows: [] });

      await expect(service.getOrderDetail(SELLER_ID, ORDER_ID)).rejects.toMatchObject({
        statusCode: 404,
        code: ErrorCode.NotFound,
      });
    });

    it('should verify ownership using seller_id in the query', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      await expect(service.getOrderDetail(SELLER_ID, ORDER_ID)).rejects.toThrow();

      const ownershipCall = pool.query.mock.calls[0];
      expect(ownershipCall[0]).toContain('p.seller_id = $2');
      expect(ownershipCall[1]).toEqual([ORDER_ID, SELLER_ID]);
    });

    it('should map order fields correctly', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: ORDER_ID }] })
        .mockResolvedValueOnce({ rows: [MOCK_ORDER_ROW] })
        .mockResolvedValueOnce({ rows: [MOCK_ORDER_ITEM_ROW] });

      const result = await service.getOrderDetail(SELLER_ID, ORDER_ID);

      expect(result.orderNumber).toBe('ORD-001');
      expect(result.subtotal).toBe(100.00);
      expect(result.deliveryFee).toBe(50.00);
      expect(result.grandTotal).toBe(150.00);
      expect(result.deliveryAddress).toBe('123 Main St');
      expect(result.promoCode).toBeNull();
    });
  });

  // ─── updateOrderStatus ──────────────────────────────────────────────────────

  describe('updateOrderStatus', () => {
    function setupUpdateMocks(currentStatus: OrderStatus) {
      pool.query
        // Ownership check
        .mockResolvedValueOnce({
          rows: [{ id: ORDER_ID, status: currentStatus, user_id: BUYER_ID }],
        })
        // UPDATE query
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        // fetchOrdersByIds: orders
        .mockResolvedValueOnce({ rows: [{ ...MOCK_ORDER_ROW, status: currentStatus }] })
        // fetchOrdersByIds: items
        .mockResolvedValueOnce({ rows: [MOCK_ORDER_ITEM_ROW] });
    }

    it('should update status from confirmed to being_prepared', async () => {
      setupUpdateMocks(OrderStatus.Confirmed);

      const result = await service.updateOrderStatus(
        SELLER_ID,
        ORDER_ID,
        OrderStatus.BeingPrepared,
      );

      expect(result).toBeDefined();
      // Verify UPDATE query was called with new status
      const updateCall = pool.query.mock.calls[1];
      expect(updateCall[0]).toContain('UPDATE "order" SET status = $1');
      expect(updateCall[1]).toEqual([OrderStatus.BeingPrepared, ORDER_ID]);
    });

    it('should update status from confirmed to cancelled', async () => {
      setupUpdateMocks(OrderStatus.Confirmed);

      await service.updateOrderStatus(SELLER_ID, ORDER_ID, OrderStatus.Cancelled);

      const updateCall = pool.query.mock.calls[1];
      expect(updateCall[1][0]).toBe(OrderStatus.Cancelled);
    });

    it('should update status from being_prepared to out_for_delivery', async () => {
      setupUpdateMocks(OrderStatus.BeingPrepared);

      await service.updateOrderStatus(SELLER_ID, ORDER_ID, OrderStatus.OutForDelivery);

      const updateCall = pool.query.mock.calls[1];
      expect(updateCall[1][0]).toBe(OrderStatus.OutForDelivery);
    });

    it('should update status from out_for_delivery to delivered', async () => {
      setupUpdateMocks(OrderStatus.OutForDelivery);

      await service.updateOrderStatus(SELLER_ID, ORDER_ID, OrderStatus.Delivered);

      const updateCall = pool.query.mock.calls[1];
      expect(updateCall[1][0]).toBe(OrderStatus.Delivered);
    });

    it('should emit WebSocket event to buyer room on status update', async () => {
      setupUpdateMocks(OrderStatus.Confirmed);

      await service.updateOrderStatus(SELLER_ID, ORDER_ID, OrderStatus.BeingPrepared);

      expect(notificationService.notifyOrderStatus).toHaveBeenCalledWith(
        BUYER_ID,
        expect.objectContaining({
          orderId: ORDER_ID,
          status: OrderStatus.BeingPrepared,
          updatedAt: expect.any(String),
        }),
      );
    });

    it('should throw 403 when order does not contain seller products', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        service.updateOrderStatus(SELLER_ID, ORDER_ID, OrderStatus.BeingPrepared),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: ErrorCode.Forbidden,
      });
    });

    it('should throw 400 for invalid transition: confirmed → delivered', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: ORDER_ID, status: OrderStatus.Confirmed, user_id: BUYER_ID }],
      });

      await expect(
        service.updateOrderStatus(SELLER_ID, ORDER_ID, OrderStatus.Delivered),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: ErrorCode.ValidationError,
      });
    });

    it('should throw 400 for invalid transition: confirmed → out_for_delivery', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: ORDER_ID, status: OrderStatus.Confirmed, user_id: BUYER_ID }],
      });

      await expect(
        service.updateOrderStatus(SELLER_ID, ORDER_ID, OrderStatus.OutForDelivery),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: ErrorCode.ValidationError,
      });
    });

    it('should throw 400 when trying to transition from terminal state delivered', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: ORDER_ID, status: OrderStatus.Delivered, user_id: BUYER_ID }],
      });

      await expect(
        service.updateOrderStatus(SELLER_ID, ORDER_ID, OrderStatus.Cancelled),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: ErrorCode.ValidationError,
      });
    });

    it('should throw 400 when trying to transition from terminal state cancelled', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: ORDER_ID, status: OrderStatus.Cancelled, user_id: BUYER_ID }],
      });

      await expect(
        service.updateOrderStatus(SELLER_ID, ORDER_ID, OrderStatus.Confirmed),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: ErrorCode.ValidationError,
      });
    });

    it('should throw 400 for invalid transition: out_for_delivery → cancelled', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: ORDER_ID, status: OrderStatus.OutForDelivery, user_id: BUYER_ID }],
      });

      await expect(
        service.updateOrderStatus(SELLER_ID, ORDER_ID, OrderStatus.Cancelled),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: ErrorCode.ValidationError,
      });
    });

    it('should not emit WebSocket event when notificationService is null', async () => {
      const serviceWithoutWs = new SellerOrderService(pool, null);

      pool.query
        .mockResolvedValueOnce({
          rows: [{ id: ORDER_ID, status: OrderStatus.Confirmed, user_id: BUYER_ID }],
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [MOCK_ORDER_ROW] })
        .mockResolvedValueOnce({ rows: [MOCK_ORDER_ITEM_ROW] });

      // Should not throw even without notificationService
      await expect(
        serviceWithoutWs.updateOrderStatus(SELLER_ID, ORDER_ID, OrderStatus.BeingPrepared),
      ).resolves.toBeDefined();
    });

    it('should include error message with current and target status on invalid transition', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: ORDER_ID, status: OrderStatus.Confirmed, user_id: BUYER_ID }],
      });

      await expect(
        service.updateOrderStatus(SELLER_ID, ORDER_ID, OrderStatus.Delivered),
      ).rejects.toMatchObject({
        message: expect.stringContaining('confirmed'),
      });
    });
  });

  // ─── fetchOrdersByIds (via getOrderDetail) ──────────────────────────────────

  describe('order data mapping', () => {
    it('should correctly map order items with product names', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: ORDER_ID }] })
        .mockResolvedValueOnce({ rows: [MOCK_ORDER_ROW] })
        .mockResolvedValueOnce({
          rows: [
            MOCK_ORDER_ITEM_ROW,
            {
              id: 'item-2222',
              product_id: 'prod-2222',
              product_name: 'Fresh Milk',
              quantity: 1,
              unit_price_at_purchase: '80.00',
              subtotal: '80.00',
            },
          ],
        });

      const result = await service.getOrderDetail(SELLER_ID, ORDER_ID);

      expect(result.items).toHaveLength(2);
      expect(result.items[0].productName).toBe('Organic Bananas');
      expect(result.items[1].productName).toBe('Fresh Milk');
      expect(result.items[0].unitPriceAtPurchase).toBe(45.50);
      expect(result.items[1].subtotal).toBe(80.00);
    });

    it('should convert date fields to ISO strings', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: ORDER_ID }] })
        .mockResolvedValueOnce({ rows: [MOCK_ORDER_ROW] })
        .mockResolvedValueOnce({ rows: [MOCK_ORDER_ITEM_ROW] });

      const result = await service.getOrderDetail(SELLER_ID, ORDER_ID);

      expect(result.createdAt).toBe(new Date('2024-01-01T00:00:00Z').toISOString());
      expect(result.scheduledDeliveryStart).toBe(new Date('2024-01-01T09:00:00Z').toISOString());
      expect(result.scheduledDeliveryEnd).toBe(new Date('2024-01-01T11:00:00Z').toISOString());
      expect(result.estimatedArrival).toBeNull();
    });
  });
});
