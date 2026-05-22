import { FakeReviewDetector, ReviewFeatures } from './fake-review-detector.service';

describe('FakeReviewDetector', () => {
  describe('detect (Static Forest Ensemble Evaluator)', () => {
    it('should classify a genuine review correctly', () => {
      const genuineFeatures: ReviewFeatures = {
        text: 'This organic spinach is incredibly fresh, well packaged, and taste absolutely delicious! Highly recommend to families.',
        hasImage: true,
        purchaseValidated: true,
        userReviewCount: 5,
        userAvgRating: 4.2,
        frequencyInLast24h: 1,
        rating: 5,
      };

      const result = FakeReviewDetector.detect(genuineFeatures);
      expect(result.isFake).toBe(false);
      expect(result.probability).toBeLessThan(0.5);
      expect(result.reason).toContain('Genuine review patterns');
    });

    it('should flag a review with unverified purchases and extreme caps/exclamations', () => {
      const spammyFeatures: ReviewFeatures = {
        text: 'AMAZING PRODUCT!!! GET FREE MONEY NOW AT SPAMMYLINK.COM!!! BEST EVER!!!',
        hasImage: false,
        purchaseValidated: false,
        userReviewCount: 1,
        userAvgRating: 5.0,
        frequencyInLast24h: 0,
        rating: 5,
      };

      const result = FakeReviewDetector.detect(spammyFeatures);
      expect(result.isFake).toBe(true);
      expect(result.probability).toBeGreaterThanOrEqual(0.5);
      expect(result.reason).toContain('Unverified purchase');
      expect(result.reason).toContain('Contains promotional or spam keywords');
      expect(result.reason).toContain('Highly suspicious text patterns (no verification photo)');
    });

    it('should flag reviews with extreme frequency in the last 24h combined with unverified purchases', () => {
      const highFreqFeatures: ReviewFeatures = {
        text: 'Decent product!!! Buy this now!!!',
        hasImage: false,
        purchaseValidated: false,
        userReviewCount: 15,
        userAvgRating: 5.0,
        frequencyInLast24h: 5,
        rating: 4,
      };

      const result = FakeReviewDetector.detect(highFreqFeatures);
      expect(result.isFake).toBe(true);
      expect(result.probability).toBeGreaterThanOrEqual(0.5);
      expect(result.reason).toContain('High frequency of reviews submitted in 24h');
    });

    it('should flag short perfect reviews lacking validation', () => {
      const shortPerfectFeatures: ReviewFeatures = {
        text: 'Good',
        hasImage: false,
        purchaseValidated: false,
        userReviewCount: 2,
        userAvgRating: 4.5,
        frequencyInLast24h: 0,
        rating: 5,
      };

      const result = FakeReviewDetector.detect(shortPerfectFeatures);
      expect(result.isFake).toBe(true);
      expect(result.reason).toContain('Generic short perfect rating');
    });
  });

  describe('evaluateReview (Contextual Live Integrator)', () => {
    const mockQuery = jest.fn();
    const mockPool = {
      query: mockQuery,
    } as any;

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should query order delivery status, review history, and 24h frequency correctly', async () => {
      // Mock order check (purchase validated)
      mockQuery.mockResolvedValueOnce({
        rows: [{ status: 'delivered' }],
      });
      // Mock history check
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '5', avg_rating: '4.2' }],
      });
      // Mock frequency check
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '1' }],
      });

      const result = await FakeReviewDetector.evaluateReview(
        mockPool,
        'user-uuid',
        'product-uuid',
        'This organic whole milk is quite rich and lasts well past its expiry date.',
        5,
        false
      );

      // Verify DB queries called
      expect(mockQuery).toHaveBeenCalledTimes(3);

      // Check the first query for order status check
      expect(mockQuery.mock.calls[0][0]).toContain('order');
      expect(mockQuery.mock.calls[0][1]).toEqual(['user-uuid', 'product-uuid']);

      // Check second query for user review count
      expect(mockQuery.mock.calls[1][0]).toContain('product_review');
      expect(mockQuery.mock.calls[1][1]).toEqual(['user-uuid']);

      // Check third query for 24h frequency
      expect(mockQuery.mock.calls[2][0]).toContain('INTERVAL \'24 hours\'');

      // Verify it ran detection and returned correct results
      expect(result.isFake).toBe(false);
    });

    it('should handle database errors gracefully and return secure default genuine', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection failure'));

      const result = await FakeReviewDetector.evaluateReview(
        mockPool,
        'user-uuid',
        'product-uuid',
        'Test review text.',
        5,
        false
      );

      expect(result.isFake).toBe(false);
      expect(result.probability).toBe(0.0);
      expect(result.reason[0]).toContain('Error gathering metrics');
    });
  });
});
