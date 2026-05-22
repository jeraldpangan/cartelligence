import { Request, Response, NextFunction } from 'express';
import {
  validateEmail,
  validatePassword,
  validateFullName,
  validateDeliveryAddress,
  validateQuantity,
  FieldValidationResult,
} from '@shared/validation';
import { AppError } from './errorHandler';
import { ErrorCode, ErrorDetail } from '@shared/errors';

/**
 * Schema definition for request validation.
 * Maps field names to validation functions.
 */
export interface ValidationSchema {
  [field: string]: (value: unknown) => FieldValidationResult;
}

/**
 * Creates a validation middleware from a schema definition.
 * Validates request body fields against the provided schema.
 * Returns 400 with field-level error details on validation failure.
 */
export function validateBody(schema: ValidationSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const errors: ErrorDetail[] = [];

    for (const [field, validator] of Object.entries(schema)) {
      const value = req.body[field];
      const result = validator(value);

      if (!result.valid) {
        for (const message of result.errors) {
          errors.push({ field, message });
        }
      }
    }

    if (errors.length > 0) {
      throw new AppError(
        400,
        ErrorCode.ValidationError,
        'Request validation failed',
        errors,
      );
    }

    next();
  };
}

/**
 * Validates that required fields are present in the request body.
 */
export function requireFields(...fields: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const errors: ErrorDetail[] = [];

    for (const field of fields) {
      if (req.body[field] === undefined || req.body[field] === null) {
        errors.push({ field, message: `${field} is required` });
      }
    }

    if (errors.length > 0) {
      throw new AppError(
        400,
        ErrorCode.ValidationError,
        'Missing required fields',
        errors,
      );
    }

    next();
  };
}

/**
 * Pre-built validation schemas for common operations.
 */
export const registrationSchema: ValidationSchema = {
  email: (value) => validateEmail(String(value || '')),
  password: (value) => validatePassword(String(value || '')),
  fullName: (value) => validateFullName(String(value || '')),
  deliveryAddress: (value) => validateDeliveryAddress(String(value || '')),
};

export const loginSchema: ValidationSchema = {
  email: (value) => validateEmail(String(value || '')),
  password: (value) => {
    const pwd = String(value || '');
    if (!pwd) {
      return { valid: false, errors: ['Password is required'] };
    }
    return { valid: true, errors: [] };
  },
};

export const cartItemSchema: ValidationSchema = {
  productId: (value) => {
    const id = String(value || '');
    if (!id) {
      return { valid: false, errors: ['Product ID is required'] };
    }
    return { valid: true, errors: [] };
  },
  quantity: (value) => validateQuantity(Number(value)),
};

export const quantityUpdateSchema: ValidationSchema = {
  quantity: (value) => {
    const qty = Number(value);
    if (isNaN(qty)) {
      return { valid: false, errors: ['Quantity must be a number'] };
    }
    // Allow 0 for removal, but validate range otherwise
    if (qty < 0) {
      return { valid: false, errors: ['Quantity cannot be negative'] };
    }
    if (qty > 99) {
      return { valid: false, errors: ['Quantity must be at most 99'] };
    }
    return { valid: true, errors: [] };
  },
};

/**
 * Validation schema for password reset request.
 */
export const passwordResetRequestSchema: ValidationSchema = {
  email: (value) => validateEmail(String(value || '')),
};

/**
 * Validation schema for password reset confirmation.
 */
export const passwordResetConfirmSchema: ValidationSchema = {
  token: (value) => {
    const token = String(value || '');
    if (!token) {
      return { valid: false, errors: ['Reset token is required'] };
    }
    return { valid: true, errors: [] };
  },
  newPassword: (value) => validatePassword(String(value || '')),
};

/**
 * Validation schema for token refresh.
 */
export const tokenRefreshSchema: ValidationSchema = {
  refreshToken: (value) => {
    const token = String(value || '');
    if (!token) {
      return { valid: false, errors: ['Refresh token is required'] };
    }
    return { valid: true, errors: [] };
  },
};

/**
 * Validation schema for order confirmation.
 */
export const orderConfirmSchema: ValidationSchema = {
  paymentMethod: (value) => {
    const method = String(value || '');
    const validMethods = ['credit_debit_card', 'digital_wallet'];
    if (!method) {
      return { valid: false, errors: ['Payment method is required'] };
    }
    if (!validMethods.includes(method)) {
      return {
        valid: false,
        errors: [`Payment method must be one of: ${validMethods.join(', ')}`],
      };
    }
    return { valid: true, errors: [] };
  },
  paymentDetails: (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { valid: false, errors: ['Payment details must be an object'] };
    }
    return { valid: true, errors: [] };
  },
};

/**
 * Validation schema for delivery reschedule.
 */
export const deliveryRescheduleSchema: ValidationSchema = {
  newSlotId: (value) => {
    const slotId = String(value || '');
    if (!slotId) {
      return { valid: false, errors: ['New slot ID is required'] };
    }
    return { valid: true, errors: [] };
  },
};
