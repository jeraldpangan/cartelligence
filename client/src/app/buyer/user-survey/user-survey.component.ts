import { Component, OnInit, inject, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatSliderModule } from '@angular/material/slider';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';

export enum ProductCategory {
  Produce = 'produce',
  Dairy = 'dairy',
  Meat = 'meat',
  Snacks = 'snacks',
  PersonalCare = 'personal_care',
  BabiesToys = 'babies_toys',
}

@Component({
  selector: 'app-user-survey',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatSliderModule,
    MatIconModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './user-survey.component.html',
  styleUrl: './user-survey.component.scss',
})
export class UserSurveyComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  // ─── Survey State ──────────────────────────────────────────────────────────
  @Input() isEmbedded = false;
  @Output() surveySaved = new EventEmitter<void>();
  @Output() surveyCancelled = new EventEmitter<void>();

  budget = 100;
  preferredCategories: string[] = [];
  saving = false;
  loading = true;

  // ─── Constants ─────────────────────────────────────────────────────────────
  readonly categoriesList = [
    { value: ProductCategory.Produce, label: 'Fresh Produce', icon: 'spa', color: '#10b981', desc: 'Organic fruits and green vegetables' },
    { value: ProductCategory.Dairy, label: 'Dairy & Eggs', icon: 'egg', color: '#3b82f6', desc: 'Milk, cheese, butter and fresh eggs' },
    { value: ProductCategory.Meat, label: 'Meat & Seafood', icon: 'restaurant', color: '#ef4444', desc: 'Premium cuts, beef, poultry and fish' },
    { value: ProductCategory.Snacks, label: 'Snacks & Sweets', icon: 'cookie', color: '#ec4899', desc: 'Chips, cookies and delicious treats' },
    { value: ProductCategory.PersonalCare, label: 'Personal Care', icon: 'face', color: '#8b5cf6', desc: 'Soaps, hair products and personal wellness' },
    { value: ProductCategory.BabiesToys, label: 'Babies & Toys', icon: 'child_care', color: '#f472b6', desc: 'Baby food, diapers, wipes and children toys' },
  ];

  ngOnInit(): void {
    this.loadSurvey();
  }

  get budgetCategory(): string {
    if (this.budget < 50) return 'Value Shopper 🛒';
    if (this.budget < 150) return 'Balanced Family Plan 🍎';
    return 'Premium & Organic Connoisseur ✨';
  }

  get budgetDescription(): string {
    if (this.budget < 50) return 'Smart, cost-effective recommendations to get the best deals.';
    if (this.budget < 150) return 'A perfect blend of high-quality organic produce and value items.';
    return 'Top-shelf selections, including exclusive organic cuts and gourmet imports.';
  }

  // ─── Survey Management ─────────────────────────────────────────────────────

  loadSurvey(): void {
    this.http.get<{ data: any }>('/api/v1/recommendations/survey').subscribe({
      next: (res) => {
        if (res.data) {
          this.budget = res.data.budget;
          this.preferredCategories = res.data.preferredCategories || [];
        }
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  toggleCategory(category: string): void {
    const idx = this.preferredCategories.indexOf(category);
    if (idx >= 0) {
      this.preferredCategories.splice(idx, 1);
    } else {
      this.preferredCategories.push(category);
    }
  }

  isCategorySelected(category: string): boolean {
    return this.preferredCategories.includes(category);
  }

  saveSurvey(): void {
    if (this.preferredCategories.length === 0) {
      this.snackBar.open('Please select at least one preferred category!', 'Close', { duration: 3000 });
      return;
    }

    this.saving = true;
    const payload = {
      budget: this.budget,
      preferredCategories: this.preferredCategories,
    };

    this.http.post('/api/v1/recommendations/survey', payload).subscribe({
      next: () => {
        this.saving = false;
        this.snackBar.open('🎯 Your shopping preferences have been updated! Loading tailored recommendations...', 'Close', {
          duration: 4000,
          horizontalPosition: 'center',
          verticalPosition: 'top',
        });
        
        if (this.isEmbedded) {
          this.surveySaved.emit();
        } else {
          // Redirect back to buyer landing/catalog
          setTimeout(() => {
            this.router.navigate(['/catalog']);
          }, 1500);
        }
      },
      error: () => {
        this.saving = false;
        this.snackBar.open('Failed to save survey. Please try again.', 'Close', { duration: 3000 });
      },
    });
  }

  cancelSurvey(): void {
    this.surveyCancelled.emit();
  }
}
