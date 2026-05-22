import { Routes } from '@angular/router';
import { OrderListComponent } from './order-list/order-list.component';

export const trackingRoutes: Routes = [
  {
    path: '',
    component: OrderListComponent,
  },
];
