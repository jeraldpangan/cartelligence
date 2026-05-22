/**
 * Shared validation schemas and rules for Cartelligence.
 * Used by both frontend (Angular reactive forms) and backend (validation middleware).
 */

/** Email validation: standard email format (RFC 5322 simplified) */
export const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/**
 * Password validation: 8–64 chars, at least 1 uppercase, 1 lowercase, 1 digit, 1 special character.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;
export const PASSWORD_UPPERCASE_REGEX = /[A-Z]/;
export const PASSWORD_LOWERCASE_REGEX = /[a-z]/;
export const PASSWORD_DIGIT_REGEX = /\d/;
export const PASSWORD_SPECIAL_REGEX = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/;

/** Full name constraints */
export const FULL_NAME_MIN_LENGTH = 1;
export const FULL_NAME_MAX_LENGTH = 100;

/** Delivery address constraints */
export const DELIVERY_ADDRESS_MIN_LENGTH = 10;
export const DELIVERY_ADDRESS_MAX_LENGTH = 250;

/** Cart quantity constraints */
export const CART_QUANTITY_MIN = 1;
export const CART_QUANTITY_MAX = 99;

/** Maximum distinct items in a cart */
export const CART_MAX_ITEMS = 50;

/** Search query constraints */
export const SEARCH_QUERY_MIN_LENGTH = 2;
export const SEARCH_QUERY_MAX_LENGTH = 100;

/** Promo code constraints */
export const PROMO_CODE_MAX_LENGTH = 20;
export const PROMO_CODE_REGEX = /^[a-zA-Z0-9]+$/;

/** Products per page for pagination */
export const PRODUCTS_PER_PAGE = 20;

/** Maximum active orders returned */
export const MAX_ACTIVE_ORDERS = 20;

/** Maximum delivery slot bookings */
export const MAX_SLOT_BOOKINGS = 20;

/** Maximum reschedules per order */
export const MAX_RESCHEDULES = 2;

/** Minimum hours before delivery for reschedule */
export const RESCHEDULE_MIN_HOURS_BEFORE = 2;

/** Delivery slot window duration in hours */
export const DELIVERY_SLOT_DURATION_HOURS = 2;

/** Delivery slot earliest start hour (24h format) */
export const DELIVERY_SLOT_START_HOUR = 8;

/** Delivery slot latest end hour (24h format) */
export const DELIVERY_SLOT_END_HOUR = 21;

/** Number of days to show delivery slots for */
export const DELIVERY_SLOT_DAYS = 3;

/** Grand total range */
export const GRAND_TOTAL_MIN = 0;
export const GRAND_TOTAL_MAX = 9_999_999.99;

/**
 * Validation result for a single field.
 */
export interface FieldValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates an email address against the standard format.
 */
export function validateEmail(email: string): FieldValidationResult {
  const errors: string[] = [];
  if (!email || !EMAIL_REGEX.test(email)) {
    errors.push('Email must be a valid email address');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validates a password against all strength requirements.
 */
export function validatePassword(password: string): FieldValidationResult {
  const errors: string[] = [];
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (password && password.length > PASSWORD_MAX_LENGTH) {
    errors.push(`Password must be at most ${PASSWORD_MAX_LENGTH} characters`);
  }
  if (!PASSWORD_UPPERCASE_REGEX.test(password || '')) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!PASSWORD_LOWERCASE_REGEX.test(password || '')) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!PASSWORD_DIGIT_REGEX.test(password || '')) {
    errors.push('Password must contain at least one digit');
  }
  if (!PASSWORD_SPECIAL_REGEX.test(password || '')) {
    errors.push('Password must contain at least one special character');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validates a full name against length constraints.
 */
export function validateFullName(fullName: string): FieldValidationResult {
  const errors: string[] = [];
  const trimmed = (fullName || '').trim();
  if (trimmed.length < FULL_NAME_MIN_LENGTH) {
    errors.push(`Full name must be at least ${FULL_NAME_MIN_LENGTH} character`);
  }
  if (trimmed.length > FULL_NAME_MAX_LENGTH) {
    errors.push(`Full name must be at most ${FULL_NAME_MAX_LENGTH} characters`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validates a delivery address against length constraints.
 */
export function validateDeliveryAddress(
  address: string,
): FieldValidationResult {
  const errors: string[] = [];
  if (!address || address.length < DELIVERY_ADDRESS_MIN_LENGTH) {
    errors.push(
      `Delivery address must be at least ${DELIVERY_ADDRESS_MIN_LENGTH} characters`,
    );
  }
  if (address && address.length > DELIVERY_ADDRESS_MAX_LENGTH) {
    errors.push(
      `Delivery address must be at most ${DELIVERY_ADDRESS_MAX_LENGTH} characters`,
    );
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validates a cart item quantity against allowed range.
 */
export function validateQuantity(quantity: number): FieldValidationResult {
  const errors: string[] = [];
  if (!Number.isInteger(quantity)) {
    errors.push('Quantity must be a whole number');
  }
  if (quantity < CART_QUANTITY_MIN) {
    errors.push(`Quantity must be at least ${CART_QUANTITY_MIN}`);
  }
  if (quantity > CART_QUANTITY_MAX) {
    errors.push(`Quantity must be at most ${CART_QUANTITY_MAX}`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validates a complete registration payload and returns all field errors.
 */
export interface RegistrationValidationResult {
  valid: boolean;
  fieldErrors: {
    email?: string[];
    password?: string[];
    fullName?: string[];
    deliveryAddress?: string[];
  };
}

export function validateRegistration(payload: {
  email: string;
  password: string;
  fullName: string;
  deliveryAddress: string;
}): RegistrationValidationResult {
  const emailResult = validateEmail(payload.email);
  const passwordResult = validatePassword(payload.password);
  const fullNameResult = validateFullName(payload.fullName);
  const addressResult = validateDeliveryAddress(payload.deliveryAddress);

  const fieldErrors: RegistrationValidationResult['fieldErrors'] = {};

  if (!emailResult.valid) fieldErrors.email = emailResult.errors;
  if (!passwordResult.valid) fieldErrors.password = passwordResult.errors;
  if (!fullNameResult.valid) fieldErrors.fullName = fullNameResult.errors;
  if (!addressResult.valid) fieldErrors.deliveryAddress = addressResult.errors;

  return {
    valid: Object.keys(fieldErrors).length === 0,
    fieldErrors,
  };
}
