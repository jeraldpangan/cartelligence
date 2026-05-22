import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';
import { LayoutComponent } from './layout/layout.component';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./auth/register/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: 'password-reset',
    loadComponent: () =>
      import('./auth/password-reset/password-reset.component').then((m) => m.PasswordResetComponent),
  },
  {
    // All authenticated routes share the app shell (header + footer)
    path: '',
    component: LayoutComponent,
    //canActivate: [authGuard],
    children: [
      {
        // Seller panel — lazy-loaded as a separate bundle (Requirement 7.6)
        path: 'seller',
        loadChildren: () =>
          import('./seller/seller.routes').then((m) => m.sellerRoutes),
      },
      {
        // Buyer panel — role-guarded buyer routes
        path: 'buyer',
        loadChildren: () =>
          import('./buyer/buyer.routes').then((m) => m.buyerRoutes),
      },
      {
        path: 'catalog',
        loadChildren: () =>
          import('./catalog/catalog.routes').then((m) => m.catalogRoutes),
      },
      {
        path: 'cart',
        loadChildren: () =>
          import('./cart/cart.routes').then((m) => m.cartRoutes),
      },
      {
        path: 'orders',
        loadChildren: () =>
          import('./orders/orders.routes').then((m) => m.ordersRoutes),
      },
      {
        path: 'tracking',
        loadChildren: () =>
          import('./tracking/tracking.routes').then((m) => m.trackingRoutes),
      },
      { path: '', redirectTo: 'catalog', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
