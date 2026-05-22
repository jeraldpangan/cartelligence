import { Routes } from '@angular/router';
import { authGuard } from '../auth/auth.guard';
import { roleGuard } from '../auth/role.guard';
import { UserRole } from '@shared/enums';

/**
 * Buyer panel routes.
 *
 * All routes require:
 *   1. A valid access token (authGuard)
 *   2. The 'buyer' role (roleGuard)
 *
 * Requirements: 7.3, 7.4, 7.5
 */
export const buyerRoutes: Routes = [
  {
    path: '',
    canActivate: [authGuard, roleGuard(UserRole.Buyer)],
    children: [
      { path: '', redirectTo: 'catalog', pathMatch: 'full' },
      {
        path: 'catalog',
        loadChildren: () =>
          import('../catalog/catalog.routes').then((m) => m.catalogRoutes),
      },
      {
        path: 'cart',
        loadChildren: () =>
          import('../cart/cart.routes').then((m) => m.cartRoutes),
      },
      {
        path: 'orders',
        loadChildren: () =>
          import('../orders/orders.routes').then((m) => m.ordersRoutes),
      },
      {
        path: 'tracking',
        loadChildren: () =>
          import('../tracking/tracking.routes').then((m) => m.trackingRoutes),
      },
    ],
  },
];
