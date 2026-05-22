"use strict";
/**
 * Shared validation schemas and rules for Cartelligence.
 * Used by both frontend (Angular reactive forms) and backend (validation middleware).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GRAND_TOTAL_MAX = exports.GRAND_TOTAL_MIN = exports.DELIVERY_SLOT_DAYS = exports.DELIVERY_SLOT_END_HOUR = exports.DELIVERY_SLOT_START_HOUR = exports.DELIVERY_SLOT_DURATION_HOURS = exports.RESCHEDULE_MIN_HOURS_BEFORE = exports.MAX_RESCHEDULES = exports.MAX_SLOT_BOOKINGS = exports.MAX_ACTIVE_ORDERS = exports.PRODUCTS_PER_PAGE = exports.PROMO_CODE_REGEX = exports.PROMO_CODE_MAX_LENGTH = exports.SEARCH_QUERY_MAX_LENGTH = exports.SEARCH_QUERY_MIN_LENGTH = exports.CART_MAX_ITEMS = exports.CART_QUANTITY_MAX = exports.CART_QUANTITY_MIN = exports.DELIVERY_ADDRESS_MAX_LENGTH = exports.DELIVERY_ADDRESS_MIN_LENGTH = exports.FULL_NAME_MAX_LENGTH = exports.FULL_NAME_MIN_LENGTH = exports.PASSWORD_SPECIAL_REGEX = exports.PASSWORD_DIGIT_REGEX = exports.PASSWORD_LOWERCASE_REGEX = exports.PASSWORD_UPPERCASE_REGEX = exports.PASSWORD_MAX_LENGTH = exports.PASSWORD_MIN_LENGTH = exports.EMAIL_REGEX = void 0;
exports.validateEmail = validateEmail;
exports.validatePassword = validatePassword;
exports.validateFullName = validateFullName;
exports.validateDeliveryAddress = validateDeliveryAddress;
exports.validateQuantity = validateQuantity;
exports.validateRegistration = validateRegistration;
/** Email validation: standard email format (RFC 5322 simplified) */
exports.EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
/**
 * Password validation: 8–64 chars, at least 1 uppercase, 1 lowercase, 1 digit, 1 special character.
 */
exports.PASSWORD_MIN_LENGTH = 8;
exports.PASSWORD_MAX_LENGTH = 64;
exports.PASSWORD_UPPERCASE_REGEX = /[A-Z]/;
exports.PASSWORD_LOWERCASE_REGEX = /[a-z]/;
exports.PASSWORD_DIGIT_REGEX = /\d/;
exports.PASSWORD_SPECIAL_REGEX = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/;
/** Full name constraints */
exports.FULL_NAME_MIN_LENGTH = 1;
exports.FULL_NAME_MAX_LENGTH = 100;
/** Delivery address constraints */
exports.DELIVERY_ADDRESS_MIN_LENGTH = 10;
exports.DELIVERY_ADDRESS_MAX_LENGTH = 250;
/** Cart quantity constraints */
exports.CART_QUANTITY_MIN = 1;
exports.CART_QUANTITY_MAX = 99;
/** Maximum distinct items in a cart */
exports.CART_MAX_ITEMS = 50;
/** Search query constraints */
exports.SEARCH_QUERY_MIN_LENGTH = 2;
exports.SEARCH_QUERY_MAX_LENGTH = 100;
/** Promo code constraints */
exports.PROMO_CODE_MAX_LENGTH = 20;
exports.PROMO_CODE_REGEX = /^[a-zA-Z0-9]+$/;
/** Products per page for pagination */
exports.PRODUCTS_PER_PAGE = 20;
/** Maximum active orders returned */
exports.MAX_ACTIVE_ORDERS = 20;
/** Maximum delivery slot bookings */
exports.MAX_SLOT_BOOKINGS = 20;
/** Maximum reschedules per order */
exports.MAX_RESCHEDULES = 2;
/** Minimum hours before delivery for reschedule */
exports.RESCHEDULE_MIN_HOURS_BEFORE = 2;
/** Delivery slot window duration in hours */
exports.DELIVERY_SLOT_DURATION_HOURS = 2;
/** Delivery slot earliest start hour (24h format) */
exports.DELIVERY_SLOT_START_HOUR = 8;
/** Delivery slot latest end hour (24h format) */
exports.DELIVERY_SLOT_END_HOUR = 21;
/** Number of days to show delivery slots for */
exports.DELIVERY_SLOT_DAYS = 3;
/** Grand total range */
exports.GRAND_TOTAL_MIN = 0;
exports.GRAND_TOTAL_MAX = 9999999.99;
/**
 * Validates an email address against the standard format.
 */
function validateEmail(email) {
    const errors = [];
    if (!email || !exports.EMAIL_REGEX.test(email)) {
        errors.push('Email must be a valid email address');
    }
    return { valid: errors.length === 0, errors };
}
/**
 * Validates a password against all strength requirements.
 */
function validatePassword(password) {
    const errors = [];
    if (!password || password.length < exports.PASSWORD_MIN_LENGTH) {
        errors.push(`Password must be at least ${exports.PASSWORD_MIN_LENGTH} characters`);
    }
    if (password && password.length > exports.PASSWORD_MAX_LENGTH) {
        errors.push(`Password must be at most ${exports.PASSWORD_MAX_LENGTH} characters`);
    }
    if (!exports.PASSWORD_UPPERCASE_REGEX.test(password || '')) {
        errors.push('Password must contain at least one uppercase letter');
    }
    if (!exports.PASSWORD_LOWERCASE_REGEX.test(password || '')) {
        errors.push('Password must contain at least one lowercase letter');
    }
    if (!exports.PASSWORD_DIGIT_REGEX.test(password || '')) {
        errors.push('Password must contain at least one digit');
    }
    if (!exports.PASSWORD_SPECIAL_REGEX.test(password || '')) {
        errors.push('Password must contain at least one special character');
    }
    return { valid: errors.length === 0, errors };
}
/**
 * Validates a full name against length constraints.
 */
function validateFullName(fullName) {
    const errors = [];
    const trimmed = (fullName || '').trim();
    if (trimmed.length < exports.FULL_NAME_MIN_LENGTH) {
        errors.push(`Full name must be at least ${exports.FULL_NAME_MIN_LENGTH} character`);
    }
    if (trimmed.length > exports.FULL_NAME_MAX_LENGTH) {
        errors.push(`Full name must be at most ${exports.FULL_NAME_MAX_LENGTH} characters`);
    }
    return { valid: errors.length === 0, errors };
}
/**
 * Validates a delivery address against length constraints.
 */
function validateDeliveryAddress(address) {
    const errors = [];
    if (!address || address.length < exports.DELIVERY_ADDRESS_MIN_LENGTH) {
        errors.push(`Delivery address must be at least ${exports.DELIVERY_ADDRESS_MIN_LENGTH} characters`);
    }
    if (address && address.length > exports.DELIVERY_ADDRESS_MAX_LENGTH) {
        errors.push(`Delivery address must be at most ${exports.DELIVERY_ADDRESS_MAX_LENGTH} characters`);
    }
    return { valid: errors.length === 0, errors };
}
/**
 * Validates a cart item quantity against allowed range.
 */
function validateQuantity(quantity) {
    const errors = [];
    if (!Number.isInteger(quantity)) {
        errors.push('Quantity must be a whole number');
    }
    if (quantity < exports.CART_QUANTITY_MIN) {
        errors.push(`Quantity must be at least ${exports.CART_QUANTITY_MIN}`);
    }
    if (quantity > exports.CART_QUANTITY_MAX) {
        errors.push(`Quantity must be at most ${exports.CART_QUANTITY_MAX}`);
    }
    return { valid: errors.length === 0, errors };
}
function validateRegistration(payload) {
    const emailResult = validateEmail(payload.email);
    const passwordResult = validatePassword(payload.password);
    const fullNameResult = validateFullName(payload.fullName);
    const addressResult = validateDeliveryAddress(payload.deliveryAddress);
    const fieldErrors = {};
    if (!emailResult.valid)
        fieldErrors.email = emailResult.errors;
    if (!passwordResult.valid)
        fieldErrors.password = passwordResult.errors;
    if (!fullNameResult.valid)
        fieldErrors.fullName = fullNameResult.errors;
    if (!addressResult.valid)
        fieldErrors.deliveryAddress = addressResult.errors;
    return {
        valid: Object.keys(fieldErrors).length === 0,
        fieldErrors,
    };
}
//# sourceMappingURL=validation.js.map