import { SellerPerformanceService } from './seller-performance.service';

describe('SellerPerformanceService', () => {
  let service: SellerPerformanceService;
  const mockQuery = jest.fn();
  const mockPool = {
    query: mockQuery,
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SellerPerformanceService(mockPool);
  });

  it('should compute neutral default values for new sellers with no activity', async () => {
    const sellerId = 'da54563a-bbbb-cccc-dddd-123456789012';

    // 1. Fulfillment query return empty / no orders
    mockQuery.mockImplementation((sql: string, params: any[]) => {
      if (sql.includes('"order" o')) {
        return Promise.resolve({ rows: [{ delivered: 0, cancelled: 0 }] });
      }
      if (sql.includes('product_review pr')) {
        return Promise.resolve({ rows: [{ avg_rating: null, review_count: 0 }] });
      }
      if (sql.includes('avg_completeness')) {
        return Promise.resolve({ rows: [{ total_listings: 0, avg_completeness: null }] });
      }
      if (sql.includes('UPDATE user_profile')) {
        return Promise.resolve({ rowCount: 1 });
      }
      return Promise.reject(new Error(`Unexpected query in test: ${sql}`));
    });

    await service.recalculateSellerReliability(sellerId);

    // Formula:
    // F_default = 0.5 (weight 0.4 -> 0.20)
    // R_default = 0.7 (weight 0.4 -> 0.28)
    // C_default = 0.5 (weight 0.2 -> 0.10)
    // Raw Blend = 0.20 + 0.28 + 0.10 = 0.58
    // Clamped = 1.0 + 4.0 * 0.58 = 3.32
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE user_profile'),
      [3.32, sellerId],
    );
  });

  it('should accurately calculate score for active seller with perfect record', async () => {
    const sellerId = 'da54563a-bbbb-cccc-dddd-123456789012';

    mockQuery.mockImplementation((sql: string, params: any[]) => {
      if (sql.includes('"order" o')) {
        return Promise.resolve({ rows: [{ delivered: 10, cancelled: 0 }] });
      }
      if (sql.includes('product_review pr')) {
        return Promise.resolve({ rows: [{ avg_rating: 5.0, review_count: 5 }] });
      }
      if (sql.includes('avg_completeness')) {
        return Promise.resolve({ rows: [{ total_listings: 3, avg_completeness: 1.0 }] });
      }
      if (sql.includes('UPDATE user_profile')) {
        return Promise.resolve({ rowCount: 1 });
      }
      return Promise.reject(new Error(`Unexpected query in test: ${sql}`));
    });

    await service.recalculateSellerReliability(sellerId);

    // Fulfillment = 10 / 10 = 1.0 (weight 0.4 -> 0.4)
    // Feedback = 5.0 / 5.0 = 1.0 (weight 0.4 -> 0.4)
    // Completeness = 1.0 (weight 0.2 -> 0.2)
    // Blend = 0.4 + 0.4 + 0.2 = 1.0
    // Clamped = 1.0 + 4.0 * 1.0 = 5.0
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE user_profile'),
      [5.0, sellerId],
    );
  });

  it('should clamp scores to minimum of 1.0 even with disastrous performance', async () => {
    const sellerId = 'da54563a-bbbb-cccc-dddd-123456789012';

    mockQuery.mockImplementation((sql: string, params: any[]) => {
      if (sql.includes('"order" o')) {
        return Promise.resolve({ rows: [{ delivered: 0, cancelled: 10 }] });
      }
      if (sql.includes('product_review pr')) {
        return Promise.resolve({ rows: [{ avg_rating: 1.0, review_count: 10 }] });
      }
      if (sql.includes('avg_completeness')) {
        return Promise.resolve({ rows: [{ total_listings: 5, avg_completeness: 0.0 }] });
      }
      if (sql.includes('UPDATE user_profile')) {
        return Promise.resolve({ rowCount: 1 });
      }
      return Promise.reject(new Error(`Unexpected query in test: ${sql}`));
    });

    await service.recalculateSellerReliability(sellerId);

    // Fulfillment = 0 / 10 = 0.0 (weight 0.4 -> 0.0)
    // Feedback = 1.0 / 5.0 = 0.2 (weight 0.4 -> 0.08)
    // Completeness = 0.0 (weight 0.2 -> 0.0)
    // Blend = 0.0 + 0.08 + 0.0 = 0.08
    // Score = 1.0 + 4.0 * 0.08 = 1.32
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE user_profile'),
      [1.32, sellerId],
    );
  });

  it('should fail gracefully and log error without throwing when pool query fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockQuery.mockRejectedValue(new Error('DB Connection Timeout'));

    await expect(
      service.recalculateSellerReliability('da54563a-bbbb-cccc-dddd-123456789012'),
    ).resolves.not.toThrow();

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
