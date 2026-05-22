import { Routes } from '@angular/router';
import { CatalogPageComponent } from './catalog-page.component';
import { ProductListComponent } from './product-list/product-list.component';
import { ProductDetailComponent } from './product-detail/product-detail.component';

export const catalogRoutes: Routes = [
  {
    path: '',
    component: CatalogPageComponent,
  },
  {
    path: 'category/:categoryId',
    component: ProductListComponent,
  },
  {
    path: 'product/:productId',
    component: ProductDetailComponent,
  },
];
