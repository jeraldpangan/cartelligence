import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { globalErrorHandler, AppError } from '../../middleware/errorHandler';
import { OrderStatus, UserRole } from '@shared/enums';
import { ErrorCode } from '@shared/errors';

const TEST_JWT_SECRET = 'test-jwt-secret';

// ─── Mock SellerOrderService ──────────────────────────────────────────────────

const mockGetSellerOrders = jest.fn();
const mockGetOrderDetail = jest.fn();
const mockUpdateOrderStatus = jest.fn();

jest.mock('../../services/seller-order.service', () => ({
  SellerOrderService: jest.fn().mockImplementation(() => ({
    getSellerOrders: mockGetSellerOrders,
    getOrderDetail: mockGetOrderDetail,
    updateOrderStatus: mockUpdateOrderStatus,
  })),
}));

// Mock the database module to prevent actual DB connections
jest.mock('../../config/database', () => ({
  getDatabasePool: jest.fn(() => ({})),
}));

// Import routes after mocking
import sellerOrdersRoutes from './seller-orders.routes';

// ─── Test App Setup ───────────────────────────────────────────────────────────

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/seller/orders', sellerOrdersRoutes);
  app.use(globalErrorHandler);
  return app;
}

function generateSellerToken(userId = 'seller-uuid-1111'): string {
  return jwt.sign(
    { sub: userId, email: 'seller@example.com', role: UserRole.Seller, type: 'access' },
    TEST_JWT_SECRET,
    { expiresIn: '30m' },
  );
}

function generateBuyerToken(userId = 'buyer-uuid-2222'): string {
  return jwt.sign(
    { sub: userId, email: 'buyer@example.com', role: UserRole.Buyer, type: 'access' },
    TEST_JWT_SECRET,
    { expiresIn: '30m' },
  );
}

// ─── Test Constants ───────────────────────────────────────────────────────────

const SELLER_ID = 'seller-uuid-1111';
const ORDER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const MOCK_ORDER = {
  id: ORDER_ID,
  userId: 'buyer-uuid-2222',
  orderNumber: 'ORD-001',
  status: OrderStatus.Confirmed,
  items: [
    {
      id: 'item-1111-1111-1111-111111111111',
      productId: 'prod-1111-1111-1111-111111111111',
      productName: 'Organic Bananas',
      quantity: 2,
      unitPriceAtPurchase: 45.50,
      subtotal: 91.00,
    },
  ],
  subtotal: 91.00,
  deliveryFee: 50.00,
  discount: 0,
  grandTotal: 141.00,
  deliveryAddress: '123 Main St',
  scheduledDeliveryStart: '2024-01-01T09:00:00.000Z',
  scheduledDeliveryEnd: '2024-01-01T11:00:00.000Z',
  estimatedArrival: null,
  rescheduleCount: 0,
  promoCode: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const MOCK_PAGINATED_RESPONSE = {
  data: [MOCK_ORDER],
  page: 1,
  pageSize: 20,
  totalItems: 1,
  totalPages: 1,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Seller Orders Routes', () => {
  let app: express.Application;

  beforeAll(() => {
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    app = createTestApp();
  });

  afterAll(() => {
    delete process.env.JWT_SECRET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Authentication & Authorization ────────────────────────────────────────

  describe('Authentication & Authorization', () => {
    it('should return 401 when no token is provided', async () => {
      const res = await request(app).get('/seller/orders');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when token is invalid', async () => {
      const res = await request(app)
        .get('/seller/orders')
        .set('Authorization', 'Bearer invalid-token');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 403 when authenticated as buyer (not seller)', async () => {
      const buyerToken = generateBuyerToken();
      const res = await request(app)
        .get('/seller/orders')
        .set('Authorization', `Bearer ${buyerToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should allow access when authenticated as seller', async () => {
      mockGetSellerOrders.mockResolvedValue(MOCK_PAGINATED_RESPONSE);
      const sellerToken = generateSellerToken();
      const res = await request(app)
        .get('/seller/orders')
        .set('Authorization', `Bearer ${sellerToken}`);
      expect(res.status).toBe(200);
    });
  });

  // ─── GET /seller/orders ─────────────────────────────────────────────────────

  describe('GET /seller/orders', () => {
    it('should return 200 with paginated orders', async () => {
      mockGetSellerOrders.mockResolvedValue(MOCK_PAGINATED_RESPONSE);
      const token = generateSellerToken();

      const res = await request(app)
        .get('/seller/orders')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.page).toBe(1);
      expect(res.body.pageSize).toBe(20);
      expect(res.body.totalItems).toBe(1);
      expect(res.body.totalPages).toBe(1);
    });

    it('should pass page query param to service', async () => {
      mockGetSellerOrders.mockResolvedValue({ ...MOCK_PAGINATED_RESPONSE, page: 2 });
      const token = generateSellerToken();

      await request(app)
        .get('/seller/orders?page=2')
        .set('Authorization', `Bearer ${token}`);

      expect(mockGetSellerOrders).toHaveBeenCalledWith(SELLER_ID, 2);
    });

    it('should default to page 1 when page param is missing', async () => {
      mockGetSellerOrders.mockResolvedValue(MOCK_PAGINATED_RESPONSE);
      const token = generateSellerToken();

      await request(app)
        .get('/seller/orders')
        .set('Authorization', `Bearer ${token}`);

      expect(mockGetSellerOrders).toHaveBeenCalledWith(SELLER_ID, 1);
    });

    it('should default to page 1 when page param is invalid', async () => {
      mockGetSellerOrders.mockResolvedValue(MOCK_PAGINATED_RESPONSE);
      const token = generateSellerToken();

      await request(app)
        .get('/seller/orders?page=abc')
        .set('Authorization', `Bearer ${token}`);

      expect(mockGetSellerOrders).toHaveBeenCalledWith(SELLER_ID, 1);
    });

    it('should return 200 with empty data when seller has no orders', async () => {
      mockGetSellerOrders.mockResolvedValue({
        data: [],
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
      });
      const token = generateSellerToken();

      const res = await request(app)
        .get('/seller/orders')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });

  // ─── GET /seller/orders/:id ─────────────────────────────────────────────────

  describe('GET /seller/orders/:id', () => {
    it('should return 200 with order detail', async () => {
      mockGetOrderDetail.mockResolvedValue(MOCK_ORDER);
      const token = generateSellerToken();

      const res = await request(app)
        .get(`/seller/orders/${ORDER_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(ORDER_ID);
      expect(res.body.data.status).toBe(OrderStatus.Confirmed);
      expect(res.body.data.items).toHaveLength(1);
    });

    it('should call service with correct sellerId and orderId', async () => {
      mockGetOrderDetail.mockResolvedValue(MOCK_ORDER);
      const token = generateSellerToken(SELLER_ID);

      await request(app)
        .get(`/seller/orders/${ORDER_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(mockGetOrderDetail).toHaveBeenCalledWith(SELLER_ID, ORDER_ID);
    });

    it('should return 400 for invalid UUID format', async () => {
      const token = generateSellerToken();

      const res = await request(app)
        .get('/seller/orders/not-a-uuid')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 404 when order is not found', async () => {
      mockGetOrderDetail.mockRejectedValue(
        new AppError(404, ErrorCode.NotFound, 'Order not found'),
      );
      const token = generateSellerToken();

      const res = await request(app)
        .get(`/seller/orders/${ORDER_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  // ─── PATCH /seller/orders/:id/status ───────────────────────────────────────

  describe('PATCH /seller/orders/:id/status', () => {
    it('should return 200 with updated order on valid status transition', async () => {
      const updatedOrder = { ...MOCK_ORDER, status: OrderStatus.BeingPrepared };
      mockUpdateOrderStatus.mockResolvedValue(updatedOrder);
      const token = generateSellerToken();

      const res = await request(app)
        .patch(`/seller/orders/${ORDER_ID}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: OrderStatus.BeingPrepared });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(OrderStatus.BeingPrepared);
    });

    it('should call service with correct sellerId, orderId, and newStatus', async () => {
      const updatedOrder = { ...MOCK_ORDER, status: OrderStatus.BeingPrepared };
      mockUpdateOrderStatus.mockResolvedValue(updatedOrder);
      const token = generateSellerToken(SELLER_ID);

      await request(app)
        .patch(`/seller/orders/${ORDER_ID}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: OrderStatus.BeingPrepared });

      expect(mockUpdateOrderStatus).toHaveBeenCalledWith(
        SELLER_ID,
        ORDER_ID,
        OrderStatus.BeingPrepared,
      );
    });

    it('should return 400 when status field is missing', async () => {
      const token = generateSellerToken();

      const res = await request(app)
        .patch(`/seller/orders/${ORDER_ID}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when status value is invalid', async () => {
      const token = generateSellerToken();

      const res = await request(app)
        .patch(`/seller/orders/${ORDER_ID}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'invalid_status' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid UUID format in :id', async () => {
      const token = generateSellerToken();

      const res = await request(app)
        .patch('/seller/orders/not-a-uuid/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: OrderStatus.BeingPrepared });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid status transition (service throws 400)', async () => {
      mockUpdateOrderStatus.mockRejectedValue(
        new AppError(400, ErrorCode.ValidationError, "Cannot transition from 'confirmed' to 'delivered'"),
      );
      const token = generateSellerToken();

      const res = await request(app)
        .patch(`/seller/orders/${ORDER_ID}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: OrderStatus.Delivered });

      expect(res.status).toBe(400);
    });

    it('should return 403 when order does not belong to seller (service throws 403)', async () => {
      mockUpdateOrderStatus.mockRejectedValue(
        new AppError(403, ErrorCode.Forbidden, 'Order not found or does not contain your products'),
      );
      const token = generateSellerToken();

      const res = await request(app)
        .patch(`/seller/orders/${ORDER_ID}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: OrderStatus.BeingPrepared });

      expect(res.status).toBe(403);
    });

    it('should accept all valid OrderStatus values', async () => {
      const validStatuses = [
        OrderStatus.BeingPrepared,
        OrderStatus.OutForDelivery,
        OrderStatus.Delivered,
        OrderStatus.Cancelled,
      ];

      for (const status of validStatuses) {
        mockUpdateOrderStatus.mockResolvedValue({ ...MOCK_ORDER, status });
        const token = generateSellerToken();

        const res = await request(app)
          .patch(`/seller/orders/${ORDER_ID}/status`)
          .set('Authorization', `Bearer ${token}`)
          .send({ status });

        expect(res.status).toBe(200);
      }
    });
  });
});
