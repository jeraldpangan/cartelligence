import {
  CostCalculatorService,
  roundHalfUp,
  PromoCode,
} from './cost-calculator.service';
import { CartItem } from '@shared/interfaces';

// Mock database pool
const mockQuery = jest.fn();
const mockPool = {
  query: mockQuery,
} as any;

describe('CostCalculatorService', () => {
  let service: CostCalculatorService;

  beforeEach(() => {
    service = new CostCalculatorService(mockPool);
    mockQuery.mockReset();
  });

  describe('roundHalfUp', () => {
    it('rounds 2.345 to 2.35 (half-up)', () => {
      expect(roundHalfUp(2.345)).toBe(2.35);
    });

    it('rounds 2.344 to 2.34', () => {
      expect(roundHalfUp(2.344)).toBe(2.34);
    });

    it('rounds 0.005 to 0.01 (half-up)', () => {
      expect(roundHalfUp(0.005)).toBe(0.01);
    });

    it('rounds 1.555 to 1.56 (half-up)', () => {
      expect(roundHalfUp(1.555)).toBe(1.56);
    });

    it('rounds 0 to 0', () => {
      expect(roundHalfUp(0)).toBe(0);
    });

    it('rounds negative values correctly', () => {
      expect(roundHalfUp(-1.234)).toBe(-1.23);
    });
  });

  describe('calculateTotal', () => {
    it('returns all zeros for empty cart', async () => {
      const result = await service.calculateTotal([]);
      expect(result).toEqual({
        subtotal: 0.0,
        deliveryFee: 0.0,
        discount: 0.0,
        grandTotal: 0.0,
      });
    });

    it('returns all zeros for null items', async () => {
      const result = await service.calculateTotal(null as any);
      expect(result).toEqual({
        subtotal: 0.0,
        deliveryFee: 0.0,
        discount: 0.0,
        grandTotal: 0.0,
      });
    });

    it('computes subtotal as sum of round_half_up(price × qty) for each item', async () => {
      const items: CartItem[] = [
        {
          id: '1',
          productId: 'p1',
          productName: 'Apple',
          unitPrice: 10.33,
          quantity: 3,
          subtotal: 0,
        },
        {
          id: '2',
          productId: 'p2',
          productName: 'Banana',
          unitPrice: 5.67,
          quantity: 2,
          subtotal: 0,
        },
      ];

      const result = await service.calculateTotal(items);

      // Line 1: round_half_up(10.33 * 3) = round_half_up(30.99) = 30.99
      // Line 2: round_half_up(5.67 * 2) = round_half_up(11.34) = 11.34
      // Subtotal: 30.99 + 11.34 = 42.33
      expect(result.subtotal).toBe(42.33);
      expect(result.deliveryFee).toBe(50.0);
      expect(result.discount).toBe(0);
      // Grand total: 42.33 + 50 - 0 = 92.33
      expect(result.grandTotal).toBe(92.33);
    });

    it('applies round-half-up per line item', async () => {
      const items: CartItem[] = [
        {
          id: '1',
          productId: 'p1',
          productName: 'Item',
          unitPrice: 1.115,
          quantity: 1,
          subtotal: 0,
        },
      ];

      const result = await service.calculateTotal(items);

      // round_half_up(1.115 * 1) = 1.12 (half-up)
      expect(result.subtotal).toBe(1.12);
    });

    it('constrains subtotal to max 9,999,999.99', async () => {
      const items: CartItem[] = [
        {
          id: '1',
          productId: 'p1',
          productName: 'Expensive',
          unitPrice: 999999.99,
          quantity: 99,
          subtotal: 0,
        },
      ];

      const result = await service.calculateTotal(items);

      // 999999.99 * 99 = 98,999,999.01 which exceeds max
      expect(result.subtotal).toBe(9_999_999.99);
    });

    it('applies valid promo code discount', async () => {
      const items: CartItem[] = [
        {
          id: '1',
          productId: 'p1',
          productName: 'Item',
          unitPrice: 100.0,
          quantity: 2,
          subtotal: 0,
        },
      ];

      // Mock promo code query
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'promo1',
            code: 'SAVE10',
            discount_type: 'percentage',
            discount_value: '10',
            min_order_amount: '0',
            valid_from: new Date(Date.now() - 86400000).toISOString(),
            valid_until: new Date(Date.now() + 86400000).toISOString(),
            is_active: true,
          },
        ],
      });

      const result = await service.calculateTotal(items, 'SAVE10');

      // Subtotal: round_half_up(100 * 2) = 200
      // Discount: 10% of 200 = 20
      // Grand total: max(0, 200 + 50 - 20) = 230
      expect(result.subtotal).toBe(200.0);
      expect(result.deliveryFee).toBe(50.0);
      expect(result.discount).toBe(20.0);
      expect(result.grandTotal).toBe(230.0);
    });

    it('ignores invalid promo code', async () => {
      const items: CartItem[] = [
        {
          id: '1',
          productId: 'p1',
          productName: 'Item',
          unitPrice: 50.0,
          quantity: 1,
          subtotal: 0,
        },
      ];

      // Mock promo code not found
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.calculateTotal(items, 'INVALID');

      expect(result.discount).toBe(0);
      expect(result.grandTotal).toBe(100.0); // 50 + 50 delivery
    });
  });

  describe('applyDiscount', () => {
    it('computes grand_total = subtotal + deliveryFee - discount', () => {
      expect(service.applyDiscount(100, 50, 20)).toBe(130);
    });

    it('returns 0 when discount exceeds subtotal + deliveryFee', () => {
      expect(service.applyDiscount(100, 50, 200)).toBe(0);
    });

    it('returns 0 when discount equals subtotal + deliveryFee', () => {
      expect(service.applyDiscount(100, 50, 150)).toBe(0);
    });

    it('handles zero values', () => {
      expect(service.applyDiscount(0, 0, 0)).toBe(0);
    });

    it('handles decimal precision', () => {
      // 99.99 + 50.00 - 25.50 = 124.49
      expect(service.applyDiscount(99.99, 50.0, 25.5)).toBe(124.49);
    });

    it('never returns negative', () => {
      expect(service.applyDiscount(10, 5, 1000)).toBe(0);
    });
  });

  describe('formatCurrency', () => {
    it('formats with ₱ prefix and 2 decimal places', () => {
      expect(service.formatCurrency(1234.5)).toBe('₱1,234.50');
    });

    it('formats zero as ₱0.00', () => {
      expect(service.formatCurrency(0)).toBe('₱0.00');
    });

    it('formats with thousands separators', () => {
      expect(service.formatCurrency(1234567.89)).toBe('₱1,234,567.89');
    });

    it('rounds to 2 decimal places', () => {
      expect(service.formatCurrency(99.999)).toBe('₱100.00');
    });

    it('formats small amounts correctly', () => {
      expect(service.formatCurrency(0.5)).toBe('₱0.50');
    });

    it('formats exact amounts with trailing zeros', () => {
      expect(service.formatCurrency(100)).toBe('₱100.00');
    });

    it('formats the maximum value correctly', () => {
      expect(service.formatCurrency(9999999.99)).toBe('₱9,999,999.99');
    });
  });

  describe('validatePromoCode', () => {
    it('returns invalid for non-existent code', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.validatePromoCode('NOCODE', 100);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid promo code');
    });

    it('returns invalid for inactive code', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'promo1',
            code: 'OLD',
            discount_type: 'fixed_amount',
            discount_value: '50',
            min_order_amount: '0',
            valid_from: new Date(Date.now() - 86400000).toISOString(),
            valid_until: new Date(Date.now() + 86400000).toISOString(),
            is_active: false,
          },
        ],
      });

      const result = await service.validatePromoCode('OLD', 100);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Promo code is no longer active');
    });

    it('returns invalid for expired code', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'promo1',
            code: 'EXPIRED',
            discount_type: 'fixed_amount',
            discount_value: '50',
            min_order_amount: '0',
            valid_from: new Date(Date.now() - 172800000).toISOString(),
            valid_until: new Date(Date.now() - 86400000).toISOString(),
            is_active: true,
          },
        ],
      });

      const result = await service.validatePromoCode('EXPIRED', 100);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Promo code has expired');
    });

    it('returns invalid for code not yet valid', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'promo1',
            code: 'FUTURE',
            discount_type: 'fixed_amount',
            discount_value: '50',
            min_order_amount: '0',
            valid_from: new Date(Date.now() + 86400000).toISOString(),
            valid_until: new Date(Date.now() + 172800000).toISOString(),
            is_active: true,
          },
        ],
      });

      const result = await service.validatePromoCode('FUTURE', 100);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Promo code is not yet valid');
    });

    it('returns invalid when subtotal below minimum order amount', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'promo1',
            code: 'MINORDER',
            discount_type: 'fixed_amount',
            discount_value: '50',
            min_order_amount: '500',
            valid_from: new Date(Date.now() - 86400000).toISOString(),
            valid_until: new Date(Date.now() + 86400000).toISOString(),
            is_active: true,
          },
        ],
      });

      const result = await service.validatePromoCode('MINORDER', 100);

      expect(result.valid).toBe(false);
      expect(result.error).toBe(
        'Minimum order amount of ₱500.00 required',
      );
    });

    it('returns valid for a correct promo code', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'promo1',
            code: 'VALID',
            discount_type: 'percentage',
            discount_value: '15',
            min_order_amount: '0',
            valid_from: new Date(Date.now() - 86400000).toISOString(),
            valid_until: new Date(Date.now() + 86400000).toISOString(),
            is_active: true,
          },
        ],
      });

      const result = await service.validatePromoCode('VALID', 100);

      expect(result.valid).toBe(true);
      expect(result.promoCode).toBeDefined();
      expect(result.promoCode!.discountType).toBe('percentage');
      expect(result.promoCode!.discountValue).toBe(15);
    });

    it('handles database errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await service.validatePromoCode('CODE', 100);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Unable to validate promo code');
    });
  });
});
