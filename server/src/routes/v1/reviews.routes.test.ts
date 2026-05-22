import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { globalErrorHandler, AppError } from '../../middleware/errorHandler';
import { UserRole } from '@shared/enums';
import { ErrorCode } from '@shared/errors';

const TEST_JWT_SECRET = 'test-jwt-secret';

// ─── Mock ReviewService ───────────────────────────────────────────────────────

const mockCreateReview = jest.fn();
const mockGetProductReviews = jest.fn();
const mockGetProductReviewSummary = jest.fn();
const mockDeleteReview = jest.fn();

jest.mock('../../services/review.service', () => ({
  ReviewService: jest.fn().mockImplementation(() => ({
    createReview: mockCreateReview,
    getProductReviews: mockGetProductReviews,
    getProductReviewSummary: mockGetProductReviewSummary,
    deleteReview: mockDeleteReview,
  })),
}));

// Mock the database and redis modules to prevent actual connections
jest.mock('../../config/database', () => ({
  getDatabasePool: jest.fn(() => ({})),
}));
jest.mock('../../config/redis', () => ({
  getRedisClient: jest.fn(() => ({})),
}));

// Import routes after mocking
import reviewsRoutes from './reviews.routes';

// ─── Test App Setup ───────────────────────────────────────────────────────────

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/reviews', reviewsRoutes);
  app.use(globalErrorHandler);
  return app;
}

function generateBuyerToken(userId = 'buyer-uuid-1111'): string {
  return jwt.sign(
    { sub: userId, email: 'buyer@example.com', role: UserRole.Buyer, type: 'access' },
    TEST_JWT_SECRET,
    { expiresIn: '30m' },
  );
}

function generateSellerToken(userId = 'seller-uuid-2222'): string {
  return jwt.sign(
    { sub: userId, email: 'seller@example.com', role: UserRole.Seller, type: 'access' },
    TEST_JWT_SECRET,
    { expiresIn: '30m' },
  );
}

// ─── Test Constants ───────────────────────────────────────────────────────────

const BUYER_ID = 'buyer-uuid-1111';
const PRODUCT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const REVIEW_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

const MOCK_REVIEW = {
  id: REVIEW_ID,
  productId: PRODUCT_ID,
  userId: BUYER_ID,
  rating: 4,
  comment: 'Great product, very fresh and tasty!',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const MOCK_REVIEW_WITH_REVIEWER = {
  ...MOCK_REVIEW,
  reviewerName: 'John Doe',
};

const MOCK_SUMMARY = {
  averageRating: 4.2,
  totalReviews: 5,
  ratingDistribution: { 1: 0, 2: 0, 3: 1, 4: 2, 5: 2 },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = TEST_JWT_SECRET;
});

describe('Reviews Routes', () => {
  describe('POST /reviews', () => {
    it('should create a review and return 201 for authenticated buyer', async () => {
      mockCreateReview.mockResolvedValue(MOCK_REVIEW);

      const app = createTestApp();
      const res = await request(app)
        .post('/reviews')
        .set('Authorization', `Bearer ${generateBuyerToken()}`)
        .send({ productId: PRODUCT_ID, rating: 4, comment: 'Great product, very fresh and tasty!' });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        id: REVIEW_ID,
        productId: PRODUCT_ID,
        rating: 4,
      });
      expect(mockCreateReview).toHaveBeenCalledWith(BUYER_ID, {
        productId: PRODUCT_ID,
        rating: 4,
        comment: 'Great product, very fresh and tasty!',
      });
    });

    it('should return 401 when no token is provided', async () => {
      const app = createTestApp();
      const res = await request(app)
        .post('/reviews')
        .send({ productId: PRODUCT_ID, rating: 4, comment: 'Great product!' });

      expect(res.status).toBe(401);
    });

    it('should return 403 when seller tries to submit a review', async () => {
      const app = createTestApp();
      const res = await request(app)
        .post('/reviews')
        .set('Authorization', `Bearer ${generateSellerToken()}`)
        .send({ productId: PRODUCT_ID, rating: 4, comment: 'Great product!' });

      expect(res.status).toBe(403);
    });

    it('should return 403 when buyer has not purchased the product', async () => {
      mockCreateReview.mockRejectedValue(
        new AppError(403, ErrorCode.Forbidden, 'You can only review products you have purchased and received'),
      );

      const app = createTestApp();
      const res = await request(app)
        .post('/reviews')
        .set('Authorization', `Bearer ${generateBuyerToken()}`)
        .send({ productId: PRODUCT_ID, rating: 4, comment: 'Great product, very fresh and tasty!' });

      expect(res.status).toBe(403);
    });

    it('should return 409 for duplicate review', async () => {
      mockCreateReview.mockRejectedValue(
        new AppError(409, ErrorCode.Conflict, 'You have already reviewed this product'),
      );

      const app = createTestApp();
      const res = await request(app)
        .post('/reviews')
        .set('Authorization', `Bearer ${generateBuyerToken()}`)
        .send({ productId: PRODUCT_ID, rating: 4, comment: 'Great product, very fresh and tasty!' });

      expect(res.status).toBe(409);
    });

    it('should return 404 when product does not exist', async () => {
      mockCreateReview.mockRejectedValue(
        new AppError(404, ErrorCode.NotFound, 'Product not found'),
      );

      const app = createTestApp();
      const res = await request(app)
        .post('/reviews')
        .set('Authorization', `Bearer ${generateBuyerToken()}`)
        .send({ productId: PRODUCT_ID, rating: 4, comment: 'Great product, very fresh and tasty!' });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /reviews/product/:productId', () => {
    it('should return paginated reviews for a product (public)', async () => {
      const mockResult = {
        data: [MOCK_REVIEW_WITH_REVIEWER],
        page: 1,
        pageSize: 10,
        totalItems: 1,
        totalPages: 1,
      };
      mockGetProductReviews.mockResolvedValue(mockResult);

      const app = createTestApp();
      const res = await request(app).get(`/reviews/product/${PRODUCT_ID}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.page).toBe(1);
      expect(mockGetProductReviews).toHaveBeenCalledWith(PRODUCT_ID, 1);
    });

    it('should pass page query param to service', async () => {
      const mockResult = {
        data: [],
        page: 2,
        pageSize: 10,
        totalItems: 15,
        totalPages: 2,
      };
      mockGetProductReviews.mockResolvedValue(mockResult);

      const app = createTestApp();
      await request(app).get(`/reviews/product/${PRODUCT_ID}?page=2`);

      expect(mockGetProductReviews).toHaveBeenCalledWith(PRODUCT_ID, 2);
    });

    it('should return 400 for invalid productId format', async () => {
      const app = createTestApp();
      const res = await request(app).get('/reviews/product/not-a-valid-uuid');

      expect(res.status).toBe(400);
    });

    it('should return 404 when product not found', async () => {
      mockGetProductReviews.mockRejectedValue(
        new AppError(404, ErrorCode.NotFound, 'Product not found'),
      );

      const app = createTestApp();
      const res = await request(app).get(`/reviews/product/${PRODUCT_ID}`);

      expect(res.status).toBe(404);
    });

    it('should be accessible without authentication', async () => {
      mockGetProductReviews.mockResolvedValue({
        data: [],
        page: 1,
        pageSize: 10,
        totalItems: 0,
        totalPages: 0,
      });

      const app = createTestApp();
      // No Authorization header
      const res = await request(app).get(`/reviews/product/${PRODUCT_ID}`);

      expect(res.status).toBe(200);
    });
  });

  describe('GET /reviews/product/:productId/summary', () => {
    it('should return review summary for a product (public)', async () => {
      mockGetProductReviewSummary.mockResolvedValue(MOCK_SUMMARY);

      const app = createTestApp();
      const res = await request(app).get(`/reviews/product/${PRODUCT_ID}/summary`);

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        averageRating: 4.2,
        totalReviews: 5,
        ratingDistribution: { 1: 0, 2: 0, 3: 1, 4: 2, 5: 2 },
      });
      expect(mockGetProductReviewSummary).toHaveBeenCalledWith(PRODUCT_ID);
    });

    it('should return 400 for invalid productId format', async () => {
      const app = createTestApp();
      const res = await request(app).get('/reviews/product/not-a-valid-uuid/summary');

      expect(res.status).toBe(400);
    });

    it('should return 404 when product not found', async () => {
      mockGetProductReviewSummary.mockRejectedValue(
        new AppError(404, ErrorCode.NotFound, 'Product not found'),
      );

      const app = createTestApp();
      const res = await request(app).get(`/reviews/product/${PRODUCT_ID}/summary`);

      expect(res.status).toBe(404);
    });

    it('should be accessible without authentication', async () => {
      mockGetProductReviewSummary.mockResolvedValue(MOCK_SUMMARY);

      const app = createTestApp();
      // No Authorization header
      const res = await request(app).get(`/reviews/product/${PRODUCT_ID}/summary`);

      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /reviews/:id', () => {
    it('should delete a review and return 204 for authenticated buyer', async () => {
      mockDeleteReview.mockResolvedValue(undefined);

      const app = createTestApp();
      const res = await request(app)
        .delete(`/reviews/${REVIEW_ID}`)
        .set('Authorization', `Bearer ${generateBuyerToken()}`);

      expect(res.status).toBe(204);
      expect(mockDeleteReview).toHaveBeenCalledWith(BUYER_ID, REVIEW_ID);
    });

    it('should return 401 when no token is provided', async () => {
      const app = createTestApp();
      const res = await request(app).delete(`/reviews/${REVIEW_ID}`);

      expect(res.status).toBe(401);
    });

    it('should return 403 when seller tries to delete a review', async () => {
      const app = createTestApp();
      const res = await request(app)
        .delete(`/reviews/${REVIEW_ID}`)
        .set('Authorization', `Bearer ${generateSellerToken()}`);

      expect(res.status).toBe(403);
    });

    it('should return 400 for invalid review id format', async () => {
      const app = createTestApp();
      const res = await request(app)
        .delete('/reviews/not-a-valid-uuid')
        .set('Authorization', `Bearer ${generateBuyerToken()}`);

      expect(res.status).toBe(400);
    });

    it('should return 404 when review not found', async () => {
      mockDeleteReview.mockRejectedValue(
        new AppError(404, ErrorCode.NotFound, 'Review not found'),
      );

      const app = createTestApp();
      const res = await request(app)
        .delete(`/reviews/${REVIEW_ID}`)
        .set('Authorization', `Bearer ${generateBuyerToken()}`);

      expect(res.status).toBe(404);
    });

    it('should return 403 when buyer tries to delete another user\'s review', async () => {
      mockDeleteReview.mockRejectedValue(
        new AppError(403, ErrorCode.Forbidden, 'You can only delete your own reviews'),
      );

      const app = createTestApp();
      const res = await request(app)
        .delete(`/reviews/${REVIEW_ID}`)
        .set('Authorization', `Bearer ${generateBuyerToken()}`);

      expect(res.status).toBe(403);
    });
  });
});
