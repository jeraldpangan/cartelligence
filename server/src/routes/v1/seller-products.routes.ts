import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth';
import { requireRole } from '../../middleware/auth';
import { SellerService } from '../../services/seller.service';
import { uploadMiddleware } from '../../config/upload';
import { CreateProductDto, UpdateProductDto } from '../../services/seller.dto';
import { ProductCategory, UserRole } from '@shared/enums';
import { AppError } from '../../middleware/errorHandler';
import { ErrorCode } from '@shared/errors';

const router = Router();
const sellerService = new SellerService();

/** UUID format regex for param validation */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates that a route param is a valid UUID.
 */
function validateUuidParam(id: string, paramName: string): void {
  if (!UUID_REGEX.test(id)) {
    throw new AppError(
      400,
      ErrorCode.ValidationError,
      `Invalid ${paramName} format`,
      [{ field: paramName, message: `${paramName} must be a valid UUID` }],
    );
  }
}

/**
 * Parses numeric fields from multipart form data (strings) into a CreateProductDto.
 */
function parseCreateProductBody(body: Record<string, unknown>): CreateProductDto {
  return {
    name: body.name as string,
    category: body.category as ProductCategory,
    unitPrice: parseFloat(body.unitPrice as string),
    unit: body.unit as string,
    stockQuantity: parseInt(body.stockQuantity as string, 10),
    description: body.description as string | undefined,
    nutritionalInfo: body.nutritionalInfo as string | undefined,
  };
}

/**
 * Parses numeric fields from request body into an UpdateProductDto.
 * Only includes fields that are present in the body.
 */
function parseUpdateProductBody(body: Record<string, unknown>): UpdateProductDto {
  const dto: UpdateProductDto = {};

  if (body.name !== undefined) dto.name = body.name as string;
  if (body.category !== undefined) dto.category = body.category as ProductCategory;
  if (body.unitPrice !== undefined) dto.unitPrice = parseFloat(body.unitPrice as string);
  if (body.unit !== undefined) dto.unit = body.unit as string;
  if (body.stockQuantity !== undefined) dto.stockQuantity = parseInt(body.stockQuantity as string, 10);
  if (body.description !== undefined) dto.description = body.description as string;
  if (body.nutritionalInfo !== undefined) dto.nutritionalInfo = body.nutritionalInfo as string;

  return dto;
}

// Apply authentication and role middleware to all routes in this router
router.use(authenticate);
router.use(requireRole(UserRole.Seller));

/**
 * GET /api/v1/seller/products
 * List seller's products (paginated).
 * Query params: page (default 1)
 * Requirements: 2.2
 */
router.get(
  '/',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const sellerId = req.user!.sub;
      const page = parseInt(req.query.page as string, 10) || 1;

      const result = await sellerService.getSellerProducts(sellerId, page);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/v1/seller/products/:id
 * Get product detail (ownership verified).
 * Requirements: 2.3, 2.7
 */
router.get(
  '/:id',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const sellerId = req.user!.sub;
      const productId = String(req.params.id);

      validateUuidParam(productId, 'id');

      const product = await sellerService.getSellerProductById(sellerId, productId);

      res.status(200).json({ data: product });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/seller/products
 * Create product (multipart/form-data with Multer).
 * Accepts up to 5 images in the 'images' field.
 * Requirements: 2.1, 2.6, 2.8, 3.1, 3.2, 3.3
 */
router.post(
  '/',
  uploadMiddleware.array('images', 5),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const sellerId = req.user!.sub;
      const dto = parseCreateProductBody(req.body);
      const images = (req.files as Express.Multer.File[]) || [];

      const product = await sellerService.createProduct(sellerId, dto, images);

      res.status(201).json({ data: product });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PUT /api/v1/seller/products/:id
 * Update product.
 * Requirements: 2.3, 2.6, 2.7, 2.8
 */
router.put(
  '/:id',
  uploadMiddleware.array('images', 5),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const sellerId = req.user!.sub;
      const productId = String(req.params.id);

      validateUuidParam(productId, 'id');

      const dto = parseUpdateProductBody(req.body);
      const images = (req.files as Express.Multer.File[]) || [];

      const product = await sellerService.updateProduct(sellerId, productId, dto, images);

      res.status(200).json({ data: product });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * DELETE /api/v1/seller/products/:id
 * Soft-delete product.
 * Requirements: 2.4, 2.7
 */
router.delete(
  '/:id',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const sellerId = req.user!.sub;
      const productId = String(req.params.id);

      validateUuidParam(productId, 'id');

      await sellerService.deleteProduct(sellerId, productId);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PATCH /api/v1/seller/products/:id/availability
 * Toggle product availability.
 * Requirements: 2.5, 2.7
 */
router.patch(
  '/:id/availability',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const sellerId = req.user!.sub;
      const productId = String(req.params.id);

      validateUuidParam(productId, 'id');

      const product = await sellerService.toggleAvailability(sellerId, productId);

      res.status(200).json({ data: product });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
