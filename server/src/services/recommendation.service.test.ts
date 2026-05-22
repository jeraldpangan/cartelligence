import { RecommendationService } from './recommendation.service';
import { ProductCategory } from '@shared/enums';

// Mock database pool
const mockQuery = jest.fn();
const mockPool = {
  query: mockQuery,
} as any;

// Helper: create a mock product row as returned from the database
function createMockProductRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Test Product',
    category: ProductCategory.Produce,
    unit_price: '50.00',
    unit: 'kg',
    stock_quantity: 100,
    description: 'A test product',
    nutritional_info: 'Vitamins',
    is_available: true,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
    ...overrides,
  };
}

describe('RecommendationService', () => {
  let service: RecommendationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RecommendationService(mockPool);
  });

  describe('getPersonalized', () => {
    const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    it('should return empty array when user has no orders', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await service.getPersonalized(userId);

      expect(result.products).toEqual([]);
      expect(result.status).toBe('No previous orders found');
    });

    it('should return up to 10 personalized products for user with orders', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // order count
        .mockResolvedValueOnce({
          rows: [
            createMockProductRow({ id: 'p1', name: 'Product 1' }),
            createMockProductRow({ id: 'p2', name: 'Product 2' }),
          ],
        });

      const result = await service.getPersonalized(userId);

      expect(result.products).toHaveLength(2);
      expect(result.status).toBe('ok');
      expect(result.products![0].name).toBe('Product 1');
    });

    it('should query purchase_history ordered by purchase_count DESC with LIMIT 10', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.getPersonalized(userId);

      const purchaseQuery = mockQuery.mock.calls[1][0];
      expect(purchaseQuery).toContain('purchase_history');
      expect(purchaseQuery).toContain('purchase_count DESC');
      expect(purchaseQuery).toContain('LIMIT 10');
    });

    it('should exclude dismissed products', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.getPersonalized(userId);

      const purchaseQuery = mockQuery.mock.calls[1][0];
      expect(purchaseQuery).toContain('recommendation_dismissal');
      expect(purchaseQuery).toContain('expires_at > NOW()');
    });

    it('should return null products on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB connection failed'));

      const result = await service.getPersonalized(userId);

      expect(result.products).toBeNull();
      expect(result.status).toBe('Recommendation engine unavailable');
    });
  });

  describe('getCartBased', () => {
    it('should return empty array when cart has fewer than 3 items', async () => {
      const result = await service.getCartBased([
        { productId: 'p1' },
        { productId: 'p2' },
      ]);

      expect(result.products).toEqual([]);
      expect(result.status).toBe('Cart must contain at least 3 items');
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should return empty array when cart is empty', async () => {
      const result = await service.getCartBased([]);

      expect(result.products).toEqual([]);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should return empty array when cart is null/undefined', async () => {
      const result = await service.getCartBased(null as any);

      expect(result.products).toEqual([]);
    });

    it('should return up to 5 co-purchased products for cart with 3+ items', async () => {
      const cartItems = [
        { productId: 'p1' },
        { productId: 'p2' },
        { productId: 'p3' },
      ];

      mockQuery.mockResolvedValueOnce({
        rows: [
          createMockProductRow({ id: 'rec1', name: 'Recommended 1' }),
          createMockProductRow({ id: 'rec2', name: 'Recommended 2' }),
        ],
      });

      const result = await service.getCartBased(cartItems);

      expect(result.products).toHaveLength(2);
      expect(result.status).toBe('ok');
    });

    it('should exclude cart items from recommendations', async () => {
      const cartItems = [
        { productId: 'p1' },
        { productId: 'p2' },
        { productId: 'p3' },
      ];

      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.getCartBased(cartItems);

      const query = mockQuery.mock.calls[0][0];
      expect(query).toContain('product_id != ALL');
    });

    it('should limit results to 5', async () => {
      const cartItems = [
        { productId: 'p1' },
        { productId: 'p2' },
        { productId: 'p3' },
      ];

      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.getCartBased(cartItems);

      const query = mockQuery.mock.calls[0][0];
      expect(query).toContain('LIMIT 5');
    });

    it('should return null products on database error', async () => {
      const cartItems = [
        { productId: 'p1' },
        { productId: 'p2' },
        { productId: 'p3' },
      ];

      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const result = await service.getCartBased(cartItems);

      expect(result.products).toBeNull();
      expect(result.status).toBe('Recommendation engine unavailable');
    });
  });

  describe('getRelated', () => {
    const productId = '22222222-2222-2222-2222-222222222222';

    it('should return empty array when product not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.getRelated(productId);

      expect(result.products).toEqual([]);
      expect(result.status).toBe('Product not found');
    });

    it('should return up to 5 related products', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ category: ProductCategory.Dairy }] })
        .mockResolvedValueOnce({
          rows: [
            createMockProductRow({ id: 'r1', name: 'Related 1' }),
            createMockProductRow({ id: 'r2', name: 'Related 2' }),
          ],
        });

      const result = await service.getRelated(productId);

      expect(result.products).toHaveLength(2);
      expect(result.status).toBe('ok');
    });

    it('should use category affinity in the query', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ category: ProductCategory.Dairy }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.getRelated(productId);

      const relatedQuery = mockQuery.mock.calls[1][0];
      expect(relatedQuery).toContain('category');
      expect(relatedQuery).toContain('LIMIT 5');
    });

    it('should exclude the source product from results', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ category: ProductCategory.Produce }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.getRelated(productId);

      const relatedQuery = mockQuery.mock.calls[1][0];
      expect(relatedQuery).toContain('p.id != $1');
    });

    it('should return null products on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const result = await service.getRelated(productId);

      expect(result.products).toBeNull();
      expect(result.status).toBe('Recommendation engine unavailable');
    });
  });

  describe('getReorderReminders', () => {
    const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    it('should return empty array when user has fewer than 3 orders', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] });

      const result = await service.getReorderReminders(userId);

      expect(result.products).toEqual([]);
      expect(result.status).toBe('Requires at least 3 previous orders');
    });

    it('should find products in at least 2 of last 5 orders', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '5' }] }) // order count
        .mockResolvedValueOnce({
          rows: [
            { id: 'order1' },
            { id: 'order2' },
            { id: 'order3' },
            { id: 'order4' },
            { id: 'order5' },
          ],
        }) // last 5 orders
        .mockResolvedValueOnce({
          rows: [
            createMockProductRow({ id: 'reorder1', name: 'Reorder Product' }),
          ],
        }); // products in ≥2 orders

      const result = await service.getReorderReminders(userId);

      expect(result.products).toHaveLength(1);
      expect(result.status).toBe('ok');
    });

    it('should query for HAVING COUNT >= 2', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({
          rows: [{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }],
        })
        .mockResolvedValueOnce({ rows: [] });

      await service.getReorderReminders(userId);

      const reorderQuery = mockQuery.mock.calls[2][0];
      expect(reorderQuery).toContain('HAVING COUNT(DISTINCT oi.order_id) >= 2');
    });

    it('should exclude dismissed products', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({
          rows: [{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }],
        })
        .mockResolvedValueOnce({ rows: [] });

      await service.getReorderReminders(userId);

      const reorderQuery = mockQuery.mock.calls[2][0];
      expect(reorderQuery).toContain('recommendation_dismissal');
      expect(reorderQuery).toContain('expires_at > NOW()');
    });

    it('should return null products on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const result = await service.getReorderReminders(userId);

      expect(result.products).toBeNull();
      expect(result.status).toBe('Recommendation engine unavailable');
    });
  });

  describe('dismissRecommendation', () => {
    const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const productId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    it('should delete existing dismissal and insert new one with 30-day expiry', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await service.dismissRecommendation(userId, productId);

      // First call: DELETE existing
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM recommendation_dismissal'),
        [userId, productId],
      );

      // Second call: INSERT new with 30-day expiry
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '30 days'"),
        [userId, productId],
      );
    });

    it('should propagate errors from dismissRecommendation', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      await expect(
        service.dismissRecommendation(userId, productId),
      ).rejects.toThrow('DB error');
    });
  });

  describe('getFallback', () => {
    it('should return top 10 selling products', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          createMockProductRow({ id: 'top1', name: 'Top Seller 1' }),
          createMockProductRow({ id: 'top2', name: 'Top Seller 2' }),
        ],
      });

      const result = await service.getFallback();

      expect(result.products).toHaveLength(2);
      expect(result.status).toBe('ok');
    });

    it('should query by total purchase_count across all users', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.getFallback();

      const query = mockQuery.mock.calls[0][0];
      expect(query).toContain('purchase_history');
      expect(query).toContain('SUM(ph.purchase_count)');
      expect(query).toContain('LIMIT 10');
    });

    it('should only return available products', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.getFallback();

      const query = mockQuery.mock.calls[0][0];
      expect(query).toContain('is_available = true');
    });

    it('should return null products on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const result = await service.getFallback();

      expect(result.products).toBeNull();
      expect(result.status).toBe('Recommendation engine unavailable');
    });
  });
});
