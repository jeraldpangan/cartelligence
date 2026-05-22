/**
 * Data Transfer Objects for API request/response payloads.
 */

/**
 * Registration request payload.
 */
export interface RegisterDto {
  email: string;
  password: string;
  fullName: string;
  deliveryAddress: string;
  role?: 'buyer' | 'seller';
}

/**
 * Login request payload.
 */
export interface LoginDto {
  email: string;
  password: string;
}

/**
 * Add item to cart request payload.
 */
export interface CartItemDto {
  productId: string;
  quantity: number;
}

/**
 * Update cart item quantity request payload.
 */
export interface UpdateQuantityDto {
  quantity: number;
}

/**
 * Payment details for order confirmation.
 */
export interface PaymentDto {
  paymentMethod: 'credit_debit_card' | 'digital_wallet';
  paymentDetails: Record<string, string>;
}

/**
 * Checkout request payload with selected delivery slot.
 */
export interface CheckoutDto {
  deliverySlotId: string;
}

/**
 * Reschedule delivery request payload.
 */
export interface RescheduleDto {
  newSlotId: string;
}
