import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth';
import { getDatabasePool } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { ErrorCode } from '@shared/errors';

const router = Router();

router.post('/register', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const pool = getDatabasePool();
  const client = await pool.connect();
  
  try {
    const userId = req.user!.sub;
    const { store_name, store_description, store_logo_url, business_registration, support_phone } = req.body;

    if (!store_name) {
      throw new AppError(400, ErrorCode.ValidationError, 'Store name is required');
    }

    await client.query('BEGIN');
    
    // Create seller profile
    await client.query(
      `INSERT INTO seller_profile (user_id, store_name, store_description, store_logo_url, business_registration, support_phone)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, store_name, store_description, store_logo_url, business_registration, support_phone]
    );

    // Update user role to seller
    await client.query(
      `UPDATE user_profile SET role = 'seller' WHERE id = $1`,
      [userId]
    );

    await client.query('COMMIT');
    res.status(201).json({ message: 'Seller registered successfully' });
  } catch (error: any) {
    await client.query('ROLLBACK');
    if (error.code === '23505') { // Unique violation
      next(new AppError(409, ErrorCode.Conflict, 'A store with this name already exists'));
    } else {
      next(error);
    }
  } finally {
    client.release();
  }
});

export default router;
