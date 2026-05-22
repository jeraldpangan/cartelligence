import { Routes } from '@angular/router';
import { CheckoutComponent } from './checkout/checkout.component';
import { OrderConfirmationComponent } from './order-confirmation/order-confirmation.component';

export const ordersRoutes: Routes = [
  {
    path: '',
    redirectTo: 'checkout',
    pathMatch: 'full',
  },
  {
    path: 'checkout',
    component: CheckoutComponent,
  },
  {
    path: 'confirmation/:orderId',
    component: OrderConfirmationComponent,
  },
];
