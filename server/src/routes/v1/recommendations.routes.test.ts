import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';

// Mock dependencies
const mockGetPersonalized = jest.fn();
const mockGetCartBased = jest.fn();
const mockGetRelated = jest.fn();
const mockDismissRecommendation = jest.fn();
const mockGetFallback = jest.fn();
const mockGetCart = jest.fn();

jest.mock('../../services/recommendation.service', () => ({
  RecommendationService: jest.fn().mockImplementation(() => ({
    getPersonalized: mockGetPersonalized,
    getCartBased: mockGetCartBased,
    getRelated: mockGetRelated,
    dismissRecommendation: mockDismissRecommendation,
    getFallback: mockGetFallback,
  })),
}));

jest.mock('../../services/cart.service', () => ({
  SmartCartService: jest.fn().mockImplementation(() => ({
    getCart: mockGetCart,
  })),
}));

jest.mock('../../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { sub: 'test-user-id', email: 'test@example.com', type: 'access' };
    next();
  },
}));

import recommendationsRoutes from './recommendations.routes';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/recommendations', recommendationsRoutes);

  // Error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    res.status(err.statusCode || 500).json({ error: { message: err.message } });
  });

  return app;
}

describe('Recommendations API Routes', () => {
  let app: express.Application;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/recommendations/personalized', () => {
    it('should return personalized recommendations', async () => {
      const products = [
        { id: 'p1', name: 'Apple', unitPrice: 50.0 },
        { id: 'p2', name: 'Banana', unitPrice: 30.0 },
      ];
      mockGetPersonalized.mockResolvedValue({ products, status: 'ok' });

      const res = await request(app)
        .get('/api/v1/recommendations/personalized')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.data.products).toEqual(products);
      expect(res.body.data.status).toBe('ok');
    });

    it('should return fallback when user has no orders', async () => {
      const fallbackProducts = [{ id: 'p3', name: 'Popular Item' }];
      mockGetPersonalized.mockResolvedValue({
        products: [],
        status: 'No previous orders found',
      });
      mockGetFallback.mockResolvedValue({ products: fallbackProducts, status: 'ok' });

      const res = await request(app)
        .get('/api/v1/recommendations/personalized')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.data.products).toEqual(fallbackProducts);
      expect(res.body.data.status).toBe('fallback');
    });

    it('should return unavailable when engine is down and fallback also fails', async () => {
      mockGetPersonalized.mockResolvedValue({
        products: null,
        status: 'Recommendation engine unavailable',
      });
      mockGetFallback.mockResolvedValue({
        products: null,
        status: 'Recommendation engine unavailable',
      });

      const res = await request(app)
        .get('/api/v1/recommendations/personalized')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.data.products).toBeNull();
      expect(res.body.data.recommendations_status).toBe('unavailable');
    });

    it('should return fallback products when engine is down but fallback works', async () => {
      const fallbackProducts = [{ id: 'p4', name: 'Top Seller' }];
      mockGetPersonalized.mockResolvedValue({
        products: null,
        status: 'Recommendation engine unavailable',
      });
      mockGetFallback.mockResolvedValue({ products: fallbackProducts, status: 'ok' });

      const res = await request(app)
        .get('/api/v1/recommendations/personalized')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.data.products).toEqual(fallbackProducts);
      expect(res.body.data.status).toBe('fallback');
    });
  });

  describe('GET /api/v1/recommendations/cart-based', () => {
    it('should return cart-based recommendations when cart has 3+ items', async () => {
      const cartItems = [
        { id: 'ci1', productId: 'p1', productName: 'Apple', unitPrice: 50, quantity: 1, subtotal: 50 },
        { id: 'ci2', productId: 'p2', productName: 'Banana', unitPrice: 30, quantity: 2, subtotal: 60 },
        { id: 'ci3', productId: 'p3', productName: 'Milk', unitPrice: 80, quantity: 1, subtotal: 80 },
      ];
      mockGetCart.mockResolvedValue({
        id: 'cart-1',
        userId: 'test-user-id',
        items: cartItems,
        costBreakdown: { subtotal: 190, deliveryFee: 0, discount: 0, grandTotal: 190 },
      });

      const suggestions = [{ id: 'p4', name: 'Bread' }];
      mockGetCartBased.mockResolvedValue({ products: suggestions, status: 'ok' });

      const res = await request(app)
        .get('/api/v1/recommendations/cart-based')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.data.products).toEqual(suggestions);
      expect(res.body.data.status).toBe('ok');
      expect(mockGetCartBased).toHaveBeenCalledWith([
        { productId: 'p1' },
        { productId: 'p2' },
        { productId: 'p3' },
      ]);
    });

    it('should return empty when cart has fewer than 3 items', async () => {
      const cartItems = [
        { id: 'ci1', productId: 'p1', productName: 'Apple', unitPrice: 50, quantity: 1, subtotal: 50 },
      ];
      mockGetCart.mockResolvedValue({
        id: 'cart-1',
        userId: 'test-user-id',
        items: cartItems,
        costBreakdown: { subtotal: 50, deliveryFee: 0, discount: 0, grandTotal: 50 },
      });
      mockGetCartBased.mockResolvedValue({
        products: [],
        status: 'Cart must contain at least 3 items',
      });

      const res = await request(app)
        .get('/api/v1/recommendations/cart-based')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.data.products).toEqual([]);
    });

    it('should return unavailable when engine is down', async () => {
      mockGetCart.mockResolvedValue({
        id: 'cart-1',
        userId: 'test-user-id',
        items: [
          { id: 'ci1', productId: 'p1', productName: 'A', unitPrice: 10, quantity: 1, subtotal: 10 },
          { id: 'ci2', productId: 'p2', productName: 'B', unitPrice: 10, quantity: 1, subtotal: 10 },
          { id: 'ci3', productId: 'p3', productName: 'C', unitPrice: 10, quantity: 1, subtotal: 10 },
        ],
        costBreakdown: { subtotal: 30, deliveryFee: 0, discount: 0, grandTotal: 30 },
      });
      mockGetCartBased.mockResolvedValue({
        products: null,
        status: 'Recommendation engine unavailable',
      });

      const res = await request(app)
        .get('/api/v1/recommendations/cart-based')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.data.products).toBeNull();
      expect(res.body.data.recommendations_status).toBe('unavailable');
    });
  });

  describe('GET /api/v1/recommendations/product/:id/related', () => {
    it('should return related products', async () => {
      const relatedProducts = [
        { id: 'p2', name: 'Green Apple' },
        { id: 'p3', name: 'Pear' },
      ];
      mockGetRelated.mockResolvedValue({ products: relatedProducts, status: 'ok' });

      const res = await request(app)
        .get('/api/v1/recommendations/product/p1/related')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.data.products).toEqual(relatedProducts);
      expect(res.body.data.status).toBe('ok');
      expect(mockGetRelated).toHaveBeenCalledWith('p1');
    });

    it('should return unavailable when engine is down', async () => {
      mockGetRelated.mockResolvedValue({
        products: null,
        status: 'Recommendation engine unavailable',
      });

      const res = await request(app)
        .get('/api/v1/recommendations/product/p1/related')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.data.products).toBeNull();
      expect(res.body.data.recommendations_status).toBe('unavailable');
    });

    it('should return empty array when product not found', async () => {
      mockGetRelated.mockResolvedValue({ products: [], status: 'Product not found' });

      const res = await request(app)
        .get('/api/v1/recommendations/product/nonexistent/related')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.data.products).toEqual([]);
    });
  });

  describe('POST /api/v1/recommendations/dismiss/:productId', () => {
    it('should dismiss a recommendation successfully', async () => {
      mockDismissRecommendation.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/v1/recommendations/dismiss/product-123')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.data.message).toBe('Recommendation dismissed successfully');
      expect(mockDismissRecommendation).toHaveBeenCalledWith('test-user-id', 'product-123');
    });

    it('should handle errors from dismiss service', async () => {
      const error = new Error('Database error');
      (error as any).statusCode = 500;
      mockDismissRecommendation.mockRejectedValue(error);

      const res = await request(app)
        .post('/api/v1/recommendations/dismiss/product-123')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(500);
    });
  });
});
