/**
 * Shared validation schemas and rules for Cartelligence.
 * Used by both frontend (Angular reactive forms) and backend (validation middleware).
 */
/** Email validation: standard email format (RFC 5322 simplified) */
export declare const EMAIL_REGEX: RegExp;
/**
 * Password validation: 8–64 chars, at least 1 uppercase, 1 lowercase, 1 digit, 1 special character.
 */
export declare const PASSWORD_MIN_LENGTH = 8;
export declare const PASSWORD_MAX_LENGTH = 64;
export declare const PASSWORD_UPPERCASE_REGEX: RegExp;
export declare const PASSWORD_LOWERCASE_REGEX: RegExp;
export declare const PASSWORD_DIGIT_REGEX: RegExp;
export declare const PASSWORD_SPECIAL_REGEX: RegExp;
/** Full name constraints */
export declare const FULL_NAME_MIN_LENGTH = 1;
export declare const FULL_NAME_MAX_LENGTH = 100;
/** Delivery address constraints */
export declare const DELIVERY_ADDRESS_MIN_LENGTH = 10;
export declare const DELIVERY_ADDRESS_MAX_LENGTH = 250;
/** Cart quantity constraints */
export declare const CART_QUANTITY_MIN = 1;
export declare const CART_QUANTITY_MAX = 99;
/** Maximum distinct items in a cart */
export declare const CART_MAX_ITEMS = 50;
/** Search query constraints */
export declare const SEARCH_QUERY_MIN_LENGTH = 2;
export declare const SEARCH_QUERY_MAX_LENGTH = 100;
/** Promo code constraints */
export declare const PROMO_CODE_MAX_LENGTH = 20;
export declare const PROMO_CODE_REGEX: RegExp;
/** Products per page for pagination */
export declare const PRODUCTS_PER_PAGE = 20;
/** Maximum active orders returned */
export declare const MAX_ACTIVE_ORDERS = 20;
/** Maximum delivery slot bookings */
export declare const MAX_SLOT_BOOKINGS = 20;
/** Maximum reschedules per order */
export declare const MAX_RESCHEDULES = 2;
/** Minimum hours before delivery for reschedule */
export declare const RESCHEDULE_MIN_HOURS_BEFORE = 2;
/** Delivery slot window duration in hours */
export declare const DELIVERY_SLOT_DURATION_HOURS = 2;
/** Delivery slot earliest start hour (24h format) */
export declare const DELIVERY_SLOT_START_HOUR = 8;
/** Delivery slot latest end hour (24h format) */
export declare const DELIVERY_SLOT_END_HOUR = 21;
/** Number of days to show delivery slots for */
export declare const DELIVERY_SLOT_DAYS = 3;
/** Grand total range */
export declare const GRAND_TOTAL_MIN = 0;
export declare const GRAND_TOTAL_MAX = 9999999.99;
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
export declare function validateEmail(email: string): FieldValidationResult;
/**
 * Validates a password against all strength requirements.
 */
export declare function validatePassword(password: string): FieldValidationResult;
/**
 * Validates a full name against length constraints.
 */
export declare function validateFullName(fullName: string): FieldValidationResult;
/**
 * Validates a delivery address against length constraints.
 */
export declare function validateDeliveryAddress(address: string): FieldValidationResult;
/**
 * Validates a cart item quantity against allowed range.
 */
export declare function validateQuantity(quantity: number): FieldValidationResult;
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
export declare function validateRegistration(payload: {
    email: string;
    password: string;
    fullName: string;
    deliveryAddress: string;
}): RegistrationValidationResult;
//# sourceMappingURL=validation.d.ts.map