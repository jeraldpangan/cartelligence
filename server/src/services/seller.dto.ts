import { ProductCategory } from '@shared/enums';
import { ErrorDetail } from '@shared/errors';

/**
 * DTO for creating a new product.
 */
export interface CreateProductDto {
  name: string;
  category: ProductCategory;
  unitPrice: number;
  unit: string;
  stockQuantity: number;
  description?: string;
  nutritionalInfo?: string;
}

/**
 * DTO for updating an existing product.
 * All fields are optional — only provided fields are updated.
 */
export interface UpdateProductDto {
  name?: string;
  category?: ProductCategory;
  unitPrice?: number;
  unit?: string;
  stockQuantity?: number;
  description?: string;
  nutritionalInfo?: string;
}

/** Seller product listing with images */
export interface SellerProduct {
  id: string;
  sellerId: string;
  name: string;
  category: ProductCategory;
  unitPrice: number;
  unit: string;
  stockQuantity: number;
  description: string;
  nutritionalInfo: string;
  isAvailable: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  images: SellerProductImage[];
}

/** Product image metadata */
export interface SellerProductImage {
  id: string;
  url: string;
  filename: string;
  sortOrder: number;
  isPrimary: boolean;
  createdAt: string;
}

/** Validation constants for product fields */
export const PRODUCT_NAME_MIN_LENGTH = 1;
export const PRODUCT_NAME_MAX_LENGTH = 255;
export const PRODUCT_UNIT_MIN_LENGTH = 1;
export const PRODUCT_UNIT_MAX_LENGTH = 50;
export const PRODUCT_UNIT_PRICE_MIN = 0.01;
export const PRODUCT_UNIT_PRICE_MAX = 9999999.99;
export const PRODUCT_STOCK_QUANTITY_MAX = 999999;

/** Valid product categories for validation */
const VALID_CATEGORIES = Object.values(ProductCategory);

/**
 * Validates a CreateProductDto and returns an array of field-level errors.
 * Returns an empty array if all fields are valid.
 */
export function validateCreateProductDto(dto: CreateProductDto): ErrorDetail[] {
  const errors: ErrorDetail[] = [];

  // name: 1–255 characters
  if (!dto.name || dto.name.length < PRODUCT_NAME_MIN_LENGTH) {
    errors.push({ field: 'name', message: `Name must be at least ${PRODUCT_NAME_MIN_LENGTH} character` });
  } else if (dto.name.length > PRODUCT_NAME_MAX_LENGTH) {
    errors.push({ field: 'name', message: `Name must be at most ${PRODUCT_NAME_MAX_LENGTH} characters` });
  }

  // category: valid enum value
  if (!dto.category || !VALID_CATEGORIES.includes(dto.category)) {
    errors.push({ field: 'category', message: `Category must be one of: ${VALID_CATEGORIES.join(', ')}` });
  }

  // unitPrice: 0.01–9999999.99, at most 2 decimal places
  if (dto.unitPrice == null || typeof dto.unitPrice !== 'number' || isNaN(dto.unitPrice)) {
    errors.push({ field: 'unitPrice', message: 'Unit price is required and must be a number' });
  } else {
    if (dto.unitPrice < PRODUCT_UNIT_PRICE_MIN) {
      errors.push({ field: 'unitPrice', message: `Unit price must be at least ${PRODUCT_UNIT_PRICE_MIN}` });
    } else if (dto.unitPrice > PRODUCT_UNIT_PRICE_MAX) {
      errors.push({ field: 'unitPrice', message: `Unit price must be at most ${PRODUCT_UNIT_PRICE_MAX}` });
    }
    // Check at most 2 decimal places
    const decimalStr = dto.unitPrice.toString();
    const decimalIndex = decimalStr.indexOf('.');
    if (decimalIndex !== -1 && decimalStr.length - decimalIndex - 1 > 2) {
      errors.push({ field: 'unitPrice', message: 'Unit price must have at most 2 decimal places' });
    }
  }

  // unit: 1–50 characters
  if (!dto.unit || dto.unit.length < PRODUCT_UNIT_MIN_LENGTH) {
    errors.push({ field: 'unit', message: `Unit must be at least ${PRODUCT_UNIT_MIN_LENGTH} character` });
  } else if (dto.unit.length > PRODUCT_UNIT_MAX_LENGTH) {
    errors.push({ field: 'unit', message: `Unit must be at most ${PRODUCT_UNIT_MAX_LENGTH} characters` });
  }

  // stockQuantity: non-negative integer ≤ 999999
  if (dto.stockQuantity == null || typeof dto.stockQuantity !== 'number') {
    errors.push({ field: 'stockQuantity', message: 'Stock quantity is required and must be a number' });
  } else {
    if (!Number.isInteger(dto.stockQuantity)) {
      errors.push({ field: 'stockQuantity', message: 'Stock quantity must be a whole number' });
    }
    if (dto.stockQuantity < 0) {
      errors.push({ field: 'stockQuantity', message: 'Stock quantity must be non-negative' });
    }
    if (dto.stockQuantity > PRODUCT_STOCK_QUANTITY_MAX) {
      errors.push({ field: 'stockQuantity', message: `Stock quantity must be at most ${PRODUCT_STOCK_QUANTITY_MAX}` });
    }
  }

  return errors;
}

/**
 * Validates an UpdateProductDto and returns an array of field-level errors.
 * Only validates fields that are present (non-undefined).
 * Returns an empty array if all provided fields are valid.
 */
export function validateUpdateProductDto(dto: UpdateProductDto): ErrorDetail[] {
  const errors: ErrorDetail[] = [];

  // name: 1–255 characters (if provided)
  if (dto.name !== undefined) {
    if (!dto.name || dto.name.length < PRODUCT_NAME_MIN_LENGTH) {
      errors.push({ field: 'name', message: `Name must be at least ${PRODUCT_NAME_MIN_LENGTH} character` });
    } else if (dto.name.length > PRODUCT_NAME_MAX_LENGTH) {
      errors.push({ field: 'name', message: `Name must be at most ${PRODUCT_NAME_MAX_LENGTH} characters` });
    }
  }

  // category: valid enum value (if provided)
  if (dto.category !== undefined) {
    if (!VALID_CATEGORIES.includes(dto.category)) {
      errors.push({ field: 'category', message: `Category must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }
  }

  // unitPrice: 0.01–9999999.99, at most 2 decimal places (if provided)
  if (dto.unitPrice !== undefined) {
    if (typeof dto.unitPrice !== 'number' || isNaN(dto.unitPrice)) {
      errors.push({ field: 'unitPrice', message: 'Unit price must be a number' });
    } else {
      if (dto.unitPrice < PRODUCT_UNIT_PRICE_MIN) {
        errors.push({ field: 'unitPrice', message: `Unit price must be at least ${PRODUCT_UNIT_PRICE_MIN}` });
      } else if (dto.unitPrice > PRODUCT_UNIT_PRICE_MAX) {
        errors.push({ field: 'unitPrice', message: `Unit price must be at most ${PRODUCT_UNIT_PRICE_MAX}` });
      }
      const decimalStr = dto.unitPrice.toString();
      const decimalIndex = decimalStr.indexOf('.');
      if (decimalIndex !== -1 && decimalStr.length - decimalIndex - 1 > 2) {
        errors.push({ field: 'unitPrice', message: 'Unit price must have at most 2 decimal places' });
      }
    }
  }

  // unit: 1–50 characters (if provided)
  if (dto.unit !== undefined) {
    if (!dto.unit || dto.unit.length < PRODUCT_UNIT_MIN_LENGTH) {
      errors.push({ field: 'unit', message: `Unit must be at least ${PRODUCT_UNIT_MIN_LENGTH} character` });
    } else if (dto.unit.length > PRODUCT_UNIT_MAX_LENGTH) {
      errors.push({ field: 'unit', message: `Unit must be at most ${PRODUCT_UNIT_MAX_LENGTH} characters` });
    }
  }

  // stockQuantity: non-negative integer ≤ 999999 (if provided)
  if (dto.stockQuantity !== undefined) {
    if (typeof dto.stockQuantity !== 'number') {
      errors.push({ field: 'stockQuantity', message: 'Stock quantity must be a number' });
    } else {
      if (!Number.isInteger(dto.stockQuantity)) {
        errors.push({ field: 'stockQuantity', message: 'Stock quantity must be a whole number' });
      }
      if (dto.stockQuantity < 0) {
        errors.push({ field: 'stockQuantity', message: 'Stock quantity must be non-negative' });
      }
      if (dto.stockQuantity > PRODUCT_STOCK_QUANTITY_MAX) {
        errors.push({ field: 'stockQuantity', message: `Stock quantity must be at most ${PRODUCT_STOCK_QUANTITY_MAX}` });
      }
    }
  }

  return errors;
}
