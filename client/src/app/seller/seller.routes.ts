import { Routes } from '@angular/router';
import { authGuard } from '../auth/auth.guard';
import { roleGuard } from '../auth/role.guard';
import { UserRole } from '@shared/enums';

/**
 * Seller panel routes.
 *
 * All routes require:
 *   1. A valid access token (authGuard)
 *   2. The 'seller' role (roleGuard)
 *
 * Requirements: 7.1, 7.2, 7.5, 7.6
 */
export const sellerRoutes: Routes = [
  {
    path: '',
    canActivate: [authGuard, roleGuard(UserRole.Seller)],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./seller-dashboard/seller-dashboard.component').then(
            (m) => m.SellerDashboardComponent,
          ),
      },
      {
        path: 'register',
        loadComponent: () =>
          import('./seller-registration/seller-registration.component').then(
            (m) => m.SellerRegistrationComponent,
          ),
      },
      {
        path: 'products',
        loadComponent: () =>
          import('./product-management/product-management.component').then(
            (m) => m.ProductManagementComponent,
          ),
      },
      {
        path: 'products/new',
        loadComponent: () =>
          import('./product-form/product-form.component').then(
            (m) => m.ProductFormComponent,
          ),
      },
      {
        path: 'add-product',
        loadComponent: () =>
          import('./seller-product-form/seller-product-form.component').then(
            (m) => m.SellerProductFormComponent,
          ),
      },
      {
        path: 'products/:id/edit',
        loadComponent: () =>
          import('./product-form/product-form.component').then(
            (m) => m.ProductFormComponent,
          ),
      },
      {
        path: 'orders',
        loadComponent: () =>
          import('./order-list/seller-order-list.component').then(
            (m) => m.SellerOrderListComponent,
          ),
      },
      {
        path: 'orders/:id',
        loadComponent: () =>
          import('./order-detail/seller-order-detail.component').then(
            (m) => m.SellerOrderDetailComponent,
          ),
      },
    ],
  },
];
