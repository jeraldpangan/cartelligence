import { Router, Request, Response, NextFunction } from 'express';
import { ProductService } from '../../services/product.service';
import { AppError } from '../../middleware/errorHandler';
import { ErrorCode } from '@shared/errors';
import { ProductCategory } from '@shared/enums';
import {
  SEARCH_QUERY_MIN_LENGTH,
  SEARCH_QUERY_MAX_LENGTH,
} from '@shared/validation';

const router = Router();
const productService = new ProductService();

/** Set of valid ProductCategory enum values for validation */
const VALID_CATEGORIES = new Set<string>(Object.values(ProductCategory));

/**
 * Ensures numeric prices have exactly 2 decimal places.
 */
function formatPrice(value: number): number {
  return parseFloat(value.toFixed(2));
}

/**
 * GET /api/v1/products/categories
 * Returns all grocery categories.
 * Requirements: 2.1
 */
router.get(
  '/categories',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const categories = await productService.getCategories();
      res.status(200).json({ data: categories });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/v1/products/categories/:id/products
 * Returns paginated products for a given category.
 * Validates category against ProductCategory enum.
 * Returns 200 with empty data and message when no products found.
 * Requirements: 2.2, 2.4, 2.6
 */
router.get(
  '/categories/:id/products',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const categoryId = String(req.params.id);

      // Validate category against ProductCategory enum values
      if (!VALID_CATEGORIES.has(categoryId)) {
        throw new AppError(
          400,
          ErrorCode.ValidationError,
          `Invalid category: '${categoryId}'. Valid categories are: ${Array.from(VALID_CATEGORIES).join(', ')}`,
          [
            {
              field: 'id',
              message: `Category must be one of: ${Array.from(VALID_CATEGORIES).join(', ')}`,
            },
          ],
        );
      }

      const page = parseInt(req.query.page as string, 10) || 1;
      const result = await productService.getProductsByCategory(
        categoryId as ProductCategory,
        page,
      );

      // Format prices to 2 decimal places
      const formattedData = result.data.map((product) => ({
        ...product,
        unitPrice: formatPrice(product.unitPrice),
      }));

      // Return empty result message when no products found
      if (formattedData.length === 0) {
        res.status(200).json({
          data: [],
          page: result.page,
          pageSize: result.pageSize,
          totalItems: 0,
          totalPages: 0,
          message: 'No products found in this category',
        });
        return;
      }

      res.status(200).json({
        data: formattedData,
        page: result.page,
        pageSize: result.pageSize,
        totalItems: result.totalItems,
        totalPages: result.totalPages,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/v1/products/search?q=
 * Searches products by name (case-insensitive).
 * Validates search query length (2-100 chars).
 * Returns 200 with empty data and message when no products found.
 * Requirements: 2.3, 2.4, 2.6
 */
router.get(
  '/search',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = (req.query.q as string) || '';

      // Validate search query length
      if (query.length < SEARCH_QUERY_MIN_LENGTH) {
        throw new AppError(
          400,
          ErrorCode.ValidationError,
          `Search query must be at least ${SEARCH_QUERY_MIN_LENGTH} characters`,
          [
            {
              field: 'q',
              message: `Search query must be at least ${SEARCH_QUERY_MIN_LENGTH} characters`,
            },
          ],
        );
      }

      if (query.length > SEARCH_QUERY_MAX_LENGTH) {
        throw new AppError(
          400,
          ErrorCode.ValidationError,
          `Search query must be at most ${SEARCH_QUERY_MAX_LENGTH} characters`,
          [
            {
              field: 'q',
              message: `Search query must be at most ${SEARCH_QUERY_MAX_LENGTH} characters`,
            },
          ],
        );
      }

      const page = parseInt(req.query.page as string, 10) || 1;
      const result = await productService.searchProducts(query, page);

      // Format prices to 2 decimal places
      const formattedData = result.data.map((product) => ({
        ...product,
        unitPrice: formatPrice(product.unitPrice),
      }));

      // Return empty result message when no products found
      if (formattedData.length === 0) {
        res.status(200).json({
          data: [],
          page: result.page,
          pageSize: result.pageSize,
          totalItems: 0,
          totalPages: 0,
          message: 'No products found matching your search',
        });
        return;
      }

      res.status(200).json({
        data: formattedData,
        page: result.page,
        pageSize: result.pageSize,
        totalItems: result.totalItems,
        totalPages: result.totalPages,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/v1/products/:id
 * Returns a single product by ID.
 * Returns 404 with AppError when product not found.
 * Requirements: 2.4, 10.2
 */
router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const productId = String(req.params.id);

      // Basic UUID format validation
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(productId)) {
        throw new AppError(
          400,
          ErrorCode.ValidationError,
          'Invalid product ID format',
          [{ field: 'id', message: 'Product ID must be a valid UUID' }],
        );
      }

      const product = await productService.getProductById(productId);

      if (!product) {
        throw new AppError(
          404,
          ErrorCode.NotFound,
          'Product not found',
          [{ field: 'id', message: `No product found with ID: ${productId}` }],
        );
      }

      // Format price to 2 decimal places
      const formattedProduct = {
        ...product,
        unitPrice: formatPrice(product.unitPrice),
      };

      res.status(200).json({ data: formattedProduct });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
