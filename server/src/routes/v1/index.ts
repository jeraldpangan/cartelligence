import { Router } from 'express';
import authRoutes from './auth.routes';
import productsRoutes from './products.routes';
import cartRoutes from './cart.routes';
import recommendationsRoutes from './recommendations.routes';
import ordersRoutes from './orders.routes';
import deliveryRoutes from './delivery.routes';
import sellerProductsRoutes from './seller-products.routes';
import sellerOrdersRoutes from './seller-orders.routes';
import sellerRoutes from './seller.routes';
import reviewsRoutes from './reviews.routes';
import chatbotRoutes from './chatbot.routes';

const router = Router();

// Health check
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount versioned route groups
router.use('/auth', authRoutes);
router.use('/products', productsRoutes);
router.use('/cart', cartRoutes);
router.use('/recommendations', recommendationsRoutes);
router.use('/orders', ordersRoutes);
router.use('/delivery', deliveryRoutes);
router.use('/seller/products', sellerProductsRoutes);
router.use('/seller/orders', sellerOrdersRoutes);
router.use('/seller', sellerRoutes); // Mounts /seller/register
router.use('/reviews', reviewsRoutes);
router.use('/chatbot', chatbotRoutes);

export default router;
