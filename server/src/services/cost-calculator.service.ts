import { Pool } from 'pg';
import { getDatabasePool } from '../config/database';
import { CostBreakdown, CartItem } from '@shared/interfaces';
import { GRAND_TOTAL_MIN, GRAND_TOTAL_MAX } from '@shared/validation';

/** Default delivery fee in PHP */
const DEFAULT_DELIVERY_FEE = 50.0;

/**
 * Promo code discount types supported by the system.
 */
export type DiscountType = 'percentage' | 'fixed_amount';

/**
 * Promo code record from the database.
 */
export interface PromoCode {
  id: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  minOrderAmount: number;
  validFrom: Date;
  validUntil: Date;
  isActive: boolean;
}

/**
 * Result of promo code validation.
 */
export interface PromoValidationResult {
  valid: boolean;
  promoCode?: PromoCode;
  error?: string;
}

/**
 * Rounds a number to 2 decimal places using round-half-up.
 * JavaScript's Math.round uses round-half-to-even (banker's rounding) for .5 cases,
 * so we use a manual approach to ensure consistent round-half-up behavior.
 */
export function roundHalfUp(value: number): number {
  // Multiply by 100, add a small epsilon to handle floating point,
  // then use Math.round which rounds .5 up for positive numbers
  return Math.round(value * 100 + Number.EPSILON) / 100;
}

/**
 * Cost Calculator Service
 *
 * Computes cart subtotals, applies discounts and delivery fees,
 * and formats monetary values in Philippine Peso (PHP).
 * This is a pure calculation service that takes cart items and returns CostBreakdown.
 */
export class CostCalculatorService {
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool || getDatabasePool();
  }

  /**
   * Computes the full cost breakdown for a set of cart items.
   *
   * Subtotal = sum of round_half_up(unit_price × quantity, 2) for each item.
   * Subtotal is constrained to 0.00–9,999,999.99 PHP.
   * Grand total = max(0, subtotal + deliveryFee - discount).
   *
   * @param items - Array of cart items with unitPrice and quantity
   * @param promoCode - Optional promo code string to apply
   * @returns CostBreakdown with subtotal, deliveryFee, discount, and grandTotal
   */
  async calculateTotal(
    items: CartItem[],
    promoCode?: string,
  ): Promise<CostBreakdown> {
    // Empty cart returns all zeros
    if (!items || items.length === 0) {
      return {
        subtotal: 0.0,
        deliveryFee: 0.0,
        discount: 0.0,
        grandTotal: 0.0,
      };
    }

    // Compute subtotal: sum of round_half_up(unit_price × quantity) for each item
    let subtotal = 0;
    for (const item of items) {
      const lineTotal = roundHalfUp(item.unitPrice * item.quantity);
      subtotal += lineTotal;
    }

    // Round the final subtotal to 2 decimal places
    subtotal = roundHalfUp(subtotal);

    // Constrain subtotal to valid range
    subtotal = Math.max(GRAND_TOTAL_MIN, Math.min(GRAND_TOTAL_MAX, subtotal));

    const deliveryFee = DEFAULT_DELIVERY_FEE;

    // Determine discount from promo code
    let discount = 0;
    if (promoCode) {
      const validation = await this.validatePromoCode(promoCode, subtotal);
      if (validation.valid && validation.promoCode) {
        discount = this.computeDiscount(validation.promoCode, subtotal);
      }
    }

    const grandTotal = this.applyDiscount(subtotal, deliveryFee, discount);

    return {
      subtotal,
      deliveryFee,
      discount,
      grandTotal,
    };
  }

  /**
   * Computes the grand total given subtotal, delivery fee, and discount.
   * Formula: max(0, subtotal + deliveryFee - discount)
   *
   * @param subtotal - Cart subtotal in PHP
   * @param deliveryFee - Delivery fee in PHP
   * @param discount - Discount amount in PHP
   * @returns Grand total, never below 0.00
   */
  applyDiscount(
    subtotal: number,
    deliveryFee: number,
    discount: number,
  ): number {
    const result = subtotal + deliveryFee - discount;
    return roundHalfUp(Math.max(GRAND_TOTAL_MIN, result));
  }

  /**
   * Formats a monetary amount as Philippine Peso with the "₱" prefix
   * and exactly 2 decimal places, with thousands separators.
   *
   * Examples:
   *   formatCurrency(1234.5)  → "₱1,234.50"
   *   formatCurrency(0)       → "₱0.00"
   *   formatCurrency(99.999)  → "₱100.00"
   *
   * @param amount - Numeric amount to format
   * @returns Formatted currency string
   */
  formatCurrency(amount: number): string {
    // Round to 2 decimal places first
    const rounded = roundHalfUp(amount);

    // Format with exactly 2 decimal places and thousands separators
    const formatted = rounded.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    return `₱${formatted}`;
  }

  /**
   * Validates a promo code against the database.
   * Checks: existence, active status, date validity, and minimum order amount.
   *
   * @param code - The promo code string to validate
   * @param subtotal - Current cart subtotal for min order check
   * @returns Validation result with promo details or error message
   */
  async validatePromoCode(
    code: string,
    subtotal: number,
  ): Promise<PromoValidationResult> {
    try {
      const result = await this.pool.query(
        `SELECT id, code, discount_type, discount_value, min_order_amount,
                valid_from, valid_until, is_active
         FROM promo_code
         WHERE UPPER(code) = UPPER($1)`,
        [code],
      );

      if (result.rows.length === 0) {
        return { valid: false, error: 'Invalid promo code' };
      }

      const row = result.rows[0];
      const promoCode: PromoCode = {
        id: row.id,
        code: row.code,
        discountType: row.discount_type as DiscountType,
        discountValue: parseFloat(row.discount_value),
        minOrderAmount: parseFloat(row.min_order_amount),
        validFrom: new Date(row.valid_from),
        validUntil: new Date(row.valid_until),
        isActive: row.is_active,
      };

      // Check if promo code is active
      if (!promoCode.isActive) {
        return { valid: false, error: 'Promo code is no longer active' };
      }

      // Check date validity
      const now = new Date();
      if (now < promoCode.validFrom) {
        return { valid: false, error: 'Promo code is not yet valid' };
      }
      if (now > promoCode.validUntil) {
        return { valid: false, error: 'Promo code has expired' };
      }

      // Check minimum order amount
      if (subtotal < promoCode.minOrderAmount) {
        return {
          valid: false,
          error: `Minimum order amount of ₱${promoCode.minOrderAmount.toFixed(2)} required`,
        };
      }

      return { valid: true, promoCode };
    } catch {
      // Database error — treat as invalid promo code gracefully
      return { valid: false, error: 'Unable to validate promo code' };
    }
  }

  /**
   * Computes the discount amount based on the promo code type.
   * - percentage: (discountValue / 100) × subtotal, rounded to 2 decimals
   * - fixed_amount: discountValue directly
   *
   * @param promoCode - Validated promo code record
   * @param subtotal - Cart subtotal to apply percentage against
   * @returns Discount amount in PHP
   */
  private computeDiscount(promoCode: PromoCode, subtotal: number): number {
    if (promoCode.discountType === 'percentage') {
      return roundHalfUp((promoCode.discountValue / 100) * subtotal);
    }
    // fixed_amount
    return roundHalfUp(promoCode.discountValue);
  }
}
