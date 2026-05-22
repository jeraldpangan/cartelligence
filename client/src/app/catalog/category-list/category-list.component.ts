import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatGridListModule } from '@angular/material/grid-list';
import { CatalogService, CategoryInfo } from '../catalog.service';

@Component({
  selector: 'app-category-list',
  standalone: true,
  imports: [MatCardModule, MatIconModule, MatGridListModule],
  templateUrl: './category-list.component.html',
  styleUrl: './category-list.component.scss',
})
export class CategoryListComponent {
  private readonly catalogService = inject(CatalogService);
  private readonly router = inject(Router);

  readonly categories: CategoryInfo[] = this.catalogService.getCategories();

  onCategorySelect(category: CategoryInfo): void {
    this.router.navigate(['/catalog/category', category.id]);
  }
}
